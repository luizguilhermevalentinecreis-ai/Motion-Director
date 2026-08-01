import assert from "node:assert/strict";

const relay = process.env.MOTION_RELAY_URL ?? "https://motion-director-relay.onrender.com";
const pairingCode = process.env.MOTION_PAIRING_CODE;
if (!pairingCode) throw new Error("MOTION_PAIRING_CODE is required.");

type V3 = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type Pose = { position: Record<Joint, V3>; rotation: Record<Joint, V3> };

const name = "MD_R6_KiPatrol_FluidMirroredArmRun_120_V7";
const rigId = "Workspace.R6 [Dummy]";
const duration = 0.6;
const fps = 120;
const timelineFrames = duration * fps;
const globalKeyCount = 61;
const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const frameNumbers = Array.from(
  { length: globalKeyCount },
  (_, index) => Math.round((index * timelineFrames) / (globalKeyCount - 1)),
);

assert.equal(timelineFrames, 72);
assert.equal(frameNumbers.length, 61);
assert.equal(new Set(frameNumbers).size, 61);

const tau = Math.PI * 2;
const wave = (n: number, cycles = 1, phase = 0) => Math.sin(tau * (n * cycles + phase));
const cosine = (n: number, cycles = 1, phase = 0) => Math.cos(tau * (n * cycles + phase));

