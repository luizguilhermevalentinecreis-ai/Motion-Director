import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const client = new Client({ name: "motion-director-live-preview", version: "0.1.0" });
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
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await client.callTool({ name: "studio_status", arguments: {} });
    if ((JSON.parse(textResult(status)) as { connected: boolean }).connected) break;
    await sleep(500);
  }
  const preview = await client.callTool({
    name: "preview_committed_synchronized_multi_rig_animation",
    arguments: {
      animationName: "MCP_R15_CinematicDuel_15s_V2",
      looped: false,
      playbackSpeed: 1,
    },
  });
  if (preview.isError) throw new Error(textResult(preview));
  process.stdout.write(`${textResult(preview)}\n`);
  await sleep(1000);
} finally {
  await client.close();
}
