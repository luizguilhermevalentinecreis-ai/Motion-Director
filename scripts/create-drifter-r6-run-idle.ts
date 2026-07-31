import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { animationDraftSchema, type AnimationDraft } from "../src/domain.js";

type V3 = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type Pose = {
  position: Record<Joint, V3>;
  rotation: Record<Joint, V3>;
};

const fps = 120;
const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const wave = (n: number, cycles = 1, phase = 0) =>
  Math.sin(Math.PI * 2 * (n * cycles + phase));
const cosine = (n: number, cycles = 1, phase = 0) =>
  Math.cos(Math.PI * 2 * (n * cycles + phase));
const radians = (degrees: number) => (degrees * Math.PI) / 180;

function quaternion([xDegrees, yDegrees, zDegrees]: V3) {
  const x = radians(xDegrees) * 0.5;
  const y = radians(yDegrees) * 0.5;
  const z = radians(zDegrees) * 0.5;
  const cx = Math.cos(x), sx = Math.sin(x);
  const cy = Math.cos(y), sy = Math.sin(y);
  const cz = Math.cos(z), sz = Math.sin(z);
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };
}

function frameSamples(duration: number, keyCount: number, poseAt: (n: number) => Pose) {
  const timelineFrames = duration * fps;
  assert.ok(Number.isInteger(timelineFrames));
  const frames = Array.from(
    { length: keyCount },
    (_, index) => Math.round((index * timelineFrames) / (keyCount - 1)),
  );
  assert.equal(new Set(frames).size, keyCount);
  return frames.map((frame) => {
    const normalized = frame / timelineFrames;
    return {
      frame,
      time: frame / fps,
      normalized,
      pose: poseAt(frame === timelineFrames ? 0 : normalized),
    };
  });
}

function runPose(n: number): Pose {
  const compression = Math.max(0, cosine(n, 2, -0.08));
  const rightLeg =
    33.2 * cosine(n)
    + 3.3 * wave(n, 2, -0.06)
    + 1.1 * wave(n, 3, 0.12);
  const leftLeg =
    -33.2 * cosine(n)
    - 3.0 * wave(n, 2, 0.01)
    - 0.9 * wave(n, 3, 0.12);

  // The upper body trails the hips and remains slightly unequal because of carried gear.
  const rightArm =
    -28.5 * cosine(n, 1, -0.055)
    - 3.5 * wave(n, 2, -0.09)
    + 3.6;
  const leftArm =
    31.5 * cosine(n, 1, -0.045)
    + 3.1 * wave(n, 2, -0.04)
    + 1.2;

  const torsoYaw = -5.2 * wave(n, 1, 0.018) - 0.7 * wave(n, 2, 0.09);
  const torsoRoll = -2.8 * cosine(n, 1, 0.018) - 0.48 * wave(n, 2, 0.12);
  const torsoPitch =
    -10.25
    - 0.72 * compression
    + 0.42 * wave(n, 2, 0.18)
    + 0.18 * wave(n, 4, -0.08);

  const headPitch = 5.35 + 0.34 * wave(n, 2, -0.02) + 0.18 * wave(n, 4, 0.16);
  const headYaw = -0.7 * torsoYaw + 0.3 * wave(n, 2, -0.12);
  const headRoll = -0.58 * torsoRoll + 0.16 * wave(n, 3, 0.07);

  const vertical =
    -0.044
    - 0.054 * compression
    + 0.026 * cosine(n, 2, 0.18)
    + 0.004 * wave(n, 4, 0.04);
  const lateral = 0.027 * wave(n, 1, 0.25) + 0.004 * wave(n, 2, -0.08);
  const foreAft = -0.031 - 0.009 * cosine(n, 2, -0.04);

  return {
    position: {
      Torso: [lateral, vertical, foreAft],
      Head: [0, 0, 0],
      "Right Arm": [0, 0, 0],
      "Left Arm": [0, 0, 0],
      "Right Leg": [0, 0, 0],
      "Left Leg": [0, 0, 0],
    },
    rotation: {
      Torso: [torsoPitch, torsoYaw, torsoRoll],
      Head: [headPitch, headYaw, headRoll],
      "Right Arm": [rightArm, -2.2 + 1.2 * wave(n, 1, 0.1), 4.1 + 0.9 * wave(n, 2, 0.09)],
      "Left Arm": [leftArm, 1.8 + 1.0 * wave(n, 1, -0.07), -3.5 - 0.8 * wave(n, 2, 0.04)],
      "Right Leg": [rightLeg, -0.9 * wave(n), 1.15 - 0.65 * wave(n, 1, 0.25)],
      "Left Leg": [leftLeg, 0.9 * wave(n), -1.15 + 0.65 * wave(n, 1, 0.25)],
    },
  };
}

