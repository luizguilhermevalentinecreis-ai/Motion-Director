import assert from "node:assert/strict";
import test from "node:test";
import { MotionDirectorWebRelay } from "../src/web-relay.js";

function randomPort(): number {
  return 35_000 + Math.floor(Math.random() * 10_000);
}

async function post(baseUrl: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("pairs a GPT action with a Studio plugin and returns an async result", async () => {
  const port = randomPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const relay = new MotionDirectorWebRelay({
    host: "127.0.0.1",
    port,
    publicBaseUrl: baseUrl,
    sessionTtlMs: 10_000,
  });
  await relay.start();
  try {
    const connectResponse = await post(baseUrl, "/plugin/connect", {
      installationId: "test-installation",
      placeId: 123,
      placeName: "Relay test place",
      pluginVersion: "0.3.0",
    });
    assert.equal(connectResponse.status, 200);
    const connection = (await connectResponse.json()) as {
      sessionId: string;
      agentToken: string;
      pairingCode: string;
    };
    assert.match(connection.pairingCode, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);

    const statusResponse = await post(baseUrl, "/v1/actions/studio-status", {
      pairingCode: connection.pairingCode,
    });
    assert.equal(statusResponse.status, 200);
    const status = (await statusResponse.json()) as { connected: boolean };
    assert.equal(status.connected, true);

    const executeResponse = await post(baseUrl, "/v1/actions/execute", {
      pairingCode: connection.pairingCode,
      action: "getSceneSelection",
      input: { includeDescendants: true, maxDepth: 4 },
    });
    assert.equal(executeResponse.status, 202);
    const queued = (await executeResponse.json()) as { jobId: string };

    const pollResponse = await post(baseUrl, "/plugin/poll", {
      sessionId: connection.sessionId,
      agentToken: connection.agentToken,
    });
    assert.equal(pollResponse.status, 200);
    const polled = (await pollResponse.json()) as {
      command: { id: string; method: string; params: unknown };
    };
    assert.equal(polled.command.method, "scene.getSelection");

    const resultResponse = await post(baseUrl, "/plugin/result", {
      sessionId: connection.sessionId,
      agentToken: connection.agentToken,
      id: polled.command.id,
      ok: true,
      result: { count: 1, selected: ["Workspace.Rig"] },
    });
    assert.equal(resultResponse.status, 200);

    const jobResponse = await post(baseUrl, "/v1/actions/job", {
      pairingCode: connection.pairingCode,
      jobId: queued.jobId,
    });
    assert.equal(jobResponse.status, 200);
    const job = (await jobResponse.json()) as {
      status: string;
      result: { selected: string[] };
    };
    assert.equal(job.status, "succeeded");
    assert.deepEqual(job.result.selected, ["Workspace.Rig"]);
  } finally {
    await relay.stop();
  }
});

test("requires confirmation for writes and rejects forged plugin tokens", async () => {
  const port = randomPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const relay = new MotionDirectorWebRelay({
    host: "127.0.0.1",
    port,
    publicBaseUrl: baseUrl,
    sessionTtlMs: 10_000,
  });
  await relay.start();
  try {
    const connectResponse = await post(baseUrl, "/plugin/connect", {
      installationId: "security-test-installation",
      placeName: "Security test",
    });
    const connection = (await connectResponse.json()) as {
      sessionId: string;
      agentToken: string;
      pairingCode: string;
    };

    const writeResponse = await post(baseUrl, "/v1/actions/execute", {
      pairingCode: connection.pairingCode,
      action: "commitAnimationDraft",
      input: { transactionId: "tx-1", destinationName: "Take01" },
      confirmWrite: false,
    });
    assert.equal(writeResponse.status, 409);
    const writeError = (await writeResponse.json()) as { requiresConfirmation: boolean };
    assert.equal(writeError.requiresConfirmation, true);

    const forgedPoll = await post(baseUrl, "/plugin/poll", {
      sessionId: connection.sessionId,
      agentToken: `${connection.agentToken}forged`,
    });
    assert.equal(forgedPoll.status, 401);
  } finally {
    await relay.stop();
  }
});

test("serves a GPT-compatible OpenAPI document and privacy policy", async () => {
  const port = randomPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const relay = new MotionDirectorWebRelay({
    host: "127.0.0.1",
    port,
    publicBaseUrl: baseUrl,
  });
  await relay.start();
  try {
    const openApiResponse = await fetch(`${baseUrl}/openapi.json`);
    assert.equal(openApiResponse.status, 200);
    const document = (await openApiResponse.json()) as {
      openapi: string;
      servers: Array<{ url: string }>;
      paths: Record<string, unknown>;
    };
    assert.equal(document.openapi, "3.1.0");
    assert.equal(document.servers[0]?.url, baseUrl);
    assert.ok(document.paths["/v1/actions/execute"]);

    const privacyResponse = await fetch(`${baseUrl}/privacy`);
    assert.equal(privacyResponse.status, 200);
    assert.match(await privacyResponse.text(), /Motion Director Privacy Policy/);
  } finally {
    await relay.stop();
  }
});
