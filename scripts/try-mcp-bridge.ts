import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({
  name: "motion-director-manual-try",
  version: "0.1.0",
});

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/src/index.js"],
  cwd: process.cwd(),
  env: Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  ),
  stderr: "pipe",
});

await client.connect(transport);

const tools = await client.listTools();
console.log(`Connected. ${tools.tools.length} tools available.`);

console.log("Waiting for Studio plugin to reconnect...");
await new Promise((resolve) => setTimeout(resolve, 5000));

const status = await client.callTool({ name: "studio_status", arguments: {} });
console.log("studio_status ->", JSON.stringify(status.content, null, 2));

try {
  const selection = await client.callTool({ name: "get_scene_selection", arguments: {} });
  console.log("get_scene_selection ->", JSON.stringify(selection.content, null, 2));
} catch (error) {
  console.log("get_scene_selection failed:", error instanceof Error ? error.message : error);
}

try {
  const rig = await client.callTool({ name: "inspect_rig", arguments: {} });
  console.log("inspect_rig ->", JSON.stringify(rig.content, null, 2).slice(0, 2000));
} catch (error) {
  console.log("inspect_rig failed:", error instanceof Error ? error.message : error);
}

await client.close();