function idlePose(n: number): Pose {
  const breath = wave(n, 1, -0.06);
  const slowWeight = wave(n, 1, 0.18);
  const secondary = wave(n, 2, -0.12);
  const tertiary = wave(n, 3, 0.09);

  const torsoPitch = -4.35 - 0.28 * breath + 0.1 * secondary;
  // Keep the R6 torso nearly planted. Large torso yaw propagates to every limb
  // and makes the whole block rig appear to rotate on a platform.
  const torsoYaw = 0.22 * slowWeight + 0.07 * secondary;
  const torsoRoll = -0.72 + 0.28 * slowWeight + 0.08 * tertiary;
  const headPitch = 2.45 + 0.24 * breath - 0.1 * tertiary;
  const headYaw = -3.15 * slowWeight + 0.82 * secondary - 0.26 * tertiary;
  const headRoll = -0.56 * torsoRoll + 0.18 * secondary;

  return {
    position: {
      Torso: [
        0.012 + 0.013 * slowWeight + 0.002 * tertiary,
        -0.038 + 0.011 * breath + 0.002 * secondary,
        -0.013 - 0.004 * breath + 0.0015 * tertiary,
      ],
      Head: [0, 0, 0],
      "Right Arm": [0, 0, 0],
      "Left Arm": [0, 0, 0],
      "Right Leg": [0, 0, 0],
      "Left Leg": [0, 0, 0],
    },
    rotation: {
      Torso: [torsoPitch, torsoYaw, torsoRoll],
      Head: [headPitch, headYaw, headRoll],
      "Right Arm": [
        5.1 - 0.62 * breath + 0.24 * secondary,
        -1.25 + 0.24 * slowWeight,
        4.15 + 0.28 * breath,
      ],
      "Left Arm": [
        7.25 - 0.48 * breath - 0.18 * secondary,
        1.0 - 0.2 * slowWeight,
        -3.45 - 0.22 * breath,
      ],
      "Right Leg": [
        0.82 + 0.12 * slowWeight,
        -0.04 * secondary,
        0.42 + 0.1 * slowWeight,
      ],
      "Left Leg": [
        -0.45 - 0.08 * slowWeight,
        0.03 * secondary,
        -0.62 + 0.08 * slowWeight,
      ],
    },
  };
}

const runDuration = 0.8;
const idleDuration = 4;
const runSamples = frameSamples(runDuration, 33, runPose);
const idleSamples = frameSamples(idleDuration, 49, idlePose);