const keyedPoses: Array<{ n: number; pose: Pose }> = [
  {
    n: 0,
    pose: {
      position: { Torso: [0.03, -0.21, -0.18], Head: [0, 0, 0], "Right Arm": [0.1, -0.34, 0.22], "Left Arm": [0.32, 0.26, -0.3], "Right Leg": [0, 0, -0.25], "Left Leg": [0, 0.18, 0.32] },
      rotation: { Torso: [-24, -7, -4], Head: [12, 5, 3], "Right Arm": [-72, -28, 20], "Left Arm": [78, 42, -30], "Right Leg": [48, -2, 2], "Left Leg": [-58, 4, -4] },
    },
  },
  {
    n: 0.092,
    pose: {
      position: { Torso: [0.015, -0.36, -0.22], Head: [0, 0, 0], "Right Arm": [0.14, -0.43, 0.3], "Left Arm": [0.38, 0.36, -0.38], "Right Leg": [0, 0, -0.04], "Left Leg": [0.02, 0.48, -0.02] },
      rotation: { Torso: [-33, -3, -7], Head: [17, 3, 5], "Right Arm": [-82, -30, 24], "Left Arm": [88, 45, -35], "Right Leg": [8, -1, 2], "Left Leg": [42, 6, -8] },
    },
  },
  {
    n: 0.217,
    pose: {
      position: { Torso: [-0.03, -0.06, -0.2], Head: [0, 0, 0], "Right Arm": [-0.32, 0.3, -0.32], "Left Arm": [-0.1, -0.35, 0.25], "Right Leg": [0, 0.08, 0.1], "Left Leg": [0, 0.55, -0.12] },
      rotation: { Torso: [-29, 8, 4], Head: [14, -6, -3], "Right Arm": [78, -42, 30], "Left Arm": [-72, 28, -20], "Right Leg": [-25, -3, 4], "Left Leg": [72, 6, -8] },
    },
  },
  {
    n: 0.383,
    pose: {
      position: { Torso: [-0.02, -0.1, -0.19], Head: [0, 0, 0], "Right Arm": [-0.35, 0.32, -0.36], "Left Arm": [-0.12, -0.38, 0.28], "Right Leg": [0, 0.14, 0.27], "Left Leg": [0, 0.12, -0.18] },
      rotation: { Torso: [-26, 6, 3], Head: [13, -5, -2], "Right Arm": [82, -40, 32], "Left Arm": [-74, 25, -22], "Right Leg": [-52, -3, 4], "Left Leg": [30, 2, -2] },
    },
  },
  {
    n: 0.5,
    pose: {
      position: { Torso: [-0.03, -0.21, -0.18], Head: [0, 0, 0], "Right Arm": [-0.32, 0.26, -0.3], "Left Arm": [-0.1, -0.34, 0.22], "Right Leg": [0, 0.18, 0.32], "Left Leg": [0, 0, -0.25] },
      rotation: { Torso: [-24, 7, 4], Head: [12, -5, -3], "Right Arm": [78, -42, 30], "Left Arm": [-72, 28, -20], "Right Leg": [-58, -4, 4], "Left Leg": [48, 2, -2] },
    },
  },
  {
    n: 0.592,
    pose: {
      position: { Torso: [-0.015, -0.36, -0.22], Head: [0, 0, 0], "Right Arm": [-0.38, 0.36, -0.38], "Left Arm": [-0.14, -0.43, 0.3], "Right Leg": [-0.02, 0.48, -0.02], "Left Leg": [0, 0, -0.04] },
      rotation: { Torso: [-33, 3, 7], Head: [17, -3, -5], "Right Arm": [88, -45, 35], "Left Arm": [-82, 30, -24], "Right Leg": [42, -6, 8], "Left Leg": [8, 1, -2] },
    },
  },
  {
    n: 0.717,
    pose: {
      position: { Torso: [0.03, -0.06, -0.2], Head: [0, 0, 0], "Right Arm": [0.1, -0.35, 0.25], "Left Arm": [0.32, 0.3, -0.32], "Right Leg": [-0.02, 0.55, -0.12], "Left Leg": [0, 0.08, 0.1] },
      rotation: { Torso: [-29, -8, -4], Head: [14, 6, 3], "Right Arm": [-72, -28, 20], "Left Arm": [78, 42, -30], "Right Leg": [72, -6, 8], "Left Leg": [-25, 3, -4] },
    },
  },
  {
    n: 0.883,
    pose: {
      position: { Torso: [0.02, -0.1, -0.19], Head: [0, 0, 0], "Right Arm": [0.12, -0.38, 0.28], "Left Arm": [0.35, 0.32, -0.36], "Right Leg": [0, 0.12, -0.18], "Left Leg": [0, 0.14, 0.27] },
      rotation: { Torso: [-26, -6, -3], Head: [13, 5, 2], "Right Arm": [-74, -25, 22], "Left Arm": [82, 40, -32], "Right Leg": [30, -2, 2], "Left Leg": [-52, 3, -4] },
    },
  },
];
keyedPoses.push({ n: 1, pose: structuredClone(keyedPoses[0]!.pose) });

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const blendVector = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
type ArmKey = { n: number; position: V3; rotation: V3 };
const rightArmKeys: ArmKey[] = [
  { n: 0, position: [0.1, -0.34, 0.22], rotation: [-72, -28, 20] },
  { n: 0.092, position: [0.14, -0.43, 0.3], rotation: [-82, -30, 24] },
  { n: 0.142, position: [0.08, -0.22, 0.2], rotation: [-52, -32, 20] },
  { n: 0.172, position: [-0.1, -0.02, 0.02], rotation: [-8, -36, 23] },
  { n: 0.198, position: [-0.24, 0.17, -0.16], rotation: [43, -40, 27] },
  { n: 0.235, position: [-0.32, 0.3, -0.32], rotation: [78, -42, 30] },
  { n: 0.383, position: [-0.35, 0.32, -0.36], rotation: [82, -40, 32] },
  { n: 0.5, position: [-0.32, 0.26, -0.3], rotation: [78, -42, 30] },
  { n: 0.592, position: [-0.38, 0.36, -0.38], rotation: [88, -45, 35] },
  { n: 0.642, position: [-0.27, 0.18, -0.18], rotation: [48, -40, 29] },
  { n: 0.672, position: [-0.12, -0.01, 0.01], rotation: [3, -36, 24] },
  { n: 0.698, position: [0.04, -0.2, 0.18], rotation: [-45, -32, 21] },
  { n: 0.735, position: [0.1, -0.35, 0.25], rotation: [-72, -28, 20] },
  { n: 0.883, position: [0.12, -0.38, 0.28], rotation: [-74, -25, 22] },
  { n: 1, position: [0.1, -0.34, 0.22], rotation: [-72, -28, 20] },
];
const leftArmKeys: ArmKey[] = [
  { n: 0, position: [0.32, 0.26, -0.3], rotation: [78, 42, -30] },
  { n: 0.092, position: [0.38, 0.36, -0.38], rotation: [88, 45, -35] },
  // The forward arm holds slightly longer while the rear arm begins recovery.
  { n: 0.158, position: [0.34, 0.3, -0.33], rotation: [80, 43, -32] },
  { n: 0.19, position: [0.24, 0.16, -0.16], rotation: [45, 39, -27] },
  { n: 0.22, position: [0.1, -0.03, 0.02], rotation: [2, 35, -23] },
  { n: 0.25, position: [-0.04, -0.22, 0.18], rotation: [-46, 31, -20] },
  { n: 0.283, position: [-0.1, -0.35, 0.25], rotation: [-72, 28, -20] },
  { n: 0.383, position: [-0.12, -0.38, 0.28], rotation: [-74, 25, -22] },
  { n: 0.5, position: [-0.1, -0.34, 0.22], rotation: [-72, 28, -20] },
  { n: 0.592, position: [-0.14, -0.43, 0.3], rotation: [-82, 30, -24] },
  { n: 0.658, position: [-0.08, -0.24, 0.2], rotation: [-52, 32, -21] },
  { n: 0.69, position: [0.08, -0.04, 0.02], rotation: [-6, 36, -24] },
  { n: 0.72, position: [0.23, 0.15, -0.15], rotation: [42, 40, -27] },
  { n: 0.75, position: [0.32, 0.3, -0.32], rotation: [78, 42, -30] },
  { n: 0.883, position: [0.35, 0.32, -0.36], rotation: [82, 40, -32] },
  { n: 1, position: [0.32, 0.26, -0.3], rotation: [78, 42, -30] },
];

