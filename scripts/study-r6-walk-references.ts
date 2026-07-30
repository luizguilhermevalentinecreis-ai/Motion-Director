import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type CatalogItem = {
  path: string;
  name: string;
  occurrence: number;
  keyframeCount: number;
  duration: number;
  supported: boolean;
};
type JointMetric = {
  pathLength: number;
  maximumSpeed: number;
  maximumAngularSpeedDegrees: number;
  supportTravelRootRelative?: number;
  supportSliding?: number;
};
type Analysis = {
  sequence: { name: string; duration: number; keyframeCount: number };
  metrics: {
    centerOfMassBounds: { range: { x: number; y: number; z: number } };
    joints: Record<string, JointMetric>;
    maximumPoseTranslationByJoint: Record<string, number>;
  };
  rawKeyframes?: Array<{
    time: number;
    poses: Array<Record<string, unknown>>;
  }>;
  sampledFrames?: Array<{
    time: number;
    normalizedTime: number;
    centerOfMass: { x: number; y: number; z: number };
    supports: string[];
    parts: Record<string, {
      transform: {
        position: { x: number; y: number; z: number };
        eulerDegrees: { x: number; y: number; z: number };
      };
    }>;
  }>;
};

const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const client = new Client({ name: "motion-director-walk-study", version: "0.2.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/src/index.js"],
  cwd: process.cwd(),
  env: environment,
  stderr: "pipe",
});
const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
function text(result: unknown): string {
  const content = result && typeof result === "object" && "content" in result
    ? (result as { content?: unknown }).content
    : undefined;
  const block = Array.isArray(content)
    ? content.find((item): item is { type: "text"; text: string } =>
        Boolean(item && typeof item === "object" && "type" in item &&
          item.type === "text" && "text" in item && typeof item.text === "string"))
    : undefined;
  return block?.text ?? "";
}
async function call(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(text(result));
  return JSON.parse(text(result)) as unknown;
}
function flattenPoses(
  poses: Array<Record<string, unknown>>,
  output: Record<string, unknown> = {},
): Record<string, unknown> {
  for (const pose of poses) {
    output[String(pose.name)] = {
      cframe: pose.cframe,
      weight: pose.weight,
      easingStyle: pose.easingStyle,
      easingDirection: pose.easingDirection,
    };
    if (Array.isArray(pose.children)) {
      flattenPoses(pose.children as Array<Record<string, unknown>>, output);
    }
  }
  return output;
}

try {
  await client.connect(transport);
  let analyzerReady = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await call("studio_status", {}) as { connected: boolean };
    if (status.connected) {
      const capabilities = await call("studio_animation_capabilities", {}) as {
        animationAnalyzerVersion?: number;
      };
      if (capabilities.animationAnalyzerVersion === 1) {
        analyzerReady = true;
        break;
      }
    }
    await sleep(500);
  }
  assert.ok(analyzerReady, "Animation Analyzer v1 did not connect.");

  const catalog = await call("list_analyzable_animations", {
    nameContains: "Walk",
    pathContains: "Workspace.References",
    maxResults: 100,
  }) as { items: CatalogItem[] };
  const walks = catalog.items.filter((item) => item.supported);
  assert.ok(walks.length >= 4, "Expected the professional walk library.");

  const summaries = [];
  for (const item of walks) {
    const analysis = await call("inspect_animation_full", {
      sourcePath: item.path,
      occurrence: item.occurrence,
      rigPath: "Workspace.r6 rig",
      sampleRate: 60,
      rawCount: 0,
      sampleCount: 0,
      includeRig: false,
      includeRaw: false,
      includeSamples: false,
      includeMetrics: true,
      parts: [],
    }) as Analysis;
    summaries.push({
      name: item.name,
      path: item.path,
      occurrence: item.occurrence,
      duration: analysis.sequence.duration,
      keyframes: analysis.sequence.keyframeCount,
      centerOfMassRange: analysis.metrics.centerOfMassBounds.range,
      torso: analysis.metrics.joints.Torso,
      rightLeg: analysis.metrics.joints["Right Leg"],
      leftLeg: analysis.metrics.joints["Left Leg"],
      poseTranslation: analysis.metrics.maximumPoseTranslationByJoint,
    });
  }

  const target = walks.find((item) => item.name.includes("Walk4")) ??
    walks.toSorted((a, b) => b.keyframeCount - a.keyframeCount)[0]!;
  const targetAnalysis = await call("inspect_animation_full", {
    sourcePath: target.path,
    occurrence: target.occurrence,
    rigPath: "Workspace.r6 rig",
    sampleRate: 60,
    rawStart: 0,
    rawCount: 60,
    sampleStart: 0,
    sampleCount: 60,
    includeRig: true,
    includeRaw: true,
    includeSamples: true,
    includeMetrics: true,
    parts: ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"],
  }) as Analysis;

  const phaseTargets = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
  const phaseFrames = phaseTargets.map((phase) => {
    const frame = targetAnalysis.sampledFrames!.reduce((closest, candidate) =>
      Math.abs(candidate.normalizedTime - phase) <
      Math.abs(closest.normalizedTime - phase) ? candidate : closest);
    return {
      phase,
      actualTime: frame.time,
      actualNormalizedTime: frame.normalizedTime,
      centerOfMass: frame.centerOfMass,
      supports: frame.supports,
      parts: frame.parts,
    };
  });
  const strategicRawFrames = phaseTargets.map((phase) => {
    const frame = targetAnalysis.rawKeyframes!.reduce((closest, candidate) =>
      Math.abs(candidate.time / targetAnalysis.sequence.duration - phase) <
      Math.abs(closest.time / targetAnalysis.sequence.duration - phase) ? candidate : closest);
    return {
      phase,
      actualTime: frame.time,
      poses: flattenPoses(frame.poses),
    };
  });

  process.stdout.write(JSON.stringify({
    catalog: summaries,
    selectedReference: {
      name: target.name,
      path: target.path,
      occurrence: target.occurrence,
      metrics: targetAnalysis.metrics,
      sampledPhases: phaseFrames,
      strategicRawFrames,
    },
  }, null, 2));
} finally {
  await client.close();
}
