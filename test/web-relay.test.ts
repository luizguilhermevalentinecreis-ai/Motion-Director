import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
      launchId: "test-launch",
      placeId: 123,
      placeName: "Relay test place",
      pluginVersion: "0.5.0",
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

test("creates a compact authored draft and stages it by draftId", async () => {
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
      installationId: "draft-authoring-installation",
      launchId: "draft-authoring-launch",
      placeName: "Draft authoring test",
    });
    const connection = (await connectResponse.json()) as {
      sessionId: string;
      agentToken: string;
      pairingCode: string;
    };
    const createResponse = await post(baseUrl, "/v1/drafts/create", {
      pairingCode: connection.pairingCode,
      blueprint: {
        name: "M1_01",
        rigId: "Workspace.Rig",
        rigType: "R6",
        duration: 0.45,
        framesPerSecond: 30,
        priority: "action",
        intent: "A grounded hand-first M1.",
        style: ["r6", "combat", "m1"],
        tracks: [
          {
            joint: "Torso",
            keys: [
              { time: 0, rotationDegrees: { x: 0, y: 0, z: 0 } },
              { time: 0.3, rotationDegrees: { x: 7, y: 18, z: -3 } },
            ],
          },
          {
            joint: "Right Arm",
            keys: [
              { time: 0, rotationDegrees: { x: 0, y: 0, z: 0 } },
              { time: 0.3, rotationDegrees: { x: -70, y: 8, z: -12 } },
            ],
          },
        ],
      },
    });
    assert.equal(createResponse.status, 200);
    const created = (await createResponse.json()) as {
      draftId: string;
      summary: { keyCount: number };
    };
    assert.match(created.draftId, /^[0-9a-f-]{36}$/);
    assert.equal(created.summary.keyCount, 4);

    const validateResponse = await post(baseUrl, "/v1/actions/execute", {
      pairingCode: connection.pairingCode,
      action: "validateAnimationDraft",
      input: { draftId: created.draftId },
    });
    assert.equal(validateResponse.status, 200);

    const stageResponse = await post(baseUrl, "/v1/actions/execute", {
      pairingCode: connection.pairingCode,
      action: "stageAnimationDraft",
      confirmWrite: true,
      input: { transactionName: "M1_01 review", draftId: created.draftId },
    });
    assert.equal(stageResponse.status, 202);

    const pollResponse = await post(baseUrl, "/plugin/poll", {
      sessionId: connection.sessionId,
      agentToken: connection.agentToken,
    });
    const polled = (await pollResponse.json()) as {
      command: { method: string; params: { transactionName: string; draft: { name: string } } };
    };
    assert.equal(polled.command.method, "animation.stageDraft");
    assert.equal(polled.command.params.transactionName, "M1_01 review");
    assert.equal(polled.command.params.draft.name, "M1_01");
  } finally {
    await relay.stop();
  }
});

test("translates inspectAnimation pages into bounded plugin sections", async () => {
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
      installationId: "pagination-test-installation",
      launchId: "pagination-test-launch",
      pairingCode: "PAGES-23456",
      placeName: "Pagination test",
    });
    const connection = (await connectResponse.json()) as {
      sessionId: string;
      agentToken: string;
      pairingCode: string;
    };

    const executeResponse = await post(baseUrl, "/v1/actions/execute", {
      pairingCode: connection.pairingCode,
      action: "inspectAnimation",
      input: {
        sourcePath: "ServerStorage.RBX_ANIMSAVES.kj anims.Ravage Start",
        section: "raw",
        page: 3,
        pageSize: 1,
      },
    });
    assert.equal(executeResponse.status, 202);

    const pollResponse = await post(baseUrl, "/plugin/poll", {
      sessionId: connection.sessionId,
      agentToken: connection.agentToken,
    });
    assert.equal(pollResponse.status, 200);
    const polled = (await pollResponse.json()) as {
      command: { method: string; params: Record<string, unknown> };
    };
    assert.equal(polled.command.method, "analysis.inspectAnimation");
    assert.deepEqual(polled.command.params, {
      sourcePath: "ServerStorage.RBX_ANIMSAVES.kj anims.Ravage Start",
      page: 3,
      pageSize: 1,
      rawStart: 2,
      rawCount: 1,
      sampleStart: 2,
      sampleCount: 1,
      sampleRate: 60,
      includeRig: false,
      includeRaw: true,
      includeSamples: false,
      includeMetrics: false,
    });
  } finally {
    await relay.stop();
  }
});

