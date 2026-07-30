import assert from "node:assert/strict";
import test from "node:test";
import { StudioBridge } from "../src/bridge.js";

const headers = {
  "content-type": "application/json",
  "x-roblox-motion-bridge": "1",
};

test("bridges one Studio command and result over loopback", async () => {
  const port = 34819;
  const bridge = new StudioBridge("127.0.0.1", port);
  await bridge.start();

  try {
    const connectResponse = await fetch(`http://127.0.0.1:${port}/plugin/connect`, {
      method: "POST",
      headers,
      body: JSON.stringify({ studioUserId: 42, placeName: "Bridge Test" }),
    });
    assert.equal(connectResponse.status, 200);
    const connected = (await connectResponse.json()) as { sessionId: string };

    const execution = bridge.execute("rig.inspect", { includeGeometryBounds: true });
    const pollResponse = await fetch(`http://127.0.0.1:${port}/plugin/poll`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionId: connected.sessionId }),
    });
    const polled = (await pollResponse.json()) as {
      command: { id: string; method: string };
    };
    assert.equal(polled.command.method, "rig.inspect");

    const resultResponse = await fetch(`http://127.0.0.1:${port}/plugin/result`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        sessionId: connected.sessionId,
        id: polled.command.id,
        ok: true,
        result: { rigType: "R15" },
      }),
    });
    assert.equal(resultResponse.status, 200);
    assert.deepEqual(await execution, { rigType: "R15" });
  } finally {
    await bridge.stop();
  }
});

test("rejects browser-originated bridge requests", async () => {
  const port = 34820;
  const bridge = new StudioBridge("127.0.0.1", port);
  await bridge.start();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/plugin/connect`, {
      method: "POST",
      headers: { ...headers, origin: "https://malicious.example" },
      body: "{}",
    });
    assert.equal(response.status, 403);
  } finally {
    await bridge.stop();
  }
});