function sampleArm(keys: ArmKey[], n: number): { position: V3; rotation: V3 } {
  const normalized = n >= 1 ? 0 : Math.max(0, n);
  let index = keys.findIndex((key, keyIndex) => keyIndex < keys.length - 1 && normalized >= key.n && normalized < keys[keyIndex + 1]!.n);
  if (index < 0) index = 0;
  const a = keys[index]!;
  const b = keys[index + 1]!;
  const raw = (normalized - a.n) / (b.n - a.n);
  // Continuous cubic travel rounds the ribs and shoulder without stopping at
  // every routing key. Timing offsets between arrays provide the overlap.
  const u = raw * raw * (3 - 2 * raw);
  return {
    // Preserve the approved exchange path, but stage it below the head: the
    // forward block now crosses the chest and the rear block finishes near the
    // hip instead of creating a Sonic/Naruto-like high-arm silhouette.
    position: (() => {
      const blended = blendVector(a.position, b.position, u);
      return [blended[0], blended[1] - 0.22, blended[2]] as V3;
    })(),
    rotation: blendVector(a.rotation, b.rotation, u),
  };
}
// The user-approved attack silhouette is the arm pose visible at 22% of V4.
// Freeze it in parent space: torso recoil still carries the arms through space,
// but their threatening relationship never dissolves into a locomotion swap.
const fixedAttackLeftArm = sampleArm(leftArmKeys, 0.22);
const fixedAttackRightArm: { position: V3; rotation: V3 } = {
  position: [
    -fixedAttackLeftArm.position[0],
    fixedAttackLeftArm.position[1],
    fixedAttackLeftArm.position[2],
  ],
  rotation: [
    fixedAttackLeftArm.rotation[0],
    -fixedAttackLeftArm.rotation[1],
    -fixedAttackLeftArm.rotation[2],
  ],
};
function segmentEase(index: number, u: number) {
  if (index === 0 || index === 4) return 1 - (1 - u) * (1 - u);
  if (index === 2 || index === 6) return u;
  if (index === 3 || index === 7) return u * u;
  return u * u * (3 - 2 * u);
}
function poseAt(n: number): Pose {
  const normalized = n >= 1 ? 0 : Math.max(0, n);
  let index = keyedPoses.findIndex((key, keyIndex) => keyIndex < keyedPoses.length - 1 && normalized >= key.n && normalized < keyedPoses[keyIndex + 1]!.n);
  if (index < 0) index = 0;
  const a = keyedPoses[index]!;
  const b = keyedPoses[index + 1]!;
  const raw = (normalized - a.n) / (b.n - a.n);
  const u = segmentEase(index, raw);
  const pose: Pose = {
    // Legs cross every breakdown at non-zero velocity. Easing each leg segment
    // independently used to create a visible pause during support exchange.
    position: Object.fromEntries(joints.map((joint) => [joint, blendVector(a.pose.position[joint], b.pose.position[joint], joint.endsWith("Leg") ? raw : u)])) as Record<Joint, V3>,
    rotation: Object.fromEntries(joints.map((joint) => [joint, blendVector(a.pose.rotation[joint], b.pose.rotation[joint], joint.endsWith("Leg") ? raw : u)])) as Record<Joint, V3>,
  };
  pose.position["Right Arm"] = fixedAttackRightArm.position;
  pose.rotation["Right Arm"] = fixedAttackRightArm.rotation;
  pose.position["Left Arm"] = fixedAttackLeftArm.position;
  pose.rotation["Left Arm"] = fixedAttackLeftArm.rotation;
  return pose;
}

