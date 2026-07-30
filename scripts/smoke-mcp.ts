import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({
  name: "motion-director-smoke-test",
  version: "0.1.0",
});

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/src/index.js"],
  cwd: process.cwd(),
  env: {
    ...Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
    ROBLOX_MOTION_PORT: "34821",
  },
  stderr: "pipe",
});

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name);
  for (const expected of [
    "studio_status",
    "studio_animation_capabilities",
    "get_scene_selection",
    "inspect_rig",
    "list_analyzable_animations",
    "inspect_animation_full",
    "compare_animation_motion",
    "create_animation_test_rig",
    "validate_animation_draft",
    "stage_animation_draft",
    "preview_animation_draft",
    "preview_committed_animation",
    "commit_animation_draft",
    "discard_animation_draft",
  ]) {
    assert.ok(toolNames.includes(expected), `Missing MCP tool: ${expected}`);
  }

  const status = await client.callTool({ name: "studio_status", arguments: {} });
  assert.equal(status.isError, undefined);
  const resources = await client.listResources();
  assert.equal(resources.resources.length, 3);
  const prompts = await client.listPrompts();
  assert.ok(prompts.prompts.some((prompt) => prompt.name === "direct-professional-animation"));
  process.stdout.write(
    `MCP handshake passed with ${tools.tools.length} tools, ${resources.resources.length} resources, and ${prompts.prompts.length} prompt.\n`,
  );
} finally {
  await client.close();
}
