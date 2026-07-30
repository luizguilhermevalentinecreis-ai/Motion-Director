import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const client = new Client({ name: "motion-director-analyzer-smoke", version: "0.2.0" });
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

try {
  await client.connect(transport);
  let connected = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await client.callTool({ name: "studio_status", arguments: {} });
    if ((JSON.parse(text(status)) as { connected: boolean }).connected) {
      connected = true;
      break;
    }
    await sleep(500);
  }
  assert.ok(connected, "Studio did not connect.");

  let capabilities: {
    animationAnalyzerVersion?: number;
    pluginVersion?: string;
  } = {};
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const capabilitiesResult = await client.callTool({
      name: "studio_animation_capabilities",
      arguments: {},
    });
    assert.equal(capabilitiesResult.isError, undefined, text(capabilitiesResult));
    capabilities = JSON.parse(text(capabilitiesResult)) as typeof capabilities;
    if (capabilities.animationAnalyzerVersion === 1) break;
    await sleep(500);
  }
  assert.equal(capabilities.animationAnalyzerVersion, 1);

  const catalogResult = await client.callTool({
    name: "list_analyzable_animations",
    arguments: {
      nameContains: "Run",
      pathContains: "Workspace.References.High Quality R6 Combat Animations",
      maxResults: 20,
    },
  });
  assert.equal(catalogResult.isError, undefined, text(catalogResult));
  const catalog = JSON.parse(text(catalogResult)) as {
    items: Array<{ path: string; occurrence: number; supported: boolean }>;
  };
  const reference = catalog.items.find((item) => item.supported);
  assert.ok(reference, "Professional reference Run was not cataloged.");

  const inspectionResult = await client.callTool({
    name: "inspect_animation_full",
    arguments: {
      sourcePath: reference.path,
      occurrence: reference.occurrence,
      rigPath: "Workspace.r6 rig",
      sampleRate: 60,
      rawStart: 0,
      rawCount: 3,
      sampleStart: 0,
      sampleCount: 6,
      includeRig: true,
      includeRaw: true,
      includeSamples: true,
      includeMetrics: true,
      parts: ["Torso", "Right Arm", "Left Arm", "Right Leg", "Left Leg"],
    },
  });
  assert.equal(inspectionResult.isError, undefined, text(inspectionResult));
  const inspection = JSON.parse(text(inspectionResult)) as {
    format: string;
    rawKeyframes: unknown[];
    sampledFrames: unknown[];
    metrics: {
      sampleRate: number;
      sampleCount: number;
      centerOfMassBounds: { range: { x: number; y: number; z: number } };
      joints: Record<string, {
        pathLength: number;
        maximumSpeed: number;
        supportTravelRootRelative: number;
      }>;
    };
    rig: { rigType: string };
  };
  assert.equal(inspection.format, "motion-director-animation-analysis-v1");
  assert.equal(inspection.rawKeyframes.length, 3);
  assert.equal(inspection.sampledFrames.length, 6);
  assert.equal(inspection.metrics.sampleRate, 60);
  assert.equal(inspection.rig.rigType, "R6");

  const comparisonResult = await client.callTool({
    name: "compare_animation_motion",
    arguments: {
      sourcePathA: reference.path,
      occurrenceA: reference.occurrence,
      sourcePathB: "ReplicatedStorage.MotionDirectorAnimations.MD_PLANNED_R6_01_PursuitRun",
      occurrenceB: 1,
      rigPath: "Workspace.r6 rig",
      sampleRate: 30,
      normalizedSamples: 33,
      parts: ["Torso", "Right Arm", "Left Arm", "Right Leg", "Left Leg"],
    },
  });
  assert.equal(comparisonResult.isError, undefined, text(comparisonResult));
  const comparison = JSON.parse(text(comparisonResult)) as {
    format: string;
    alignment: {
      normalizedSamples: number;
      phaseShiftNormalized: number;
      positionRmsAfterAlignment: number;
    };
    perPart: Record<string, { positionRms: number; angularRmsDegrees: number }>;
  };
  assert.equal(comparison.format, "motion-director-animation-comparison-v1");
  assert.equal(comparison.alignment.normalizedSamples, 33);
  assert.ok(comparison.perPart.Torso);

  process.stdout.write(JSON.stringify({
    capabilities,
    catalogedRuns: catalog.items.length,
    inspectedRawFrames: inspection.rawKeyframes.length,
    inspectedSamples: inspection.sampledFrames.length,
    referenceMetrics: {
      totalSamples: inspection.metrics.sampleCount,
      centerOfMassRange: inspection.metrics.centerOfMassBounds.range,
      rightLeg: inspection.metrics.joints["Right Leg"],
      leftLeg: inspection.metrics.joints["Left Leg"],
    },
    comparisonAlignment: comparison.alignment,
    torsoDifference: comparison.perPart.Torso,
    comparedParts: Object.keys(comparison.perPart),
  }, null, 2));
} finally {
  await client.close();
}