const samples = frameNumbers.map((frame) => {
  const normalized = frame / timelineFrames;
  return {
    time: frame / fps,
    pose: poseAt(frame === timelineFrames ? 0 : normalized),
  };
});

assert.deepEqual(samples[0]!.pose, samples.at(-1)!.pose, "loop must close exactly");
assert.equal(samples.length * joints.length, 366);
for (const normalized of [0, 0.5]) {
  const pose = poseAt(normalized);
  assert.ok(pose.rotation["Right Leg"][0] * pose.rotation["Left Leg"][0] < 0);
}
assert.deepEqual(poseAt(0).position["Right Arm"], poseAt(0.5).position["Right Arm"]);
assert.deepEqual(poseAt(0).rotation["Right Arm"], poseAt(0.5).rotation["Right Arm"]);
assert.deepEqual(poseAt(0).position["Left Arm"], poseAt(0.5).position["Left Arm"]);
assert.deepEqual(poseAt(0).rotation["Left Arm"], poseAt(0.5).rotation["Left Arm"]);
assert.ok(poseAt(0.217).position["Left Leg"][1] >= 0.5, "run needs high left recovery");
assert.ok(poseAt(0.717).position["Right Leg"][1] >= 0.5, "run needs high right recovery");

const blueprint = {
  name,
  rigId,
  rigType: "R6",
  duration,
  framesPerSecond: fps,
  looped: true,
  priority: "movement",
  intent:
    "An R6 RPG full sprint with uninterrupted leg exchange: recovery, passage, extension and contact remain in motion while both arms stay fixed low in the approved mirrored attack silhouette.",
  style: [
    "r6",
    "dragon-ball-rpg-inspired",
    "ki-loaded-frenzy-run",
    "inflated-ego-attitude",
    "animator-preferred-walk-derived",
    "true-run-flight-phase",
    "high-leg-recovery",
    "attack-ready-upper-body",
    "translated-bent-arm-illusion",
    "pose-to-pose-rebuild",
    "lowered-arm-paths",
    "fixed-attack-arms",
    "rpg-charge-run",
    "persistent-threat-silhouette",
    "mirrored-low-arms",
    "symmetric-fixed-upper-body",
    "continuous-leg-exchange",
    "nonzero-breakdown-velocity",
    "strategic-exaggeration",
    "r6-anime-extreme-displacement",
    "dense-designed-curve-sampling",
    "linear-inbetweens",
    "120fps",
    "human-review-required",
  ],
  beats: [
    {
      id: "right-impact-drive",
      label: "Right impact and explosive drive",
      startTime: 0,
      endTime: 0.15,
      intention: "Strike the ground briefly and throw the whole body into the next flight phase.",
      energy: 0.95,
      leadingBodyPart: "Right Leg",
      focalTarget: "Forward pursuit line",
    },
    {
      id: "left-flight-recovery",
      label: "Left recovery through flight",
      startTime: 0.15,
      endTime: 0.3,
      intention: "Fold and recover the left leg high while the fixed upper-body threat remains aimed into the attack line.",
      energy: 1,
      leadingBodyPart: "Left Leg",
      focalTarget: "Forward pursuit line",
    },
    {
      id: "left-impact-drive",
      label: "Left impact and explosive drive",
      startTime: 0.3,
      endTime: 0.45,
      intention: "Compress hard on the left support without losing the proud open upper-body signature.",
      energy: 0.96,
      leadingBodyPart: "Left Leg",
      focalTarget: "Forward pursuit line",
    },
    {
      id: "right-flight-loop",
      label: "Right recovery and loop flight",
      startTime: 0.45,
      endTime: 0.6,
      intention: "Recover the right leg high and close the cycle in uninterrupted frantic propulsion.",
      energy: 1,
      leadingBodyPart: "Right Leg",
      focalTarget: "Forward pursuit line",
    },
  ],
  contacts: [
    {
      id: "right-contact-a",
      effector: "Right Leg",
      target: "Ground",
      startTime: 0,
      endTime: 0.065,
      positionWeight: 1,
      rotationWeight: 0.35,
      allowSlideMeters: 0.012,
    },
    {
      id: "left-contact",
      effector: "Left Leg",
      target: "Ground",
      startTime: 0.275,
      endTime: 0.355,
      positionWeight: 1,
      rotationWeight: 0.35,
      allowSlideMeters: 0.012,
    },
    {
      id: "right-contact-b",
      effector: "Right Leg",
      target: "Ground",
      startTime: 0.575,
      endTime: 0.6,
      positionWeight: 1,
      rotationWeight: 0.35,
      allowSlideMeters: 0.012,
    },
  ],
  tracks: joints.map((joint) => ({
    joint,
    space: "parent",
    keys: samples.map((sample) => ({
      time: sample.time,
      position: {
        x: sample.pose.position[joint][0],
        y: sample.pose.position[joint][1],
        z: sample.pose.position[joint][2],
      },
      rotationDegrees: {
        x: sample.pose.rotation[joint][0],
        y: sample.pose.rotation[joint][1],
        z: sample.pose.rotation[joint][2],
      },
      easing: { style: "linear", direction: "inOut" },
      weight: 1,
    })),
  })),
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function post(path: string, body: unknown): Promise<any> {
  const response = await fetch(`${relay}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(json)}`);
  return json;
}
async function action(name: string, input: Record<string, unknown>, confirmWrite = false) {
  const started = await post("/v1/actions/execute", {
    pairingCode,
    action: name,
    input,
    ...(confirmWrite ? { confirmWrite: true } : {}),
  });
  if (started.status === "succeeded") return started.result;
  for (;;) {
    await sleep(started.pollAfterMs ?? 600);
    const job = await post("/v1/actions/job", { pairingCode, jobId: started.jobId });
    if (job.status === "succeeded") return job.result;
    if (job.status === "failed") throw new Error(`${name}: ${job.error}`);
  }
}

const created = await post("/v1/drafts/create", { pairingCode, blueprint });
const draftId = created.draftId as string;
const validation = await action("validateAnimationDraft", { draftId });
if ((validation?.report?.blockingIssues ?? []).length > 0) {
  throw new Error(validation.report.blockingIssues.join("; "));
}
const staged = await action(
  "stageAnimationDraft",
  { transactionName: "R6 Ki Patrol fluid mirrored arm run", draftId },
  true,
);
const committed = await action(
  "commitAnimationDraft",
  { transactionId: staged.transactionId, destinationName: name },
  true,
);
const attached = await action("attachCommittedAnimations", { namePrefix: name }, true);
const posed = await action(
  "poseCommittedAnimation",
  { animationName: name, normalizedTime: 0.22 },
  true,
);

process.stdout.write(JSON.stringify({
  signature: {
    source: "MD_R6_KiPatrol_RPGWalk_120_V1",
    duration,
    fps,
    globalKeyCount,
    authoredKeys: globalKeyCount * joints.length,
    mechanics: ["deep contact recoil", "long flight", "high knee-like recovery", "rear push", "fixed mirrored low-arm silhouette"],
  },
  created,
  validation,
  staged,
  committed,
  attached,
  posed,
}, null, 2));