assert.deepEqual(runSamples[0]!.pose, runSamples.at(-1)!.pose);
assert.deepEqual(idleSamples[0]!.pose, idleSamples.at(-1)!.pose);
assert.equal(runSamples.length * joints.length, 198);
assert.equal(idleSamples.length * joints.length, 294);
for (const sample of [...runSamples, ...idleSamples]) {
  for (const joint of joints.slice(1)) {
    assert.deepEqual(sample.pose.position[joint]!, [0, 0, 0], `${joint} left its R6 pivot`);
  }
}
for (const normalized of [0, 0.5]) {
  const pose = runPose(normalized);
  assert.ok(pose.rotation["Right Leg"][0] * pose.rotation["Left Leg"][0] < 0);
  assert.ok(pose.rotation["Right Arm"][0] * pose.rotation["Right Leg"][0] < 0);
  assert.ok(pose.rotation["Left Arm"][0] * pose.rotation["Left Leg"][0] < 0);
}
assert.ok(
  Math.max(...runSamples.map((sample) => sample.pose.rotation.Torso[0])) < -9,
  "run lost its forward drive",
);
assert.ok(
  Math.min(...runSamples.map((sample) => sample.pose.rotation.Torso[0])) > -12,
  "run lean became physically implausible",
);
assert.ok(
  Math.max(...idleSamples.map((sample) => Math.abs(sample.pose.rotation.Torso[1]))) < 0.3,
  "idle torso yaw would rotate the whole R6 hierarchy",
);
assert.ok(
  Math.max(...idleSamples.map((sample) => Math.abs(sample.pose.rotation["Right Leg"][1]))) < 0.05,
  "idle right foot no longer reads as planted",
);
assert.ok(
  Math.max(...idleSamples.map((sample) => Math.abs(sample.pose.rotation["Left Leg"][1]))) < 0.05,
  "idle left foot no longer reads as planted",
);

function tracksFrom(
  samples: Array<{ time: number; pose: Pose }>,
): AnimationDraft["tracks"] {
  return joints.map((joint) => ({
    joint,
    space: "parent",
    keys: samples.map((sample) => ({
      time: sample.time,
      transform: {
        position: {
          x: sample.pose.position[joint][0],
          y: sample.pose.position[joint][1],
          z: sample.pose.position[joint][2],
        },
        rotation: quaternion(sample.pose.rotation[joint]),
      },
      easing: { style: "cubicV2", direction: "inOut" },
      weight: 1,
    })),
  }));
}

const runName = "MD_R6_DrifterSurvivalRun_120";
const idleName = "MD_R6_DrifterSurvivalIdle_120";
const runDraft: AnimationDraft = animationDraftSchema.parse({
  name: runName,
  rigId: "selection:1",
  duration: runDuration,
  framesPerSecond: fps,
  looped: true,
  priority: "movement",
  beats: [
    {
      id: "right_drive",
      label: "Right contact, compression and drive",
      startTime: 0,
      endTime: 0.4,
      intention: "Accept force low, drive forward, and let carried equipment trail the hips.",
      energy: 0.82,
      leadingBodyPart: "Right Leg",
    },
    {
      id: "left_drive",
      label: "Left contact, compression and drive",
      startTime: 0.4,
      endTime: 0.8,
      intention: "Mirror propulsion while preserving purposeful upper-body asymmetry.",
      energy: 0.82,
      leadingBodyPart: "Left Leg",
    },
  ],
  contacts: [
    {
      id: "right_run_support",
      effector: "Right Leg",
      target: "Ground",
      startTime: 0,
      endTime: 0.12,
      positionWeight: 1,
      rotationWeight: 0.15,
      allowSlideMeters: 0.018,
    },
    {
      id: "left_run_support",
      effector: "Left Leg",
      target: "Ground",
      startTime: 0.4,
      endTime: 0.52,
      positionWeight: 1,
      rotationWeight: 0.15,
      allowSlideMeters: 0.018,
    },
  ],
  tracks: tracksFrom(runSamples),
  metadata: {
    intent:
      "Original urgent survival run matching the approved drifter walk: controlled forward lean, forceful opposed legs, delayed unequal arms, low compression, restrained flight and stable gaze.",
    rigType: "R6",
    style: [
      "r6", "grounded-survival", "urgent-run", "equipment-weight",
      "controlled-forward-lean", "contralateral-drive", "cubicV2",
      "human-review-required",
    ],
    version: 1,
  },
});