test("stages bounded in-Studio R6 to R15 retargeting without transmitting pose matrices", async () => {
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
      installationId: "retarget-test-installation",
      launchId: "retarget-test-launch",
      pairingCode: "R6R15-23456",
      placeName: "Retarget test",
    });
    const connection = (await connectResponse.json()) as {
      sessionId: string;
      agentToken: string;
      pairingCode: string;
    };

    const executeResponse = await post(baseUrl, "/v1/actions/execute", {
      pairingCode: connection.pairingCode,
      action: "stageR6ToR15Retarget",
      confirmWrite: true,
      input: {
        transactionName: "Ravage Succsess R15 conversion",
        sourcePath: "ServerStorage.RBX_ANIMSAVES.kj anims.Ravage Succsess",
        sourceRigPath: "Workspace.References.kj anims",
        targetRigPath: "Workspace.R15",
        outputName: "Ravage Succsess R15",
        legLateralScale: 0,
        maxLegLateralOffset: 0.1,
      },
    });
    assert.equal(executeResponse.status, 202);

    const pollResponse = await post(baseUrl, "/plugin/poll", {
      sessionId: connection.sessionId,
      agentToken: connection.agentToken,
    });
    const polled = (await pollResponse.json()) as {
      command: { method: string; params: Record<string, unknown> };
    };
    assert.equal(polled.command.method, "animation.stageR6ToR15Retarget");
    assert.deepEqual(polled.command.params, {
      transactionName: "Ravage Succsess R15 conversion",
      sourcePath: "ServerStorage.RBX_ANIMSAVES.kj anims.Ravage Succsess",
      sourceRigPath: "Workspace.References.kj anims",
      targetRigPath: "Workspace.R15",
      outputName: "Ravage Succsess R15",
      sourceSelectionIndex: 1,
      targetSelectionIndex: 2,
      legLateralScale: 0,
      maxLegLateralOffset: 0.1,
    });
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
      launchId: "security-test-launch",
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

test("keeps a user's connection code stable across reconnects and plugin launches", async () => {
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
    const firstResponse = await post(baseUrl, "/plugin/connect", {
      installationId: "stable-code-installation",
      launchId: "same-plugin-launch",
      pairingCode: "ABCDE-FGHJK",
      placeName: "Reconnect test",
    });
    const first = (await firstResponse.json()) as {
      sessionId: string;
      agentToken: string;
      pairingCode: string;
    };

    const reconnectResponse = await post(baseUrl, "/plugin/connect", {
      installationId: "stable-code-installation",
      launchId: "same-plugin-launch",
      pairingCode: "ABCDE-FGHJK",
      placeName: "Reconnect test",
    });
    const reconnect = (await reconnectResponse.json()) as {
      sessionId: string;
      agentToken: string;
      pairingCode: string;
    };

    assert.equal(reconnect.sessionId, first.sessionId);
    assert.equal(reconnect.pairingCode, first.pairingCode);
    assert.notEqual(reconnect.agentToken, first.agentToken);

    const oldTokenPoll = await post(baseUrl, "/plugin/poll", {
      sessionId: first.sessionId,
      agentToken: first.agentToken,
    });
    assert.equal(oldTokenPoll.status, 401);

    const newTokenPoll = await post(baseUrl, "/plugin/poll", {
      sessionId: reconnect.sessionId,
      agentToken: reconnect.agentToken,
    });
    assert.equal(newTokenPoll.status, 200);

    const reopenedResponse = await post(baseUrl, "/plugin/connect", {
      installationId: "stable-code-installation",
      launchId: "new-plugin-launch",
      pairingCode: "ABCDE-FGHJK",
      placeName: "Reconnect test",
    });
    const reopened = (await reopenedResponse.json()) as {
      sessionId: string;
      pairingCode: string;
    };
    assert.notEqual(reopened.sessionId, first.sessionId);
    assert.equal(reopened.pairingCode, first.pairingCode);
  } finally {
    await relay.stop();
  }
});

