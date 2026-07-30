import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);

const client = new Client({
  name: "motion-director-open-place-inspector",
  version: "0.1.0",
});

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/src/index.js"],
  cwd: process.cwd(),
  env: environment,
  stderr: "pipe",
});

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function textResult(result: unknown): string {
  const content =
    result && typeof result === "object" && "content" in result
      ? (result as { content?: unknown }).content
      : undefined;
  const block = Array.isArray(content)
    ? content.find(
        (item): item is { type: "text"; text: string } =>
          Boolean(
            item &&
              typeof item === "object" &&
              "type" in item &&
              item.type === "text" &&
              "text" in item &&
              typeof item.text === "string",
          ),
      )
    : undefined;
  return block?.text ?? "";
}

try {
  await client.connect(transport);

  let connected = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await client.callTool({ name: "studio_status", arguments: {} });
    const parsed = JSON.parse(textResult(status)) as { connected: boolean };
    if (parsed.connected) {
      connected = true;
      process.stdout.write(`STATUS\n${textResult(status)}\n`);
      break;
    }
    await sleep(500);
  }
  if (!connected) throw new Error("The open Roblox Studio place did not connect to the MCP bridge.");

  const capabilities = await client.callTool({
    name: "studio_animation_capabilities",
    arguments: {},
  });
  if (capabilities.isError) throw new Error(textResult(capabilities));

  const selection = await client.callTool({
    name: "get_scene_selection",
    arguments: { includeDescendants: true, maxDepth: 5 },
  });
  process.stdout.write(`SELECTION\n${textResult(selection)}\n`);

  const rig = await client.callTool({
    name: "inspect_rig",
    arguments: { includeGeometryBounds: true },
  });
  process.stdout.write(`RIG\n${textResult(rig)}\n`);
} finally {
  await client.close();
}
