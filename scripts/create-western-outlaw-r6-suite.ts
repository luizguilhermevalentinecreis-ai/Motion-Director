import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { animationDraftSchema, type AnimationDraft } from "../src/domain.js";

type V3 = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type Pose = { position: Record<Joint, V3>; rotation: Record<Joint, V3> };
type Sample = { frame: number; time: number; pose: Pose };

const fps = 120;
const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const sin = (n: number, cycles = 1, phase = 0) =>
  Math.sin(Math.PI * 2 * (n * cycles + phase));
const cos = (n: number, cycles = 1, phase = 0) =>
  Math.cos(Math.PI * 2 * (n * cycles + phase));

function quaternion([xd, yd, zd]: V3) {
  const x = xd * Math.PI / 360;
  const y = yd * Math.PI / 360;
  const z = zd * Math.PI / 360;
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

function samples(duration: number, count: number, poseAt: (n: number) => Pose): Sample[] {
  const totalFrames = duration * fps;
  assert.ok(Number.isInteger(totalFrames));
  const frames = Array.from(
    { length: count },
    (_, index) => Math.round(index * totalFrames / (count - 1)),
  );
  assert.equal(new Set(frames).size, count);
  const result = frames.map((frame) => ({
    frame,
    time: frame / fps,
    pose: poseAt(frame === totalFrames ? 0 : frame / totalFrames),
  }));
  assert.deepEqual(result[0]!.pose, result.at(-1)!.pose);
  return result;
}

function walkPose(n: number): Pose {
  // Warping the phase moves the opposite contact away from the exact midpoint.
  // The result is a deliberate right/left timing inequality instead of a mirrored gait.
  const gait = n - 0.036 * (1 - cos(n));
  const settle = Math.max(0, cos(gait, 2, -0.095));
  const rightLeg =
    19.2 * cos(gait)
    + 3.4 * sin(gait, 2, -0.08)
    + 0.9 * sin(gait, 3, 0.1);
  const leftLeg =
    -19.2 * cos(gait)
    - 2.6 * sin(gait, 2, 0.025)
    - 0.7 * sin(gait, 3, 0.1);

  // The gun-side arm is carried rather than swung. The opposite arm supplies
  // nearly all of the visible counterweight.
  const rightArm = 8.8 - 4.2 * cos(gait, 1, -0.035) - 0.7 * sin(gait, 2, -0.08);
  const leftArm = 1.5 + 18.8 * cos(gait, 1, -0.045) + 2.4 * sin(gait, 2, -0.025);
  const torsoYaw = -2.8 * sin(gait, 1, 0.018) - 0.35 * sin(gait, 2, 0.1);
  const torsoRoll = -3.7 * cos(gait, 1, 0.025) - 0.5 * sin(gait, 2, 0.12);
  const torsoPitch = -3.85 - 0.7 * settle + 0.2 * sin(gait, 2, 0.2);
  const headPitch = 2.15 + 0.18 * sin(gait, 2, -0.03) + 0.08 * sin(n, 3, 0.17);
  const headYaw = -0.48 * torsoYaw + 0.34 * sin(n, 1, -0.12);
  const headRoll = -0.42 * torsoRoll + 0.1 * sin(n, 3, 0.08);

  return {
    position: {
      Torso: [
        0.047 * sin(gait, 1, 0.25) + 0.006 * sin(gait, 2, -0.1),
        -0.082 - 0.046 * settle + 0.007 * cos(gait, 2, 0.18),
        -0.009 - 0.004 * cos(gait, 2, -0.04),
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
      "Right Arm": [rightArm, -3.1 + 0.25 * sin(gait, 1, 0.1), 6.8 + 0.35 * sin(gait, 2, 0.08)],
      "Left Arm": [leftArm, 1.0 + 0.6 * sin(gait, 1, -0.07), -3.6 - 0.6 * sin(gait, 2, 0.04)],
      "Right Leg": [rightLeg, -0.45 * sin(gait), 2.1 - 0.85 * sin(gait, 1, 0.25)],
      "Left Leg": [leftLeg, 0.45 * sin(gait), -2.1 + 0.85 * sin(gait, 1, 0.25)],
    },
  };
}

function runPose(n: number): Pose {
  const impact = Math.max(0, cos(n, 2, -0.075));
  const rightLeg = 31.5 * cos(n) + 3.8 * sin(n, 2, -0.055) + 1.0 * sin(n, 3, 0.1);
  const leftLeg = -31.5 * cos(n) - 3.4 * sin(n, 2, 0.01) - 0.9 * sin(n, 3, 0.1);
  const rightArm = -21.5 * cos(n, 1, -0.05) - 2.8 * sin(n, 2, -0.08) + 6.4;
  const leftArm = 27.8 * cos(n, 1, -0.04) + 3.0 * sin(n, 2, -0.03) + 1.4;
  const torsoYaw = -4.7 * sin(n, 1, 0.018) - 0.6 * sin(n, 2, 0.08);
  const torsoRoll = -3.0 * cos(n, 1, 0.018) - 0.42 * sin(n, 2, 0.11);
  const torsoPitch = -8.45 - 0.62 * impact + 0.35 * sin(n, 2, 0.18);

  return {
    position: {
      Torso: [
        0.032 * sin(n, 1, 0.25) + 0.004 * sin(n, 2, -0.08),
        -0.048 - 0.057 * impact + 0.023 * cos(n, 2, 0.18),
        -0.028 - 0.009 * cos(n, 2, -0.04),
      ],
      Head: [0, 0, 0],
      "Right Arm": [0, 0, 0],
      "Left Arm": [0, 0, 0],
      "Right Leg": [0, 0, 0],
      "Left Leg": [0, 0, 0],
    },
    rotation: {
      Torso: [torsoPitch, torsoYaw, torsoRoll],
      Head: [
        4.4 + 0.28 * sin(n, 2, -0.02),
        -0.68 * torsoYaw + 0.24 * sin(n, 2, -0.12),
        -0.55 * torsoRoll + 0.13 * sin(n, 3, 0.07),
      ],
      "Right Arm": [rightArm, -2.4 + 0.8 * sin(n, 1, 0.1), 5.4 + 0.75 * sin(n, 2, 0.08)],
      "Left Arm": [leftArm, 1.6 + 0.85 * sin(n, 1, -0.07), -3.8 - 0.7 * sin(n, 2, 0.04)],
      "Right Leg": [rightLeg, -0.8 * sin(n), 1.25 - 0.65 * sin(n, 1, 0.25)],
      "Left Leg": [leftLeg, 0.8 * sin(n), -1.25 + 0.65 * sin(n, 1, 0.25)],
    },
  };
}

function idlePose(n: number): Pose {
  const breath = sin(n, 1, -0.06);
  const weight = sin(n, 1, 0.19);
  const secondary = sin(n, 2, -0.12);
  const tertiary = sin(n, 3, 0.08);
  const torsoYaw = 0.2 * weight + 0.06 * secondary;
  const torsoRoll = -1.35 + 0.3 * weight + 0.08 * tertiary;
  const torsoPitch = -4.8 - 0.3 * breath + 0.1 * secondary;

  return {
    position: {
      Torso: [
        0.018 + 0.014 * weight + 0.002 * tertiary,
        -0.046 + 0.012 * breath + 0.002 * secondary,
        -0.015 - 0.004 * breath + 0.001 * tertiary,
      ],
      Head: [0, 0, 0],
      "Right Arm": [0, 0, 0],
      "Left Arm": [0, 0, 0],
      "Right Leg": [0, 0, 0],
      "Left Leg": [0, 0, 0],
    },
    rotation: {
      Torso: [torsoPitch, torsoYaw, torsoRoll],
      Head: [
        2.7 + 0.22 * breath - 0.08 * tertiary,
        -3.5 * weight + 0.9 * secondary - 0.3 * tertiary,
        -0.5 * torsoRoll + 0.16 * secondary,
      ],
      // Low right hand and quieter shoulder sell the gun-ready silhouette.
      "Right Arm": [
        8.0 - 0.5 * breath + 0.18 * secondary,
        -2.2 + 0.18 * weight,
        5.5 + 0.22 * breath,
      ],
      "Left Arm": [
        5.2 - 0.6 * breath - 0.16 * secondary,
        1.0 - 0.16 * weight,
        -3.1 - 0.2 * breath,
      ],
      "Right Leg": [
        1.05 + 0.11 * weight,
        -0.035 * secondary,
        0.5 + 0.09 * weight,
      ],
      "Left Leg": [
        -0.4 - 0.07 * weight,
        0.028 * secondary,
        -0.7 + 0.07 * weight,
      ],
    },
  };
}

const walkDuration = 2.1;
const runDuration = 0.9;
const idleDuration = 5;
const walkSamples = samples(walkDuration, 43, walkPose);
const runSamples = samples(runDuration, 37, runPose);
const idleSamples = samples(idleDuration, 61, idlePose);

for (const sample of [...walkSamples, ...runSamples, ...idleSamples]) {
  for (const joint of joints.slice(1)) {
    assert.deepEqual(sample.pose.position[joint]!, [0, 0, 0], `${joint} left its R6 pivot`);
  }
}
for (const n of [0, 0.5]) {
  const walk = walkPose(n);
  const run = runPose(n);
  assert.ok(walk.rotation["Right Leg"][0] * walk.rotation["Left Leg"][0] < 0);
  assert.ok(walk.rotation["Left Arm"][0] * walk.rotation["Left Leg"][0] < 0);
  assert.ok(run.rotation["Right Leg"][0] * run.rotation["Left Leg"][0] < 0);
  assert.ok(run.rotation["Right Arm"][0] * run.rotation["Right Leg"][0] < 0);
  assert.ok(run.rotation["Left Arm"][0] * run.rotation["Left Leg"][0] < 0);
}
const westernRightArmRange =
  Math.max(...walkSamples.map((s) => s.pose.rotation["Right Arm"][0]))
  - Math.min(...walkSamples.map((s) => s.pose.rotation["Right Arm"][0]));
const westernLeftArmRange =
  Math.max(...walkSamples.map((s) => s.pose.rotation["Left Arm"][0]))
  - Math.min(...walkSamples.map((s) => s.pose.rotation["Left Arm"][0]));
assert.ok(westernLeftArmRange > westernRightArmRange * 3);
assert.ok(Math.max(...idleSamples.map((s) => Math.abs(s.pose.rotation.Torso[1]))) < 0.3);
assert.ok(Math.min(...runSamples.map((s) => s.pose.rotation.Torso[0])) > -10);

function tracksFrom(source: Sample[]): AnimationDraft["tracks"] {
  return joints.map((joint) => ({
    joint,
    space: "parent",
    keys: source.map((sample) => ({
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

const commonStyle = [
  "r6", "western-outlaw", "performance-capture-inspired", "heavy-body",
  "holster-side-asymmetry", "deliberate-weight-transfer", "cubicV2",
  "human-review-required",
];
const walkName = "MD_R6_WesternOutlawWalk_120";
const runName = "MD_R6_WesternOutlawRun_120";
const idleName = "MD_R6_WesternOutlawIdle_120";

const walkDraft = animationDraftSchema.parse({
  name: walkName,
  rigId: "selection:1",
  duration: walkDuration,
  framesPerSecond: fps,
  looped: true,
  priority: "movement",
  beats: [
    { id: "right_saunter", label: "Long right weighted saunter", startTime: 0, endTime: 1.18, intention: "Settle deeply into the right hip, carry the gun-side hand, and let lateral mass arrive after the foot.", energy: 0.36, leadingBodyPart: "Right Leg" },
    { id: "left_saunter", label: "Shorter left recovery saunter", startTime: 1.18, endTime: 2.1, intention: "Recover through a deliberately unequal step while the loose arm restores the broad silhouette.", energy: 0.4, leadingBodyPart: "Left Leg" },
  ],
  contacts: [
    { id: "right_walk_plant", effector: "Right Leg", target: "Ground", startTime: 0, endTime: 0.38, positionWeight: 1, rotationWeight: 0.2, allowSlideMeters: 0.012 },
    { id: "left_walk_plant", effector: "Left Leg", target: "Ground", startTime: 1.18, endTime: 1.5, positionWeight: 1, rotationWeight: 0.2, allowSlideMeters: 0.012 },
  ],
  tracks: tracksFrom(walkSamples),
  metadata: {
    intent: "Original unmistakably western outlaw saunter: asymmetric step timing, pronounced lateral lumber, low deliberate stride, loose off-hand, carried gun-side hand, lazy upright posture and delayed mass.",
    rigType: "R6",
    style: [...commonStyle, "asymmetric-step-timing", "slow-saunter", "strong-lateral-lumber", "carried-holster-hand", "low-foot-clearance"],
    version: 1,
  },
});

const runDraft = animationDraftSchema.parse({
  name: runName,
  rigId: "selection:1",
  duration: runDuration,
  framesPerSecond: fps,
  looped: true,
  priority: "movement",
  beats: [
    { id: "right_heavy_drive", label: "Right heavy drive", startTime: 0, endTime: 0.45, intention: "Compress visibly, push the heavy frame forward, and keep the holster side controlled.", energy: 0.76, leadingBodyPart: "Right Leg" },
    { id: "left_heavy_drive", label: "Left heavy drive", startTime: 0.45, endTime: 0.9, intention: "Mirror propulsion without becoming an athletic sprint or losing the broad silhouette.", energy: 0.76, leadingBodyPart: "Left Leg" },
  ],
  contacts: [
    { id: "right_run_plant", effector: "Right Leg", target: "Ground", startTime: 0, endTime: 0.14, positionWeight: 1, rotationWeight: 0.15, allowSlideMeters: 0.018 },
    { id: "left_run_plant", effector: "Left Leg", target: "Ground", startTime: 0.45, endTime: 0.59, positionWeight: 1, rotationWeight: 0.15, allowSlideMeters: 0.018 },
  ],
  tracks: tracksFrom(runSamples),
  metadata: {
    intent: "Original heavy western outlaw run: broad propulsion, controlled forward lean, forceful compression, quieter gun-side arm and motion-captured body lag.",
    rigType: "R6",
    style: [...commonStyle, "heavy-run", "broad-propulsion", "controlled-lean"],
    version: 1,
  },
});

const idleDraft = animationDraftSchema.parse({
  name: idleName,
  rigId: "selection:1",
  duration: idleDuration,
  framesPerSecond: fps,
  looped: true,
  priority: "idle",
  beats: [
    { id: "lazy_breath", label: "Lazy weighted breath", startTime: 0, endTime: 1.7, intention: "Rest into one hip while the right hand remains naturally near the holster.", energy: 0.2, leadingBodyPart: "Torso" },
    { id: "outlaw_scan", label: "Outlaw environmental scan", startTime: 1.7, endTime: 3.4, intention: "Scan mostly with the head while feet and torso remain planted.", energy: 0.27, leadingBodyPart: "Head" },
    { id: "settle_loop", label: "Settle into loop", startTime: 3.4, endTime: 5, intention: "Return through breath and lateral weight without a visible reset.", energy: 0.18, leadingBodyPart: "Torso" },
  ],
  contacts: [
    { id: "right_idle_plant", effector: "Right Leg", target: "Ground", startTime: 0, endTime: 5, positionWeight: 1, rotationWeight: 0.3, allowSlideMeters: 0.004 },
    { id: "left_idle_plant", effector: "Left Leg", target: "Ground", startTime: 0, endTime: 5, positionWeight: 1, rotationWeight: 0.3, allowSlideMeters: 0.004 },
  ],
  tracks: tracksFrom(idleSamples),
  metadata: {
    intent: "Original relaxed but vigilant western outlaw idle: planted torso, lazy asymmetric weight, breathing, independent head scan and a right hand carried near the holster.",
    rigType: "R6",
    style: [...commonStyle, "relaxed-vigilance", "planted-torso", "holster-ready-idle"],
    version: 1,
  },
});

const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const client = new Client({ name: "motion-director-western-outlaw-suite", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/src/index.js"],
  cwd: process.cwd(),
  env: environment,
  stderr: "pipe",
});
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function text(result: unknown): string {
  const content = result && typeof result === "object" && "content" in result
    ? (result as { content?: unknown }).content : undefined;
  const block = Array.isArray(content)
    ? content.find((item): item is { type: "text"; text: string } =>
        Boolean(item && typeof item === "object" && "type" in item
          && item.type === "text" && "text" in item && typeof item.text === "string"))
    : undefined;
  return block?.text ?? "";
}

async function call(tool: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name: tool, arguments: args });
  if (result.isError) throw new Error(text(result));
  return JSON.parse(text(result)) as unknown;
}

async function create(draft: AnimationDraft, transactionName: string) {
  const validation = await call("validate_animation_draft", { draft });
  const staged = await call("stage_animation_draft", { transactionName, draft }) as { transactionId: string };
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
    if ((await call("studio_status", {}) as { connected: boolean }).connected) {
      connected = true;
      break;
    }
    await sleep(500);
  }
  assert.ok(connected, "Motion Director plugin did not connect in LOCAL MCP mode.");

  const capabilities = await call("studio_animation_capabilities", {});
  const walkOnly = process.argv.includes("--walk-only");
  const walk = await create(walkDraft, "Western outlaw walk 120 FPS");
  const run = walkOnly ? undefined : await create(runDraft, "Western outlaw run 120 FPS");
  const idle = walkOnly ? undefined : await create(idleDraft, "Western outlaw idle 120 FPS");
  process.stdout.write(JSON.stringify({
    capabilities,
    walk: { name: walkName, duration: walkDuration, globalTimes: walkSamples.length, totalKeys: walkSamples.length * 6, result: walk },
    run: { name: runName, duration: runDuration, globalTimes: runSamples.length, totalKeys: runSamples.length * 6, result: run ?? "preserved-existing-run" },
    idle: { name: idleName, duration: idleDuration, globalTimes: idleSamples.length, totalKeys: idleSamples.length * 6, result: idle ?? "preserved-existing-idle" },
  }, null, 2));
} finally {
  await client.close();
}