test("restores the user's connection code after the relay expires its session", async () => {
  const port = randomPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const relay = new MotionDirectorWebRelay({
    host: "127.0.0.1",
    port,
    publicBaseUrl: baseUrl,
    sessionTtlMs: 25,
  });
  await relay.start();
  try {
    const connectionBody = {
      installationId: "expired-session-installation",
      launchId: "persistent-plugin-launch",
      pairingCode: "23456-789AB",
      placeName: "Expiration test",
    };
    const firstResponse = await post(baseUrl, "/plugin/connect", connectionBody);
    const first = (await firstResponse.json()) as { pairingCode: string };
    assert.equal(first.pairingCode, connectionBody.pairingCode);

    await new Promise((resolve) => setTimeout(resolve, 40));
    const healthResponse = await fetch(`${baseUrl}/health`);
    assert.equal(healthResponse.status, 200);

    const reconnectResponse = await post(baseUrl, "/plugin/connect", connectionBody);
    const reconnect = (await reconnectResponse.json()) as { pairingCode: string };
    assert.equal(reconnect.pairingCode, first.pairingCode);
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
      info: { version: string };
      servers: Array<{ url: string }>;
      paths: Record<
        string,
        {
          post?: {
            requestBody?: {
              content?: {
                "application/json"?: {
                  schema?: {
                    properties?: {
                      input?: {
                        properties?: Record<string, unknown>;
                      };
                    };
                  };
                };
              };
            };
          };
        }
      >;
    };
    assert.equal(document.openapi, "3.1.0");
    assert.equal(document.info.version, "0.6.1");
    assert.equal(document.servers[0]?.url, baseUrl);
    assert.ok(document.paths["/v1/knowledge/global"]);
    assert.ok(document.paths["/v1/knowledge/propose"]);
    assert.ok(document.paths["/v1/actions/execute"]);
    assert.ok(document.paths["/v1/drafts/create"]);
    const actionInput =
      document.paths["/v1/actions/execute"]?.post?.requestBody?.content?.["application/json"]
        ?.schema?.properties?.input?.properties;
    assert.ok(actionInput?.transactionName);
    assert.ok(actionInput?.draftId);
    assert.ok(actionInput?.blueprint);
    assert.ok(actionInput?.draft);
    assert.ok(actionInput?.sourcePath);
    assert.ok(actionInput?.section);
    assert.ok(actionInput?.rawCount);
    assert.ok(actionInput?.sourceRigPath);
    assert.ok(actionInput?.targetRigPath);
    assert.ok(actionInput?.legLateralScale);
    assert.ok(
      (
        actionInput?.draft as {
          properties?: { tracks?: { items?: { properties?: Record<string, unknown> } } };
        }
      )?.properties?.tracks?.items?.properties?.keys,
    );

    const privacyResponse = await fetch(`${baseUrl}/privacy`);
    assert.equal(privacyResponse.status, 200);
    assert.match(await privacyResponse.text(), /Motion Director Privacy Policy/);
  } finally {
    await relay.stop();
  }
});