const idleDraft: AnimationDraft = animationDraftSchema.parse({
  name: idleName,
  rigId: "selection:1",
  duration: idleDuration,
  framesPerSecond: fps,
  looped: true,
  priority: "idle",
  beats: [
    {
      id: "settled_breath",
      label: "Settled weighted breath",
      startTime: 0,
      endTime: 1.35,
      intention: "Keep both feet grounded while breath reaches shoulders with delayed amplitude.",
      energy: 0.24,
      leadingBodyPart: "Torso",
    },
    {
      id: "environment_scan",
      label: "Quiet environmental scan",
      startTime: 1.35,
      endTime: 2.75,
      intention: "Let the head scan independently while the body remains ready and asymmetrical.",
      energy: 0.3,
      leadingBodyPart: "Head",
    },
    {
      id: "weight_return",
      label: "Weight return and loop closure",
      startTime: 2.75,
      endTime: 4,
      intention: "Return through breath and hip weight without visibly resetting the character.",
      energy: 0.22,
      leadingBodyPart: "Torso",
    },
  ],
  contacts: [
    {
      id: "right_idle_plant",
      effector: "Right Leg",
      target: "Ground",
      startTime: 0,
      endTime: 4,
      positionWeight: 1,
      rotationWeight: 0.25,
      allowSlideMeters: 0.004,
    },
    {
      id: "left_idle_plant",
      effector: "Left Leg",
      target: "Ground",
      startTime: 0,
      endTime: 4,
      positionWeight: 1,
      rotationWeight: 0.25,
      allowSlideMeters: 0.004,
    },
  ],
  tracks: tracksFrom(idleSamples),
  metadata: {
    intent:
      "Original alert survival idle matching the approved drifter walk: planted R6 torso and feet, lateral weight transfer instead of whole-body yaw, layered breathing, independent head scan, subtle equipment response and invisible loop closure.",
    rigType: "R6",
    style: [
      "r6", "grounded-survival", "alert-idle", "layered-breathing",
      "asymmetric-weight", "planted-torso", "independent-head-scan", "cubicV2",
      "human-review-required",
    ],
    version: 1,
  },
});

const environment = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);
const client = new Client({ name: "motion-director-drifter-run-idle", version: "1.0.0" });
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
  if (!Array.isArray(content)) return "";
  const block = content.find(
    (item): item is { type: "text"; text: string } =>
      Boolean(
        item
          && typeof item === "object"
          && "type" in item
          && item.type === "text"
          && "text" in item
          && typeof item.text === "string",
      ),
  );
  return block?.text ?? "";
}

async function call(toolName: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name: toolName, arguments: args });
  if (result.isError) throw new Error(textResult(result));
  return JSON.parse(textResult(result)) as unknown;
}

async function create(draft: AnimationDraft, transactionName: string) {
  const validation = await call("validate_animation_draft", { draft });
  const staged = await call("stage_animation_draft", { transactionName, draft }) as {
    transactionId: string;
  };
  const committed = await call("commit_animation_draft", {
    transactionId: staged.transactionId,
    destinationName: draft.name,
  });
  const attached = await call("attach_committed_animations_to_selected_rig_animsaves", {
    namePrefix: draft.name,
  });
  return { validation, staged, committed, attached };
}

try {
  await client.connect(transport);
  let connected = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await call("studio_status", {}) as { connected: boolean };
    if (status.connected) {
      connected = true;
      break;
    }
    await sleep(500);
  }
  assert.ok(connected, "Motion Director plugin did not connect in LOCAL MCP mode.");

  const capabilities = await call("studio_animation_capabilities", {});
  const idleOnly = process.argv.includes("--idle-only");
  const run = idleOnly
    ? undefined
    : await create(runDraft, "Grounded survival drifter run 120 FPS");
  const idle = await create(idleDraft, "Alert survival drifter idle 120 FPS");
  process.stdout.write(JSON.stringify({
    capabilities,
    run: {
      name: runName,
      duration: runDuration,
      fps,
      globalTimes: runSamples.length,
      totalKeys: runSamples.length * joints.length,
      frameNumbers: runSamples.map((sample) => sample.frame),
      result: run ?? "preserved-existing-run",
    },
    idle: {
      name: idleName,
      duration: idleDuration,
      fps,
      globalTimes: idleSamples.length,
      totalKeys: idleSamples.length * joints.length,
      frameNumbers: idleSamples.map((sample) => sample.frame),
      result: idle,
    },
  }, null, 2));
} finally {
  await client.close();
}
