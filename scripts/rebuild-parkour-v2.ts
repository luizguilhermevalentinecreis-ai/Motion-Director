import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const env = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const client = new Client({ name: "motion-director-parkour-v2", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/src/index.js"],
  cwd: process.cwd(),
  env,
  stderr: "pipe",
});
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function text(result: unknown): string {
  const content = result && typeof result === "object" && "content" in result
    ? (result as { content?: unknown }).content : undefined;
  if (!Array.isArray(content)) return "";
  const block = content.find((item) =>
    item && typeof item === "object" && "type" in item && item.type === "text" &&
    "text" in item && typeof item.text === "string",
  ) as { text?: string } | undefined;
  return block?.text ?? "";
}

try {
  await client.connect(transport);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const status = await client.callTool({ name: "studio_status", arguments: {} });
    if ((JSON.parse(text(status)) as { connected: boolean }).connected) break;
    await sleep(500);
  }
  const capabilities = await client.callTool({
    name: "studio_animation_capabilities",
    arguments: {},
  });
  if (capabilities.isError) throw new Error(text(capabilities));
  const rebuilt = await client.callTool({
    name: "rebuild_calibrated_r15_parkour_suite_v2",
    arguments: {},
  });
  if (rebuilt.isError) throw new Error(text(rebuilt));
  process.stdout.write(`REBUILT\n${text(rebuilt)}\n`);

  const attached = await client.callTool({
    name: "attach_committed_animations_to_selected_rig_animsaves",
    arguments: { namePrefix: "MD_ParkourV2_" },
  });
  if (attached.isError) throw new Error(text(attached));
  process.stdout.write(`ATTACHED\n${text(attached)}\n`);
} finally {
  await client.close();
}
