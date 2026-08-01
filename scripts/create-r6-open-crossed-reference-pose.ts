const relay = process.env.MOTION_RELAY_URL ?? "https://motion-director-relay.onrender.com";
const pairingCode = process.env.MOTION_PAIRING_CODE;

if (!pairingCode) throw new Error("MOTION_PAIRING_CODE is required.");

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

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

async function action(
  name: string,
  input: Record<string, unknown>,
  confirmWrite = false,
): Promise<any> {
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

type V3 = { x: number; y: number; z: number };
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";

const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
const times = [0, 0.42, 1.2, 1.98, 2.4];

// A deliberately asymmetric R6 reinterpretation of the reference. The pose is
// organized around the planted right leg; every other track either extends the
// welcoming silhouette or counterbalances the crossed rear leg.
const rotations: Record<Joint, V3[]> = {
  Torso: [
    v(1.0, -3.0, -2.5),
    v(2.5, -6.0, -4.5),
    v(3.5, -8.0, -5.5),
    v(2.0, -5.0, -4.0),
    v(1.0, -3.0, -2.5),
  ],
  Head: [
    v(-1.0, 2.0, 1.5),
    v(-2.0, 5.0, 3.0),
    v(-2.5, 7.0, 4.0),
    v(-1.5, 4.0, 2.5),
    v(-1.0, 2.0, 1.5),
  ],
  "Right Arm": [
    v(7.0, -42.0, 18.0),
    v(11.0, -59.0, 25.0),
    v(14.0, -70.0, 29.0),
    v(10.0, -56.0, 24.0),
    v(7.0, -42.0, 18.0),
  ],
  "Left Arm": [
    v(-5.0, 38.0, -19.0),
    v(-8.0, 55.0, -27.0),
    v(-10.0, 67.0, -31.0),
    v(-7.0, 52.0, -26.0),
    v(-5.0, 38.0, -19.0),
  ],
  "Right Leg": [
    v(-5.0, -3.0, 2.0),
    v(-9.0, -6.0, 4.0),
    v(-12.0, -8.0, 5.0),
    v(-8.0, -5.0, 3.5),
    v(-5.0, -3.0, 2.0),
  ],
  "Left Leg": [
    v(5.0, 3.0, -2.0),
    v(9.0, 6.0, -4.0),
    v(12.0, 8.0, -5.0),
    v(8.0, 5.0, -3.5),
    v(5.0, 3.0, -2.0),
  ],
};

const positions: Record<Joint, V3[]> = {
  Torso: [
    v(0.02, -0.08, 0.04),
    v(0.05, -0.15, 0.08),
    v(0.07, -0.20, 0.11),
    v(0.045, -0.14, 0.07),
    v(0.02, -0.08, 0.04),
  ],
  Head: times.map(() => v(0, 0, 0)),
  "Right Arm": [
    v(0.08, -0.30, -0.04),
    v(0.15, -0.50, -0.09),
    v(0.22, -0.68, -0.14),
    v(0.14, -0.48, -0.08),
    v(0.08, -0.30, -0.04),
  ],
  "Left Arm": [
    v(-0.08, -0.31, -0.05),
    v(-0.16, -0.52, -0.10),
    v(-0.24, -0.71, -0.16),
    v(-0.15, -0.50, -0.09),
    v(-0.08, -0.31, -0.05),
  ],
  "Right Leg": [
    v(0.03, 0.02, 0.16),
    v(0.07, 0.04, 0.31),
    v(0.10, 0.055, 0.43),
    v(0.065, 0.035, 0.29),
    v(0.03, 0.02, 0.16),
  ],
  "Left Leg": [
    v(-0.02, 0.02, -0.17),
    v(-0.05, 0.04, -0.33),
    v(-0.08, 0.055, -0.46),
    v(-0.045, 0.035, -0.31),
    v(-0.02, 0.02, -0.17),
  ],
};

const joints = Object.keys(rotations) as Joint[];
const name = "MD_R6_OpenAuthority_ReferencePose_V4";
const blueprint = {
  name,
  rigId: "Workspace.R6 [Dummy]",
  rigType: "R6",
  duration: 2.4,
  framesPerSecond: 30,
  looped: true,
  priority: "idle",
  intent:
    "A visually led R6 authority pose: left leg advanced and planted, right leg planted behind as the load-bearing base, pelvis settled between them, both arms translated decisively downward on Y, and axial arm rotation used only to expose an open commanding gesture.",
  style: [
    "r6",
    "pose-study",
    "reference-informed",
    "strategic-exaggeration",
    "silhouette",
    "line-of-action",
    "idle",
    "human-review-required",
    "r6-anime-extreme-displacement",
  ],
  beats: [
    {
      id: "open-settle",
      label: "Open authority stance",
      startTime: 0,
      endTime: 2.4,
      intention:
        "Present effortless authority through a grounded front-back stance, lowered open hands, broad chest and an unhurried forward gaze.",
      energy: 0.22,
      leadingBodyPart: "Torso",
      focalTarget: "Forward observer",
    },
  ],
  contacts: [
    {
      id: "rear-right-support",
      effector: "Right Leg",
      target: "Ground",
      startTime: 0,
      endTime: 2.4,
      positionWeight: 1,
      rotationWeight: 0.4,
      allowSlideMeters: 0.015,
    },
    {
      id: "front-left-contact",
      effector: "Left Leg",
      target: "Ground",
      startTime: 0,
      endTime: 2.4,
      positionWeight: 0.9,
      rotationWeight: 0.35,
      allowSlideMeters: 0.02,
    },
  ],
  tracks: joints.map((joint) => ({
    joint,
    space: "parent",
    keys: times.map((time, index) => ({
      time,
      position: positions[joint][index],
      rotationDegrees: rotations[joint][index],
      easing: { style: "cubicV2", direction: "inOut" },
      weight: 1,
    })),
  })),
};

const created = await post("/v1/drafts/create", { pairingCode, blueprint });
const draftId = created.draftId as string;
const validation = await action("validateAnimationDraft", { draftId });
const blockingIssues = validation?.report?.blockingIssues ?? [];
if (blockingIssues.length > 0) {
  throw new Error(`Blocking validation issues: ${blockingIssues.join("; ")}`);
}
const staged = await action(
  "stageAnimationDraft",
  { transactionName: "Reference pose - open authority R6", draftId },
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
  { animationName: name, normalizedTime: 0.5 },
  true,
);

process.stdout.write(JSON.stringify({ created, validation, staged, committed, attached, posed }, null, 2));
