import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pluginPath = new URL("../studio-plugin/MotionDirectorPlugin.server.lua", import.meta.url);
const analyzerPath = new URL("../studio-plugin/AnimationAnalyzer.lua", import.meta.url);
const serverPath = new URL("../src/index.ts", import.meta.url);

test("exposes the animation analyzer through plugin and MCP commands", async () => {
  const [plugin, analyzer, server] = await Promise.all([
    readFile(pluginPath, "utf8"),
    readFile(analyzerPath, "utf8"),
    readFile(serverPath, "utf8"),
  ]);

  assert.match(plugin, /animationAnalyzerVersion = 1/);
  assert.match(plugin, /analysis\.listAnimations/);
  assert.match(plugin, /analysis\.inspectAnimation/);
  assert.match(plugin, /analysis\.compareAnimations/);
  assert.match(server, /list_analyzable_animations/);
  assert.match(server, /inspect_animation_full/);
  assert.match(server, /compare_animation_motion/);

  assert.match(analyzer, /serializeKeyframe/);
  assert.match(analyzer, /serializePose/);
  assert.match(analyzer, /sampleTrack/);
  assert.match(analyzer, /solveFrame/);
  assert.match(analyzer, /centerOfMass/);
  assert.match(analyzer, /supportTravelRootRelative/);
  assert.match(analyzer, /phaseShiftNormalized/);
});

test("keeps analyzer payloads paginated and limb reconstruction rig-aware", async () => {
  const analyzer = await readFile(analyzerPath, "utf8");

  assert.match(analyzer, /rawCount or 30/);
  assert.match(analyzer, /sampleCount or 30/);
  assert.match(analyzer, /math\.clamp\(params\.sampleRate or 60, 1, 120\)/);
  assert.match(analyzer, /parentFrame \* motor\.C0 \* sampled \* motor\.C1:Inverse\(\)/);
  assert.match(analyzer, /maximumPoseTranslationByJoint/);
});