test("publishes developer-approved global knowledge across relay restarts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "motion-director-knowledge-"));
  const knowledgeFilePath = join(directory, "global.json");
  const installationId = "developer-installation";
  const firstPort = randomPort();
  const firstBaseUrl = `http://127.0.0.1:${firstPort}`;
  const firstRelay = new MotionDirectorWebRelay({
    host: "127.0.0.1",
    port: firstPort,
    publicBaseUrl: firstBaseUrl,
    knowledgeFilePath,
    developerInstallationIds: [installationId],
  });
  try {
    await firstRelay.start();
    const connectionResponse = await post(firstBaseUrl, "/plugin/connect", {
      installationId,
      launchId: "knowledge-launch",
      pairingCode: "DEVKN-OWLED",
      pluginVersion: "0.6.0",
    });
    assert.equal(connectionResponse.status, 200);
    const connection = await connectionResponse.json() as {
      sessionId: string;
      agentToken: string;
      pairingCode: string;
      knowledgeRole: string;
    };
    assert.equal(connection.knowledgeRole, "developer");

    const proposalResponse = await post(firstBaseUrl, "/v1/knowledge/propose", {
      pairingCode: connection.pairingCode,
      category: "R6 posing",
      title: "Preserve real pivots",
      principle: "Translate the torso first and rotate rigid limbs around their real pivots.",
      rationale: "Large local limb translations disconnect block rigs visually.",
      appliesTo: ["R6", "pose studies"],
      evidence: ["Creator Hub recommends moving the torso/root during pose construction."],
    });
    assert.equal(proposalResponse.status, 202);
    const proposed = await proposalResponse.json() as {
      proposal: { id: string; status: string };
    };
    assert.equal(proposed.proposal.status, "pending");

    const pollResponse = await post(firstBaseUrl, "/plugin/poll", {
      sessionId: connection.sessionId,
      agentToken: connection.agentToken,
    });
    const poll = await pollResponse.json() as {
      pendingKnowledge: { id: string };
    };
    assert.equal(poll.pendingKnowledge.id, proposed.proposal.id);

    const readerConnectionResponse = await post(firstBaseUrl, "/plugin/connect", {
      installationId: "public-reader-installation",
      launchId: "reader-launch",
      pluginVersion: "0.6.0",
    });
    const readerConnection = await readerConnectionResponse.json() as {
      sessionId: string;
      agentToken: string;
      knowledgeRole: string;
    };
    assert.equal(readerConnection.knowledgeRole, "reader");
    const forbiddenCommit = await post(firstBaseUrl, "/plugin/knowledge/resolve", {
      sessionId: readerConnection.sessionId,
      agentToken: readerConnection.agentToken,
      proposalId: proposed.proposal.id,
      decision: "commit",
    });
    assert.equal(forbiddenCommit.status, 403);

    const commitResponse = await post(firstBaseUrl, "/plugin/knowledge/resolve", {
      sessionId: connection.sessionId,
      agentToken: connection.agentToken,
      proposalId: proposed.proposal.id,
      decision: "commit",
    });
    assert.equal(commitResponse.status, 200);
    const committed = await commitResponse.json() as {
      status: string;
      snapshot: { version: number };
    };
    assert.equal(committed.status, "globally_published");
    assert.equal(committed.snapshot.version, 1);
  } finally {
    await firstRelay.stop();
  }

  const secondPort = randomPort();
  const secondBaseUrl = `http://127.0.0.1:${secondPort}`;
  const secondRelay = new MotionDirectorWebRelay({
    host: "127.0.0.1",
    port: secondPort,
    publicBaseUrl: secondBaseUrl,
    knowledgeFilePath,
  });
  try {
    await secondRelay.start();
    const snapshotResponse = await post(secondBaseUrl, "/v1/knowledge/global", {});
    assert.equal(snapshotResponse.status, 200);
    const snapshot = await snapshotResponse.json() as {
      version: number;
      entries: Array<Record<string, unknown>>;
    };
    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.entries[0]?.title, "Preserve real pivots");
    assert.equal("publishedBy" in (snapshot.entries[0] ?? {}), false);
  } finally {
    await secondRelay.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
