import assert from "node:assert/strict";

const relay = process.env.MOTION_RELAY_URL ?? "https://motion-director-relay.onrender.com";
const pairingCode = process.env.MOTION_PAIRING_CODE;
if (!pairingCode) throw new Error("MOTION_PAIRING_CODE is required.");

type V3 = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type Pose = { position: Record<Joint, V3>; rotation: Record<Joint, V3> };

const name = "MD_R6_KiPatrol_CompactFastWalk_120_V4";
const rigId = "Workspace.R6 [Dummy]";
const duration = 0.9;
const fps = 120;
const timelineFrames = duration * fps;
const globalKeyCount = 55;
const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const frameNumbers = Array.from(
  { length: globalKeyCount },
  (_, index) => Math.round((index * timelineFrames) / (globalKeyCount - 1)),
);

assert.equal(timelineFrames, 108);
assert.equal(frameNumbers.length, 55);
assert.equal(new Set(frameNumbers).size, 55);

const tau = Math.PI * 2;
const wave = (n: number, cycles = 1, phase = 0) => Math.sin(tau * (n * cycles + phase));
const cosine = (n: number, cycles = 1, phase = 0) => Math.cos(tau * (n * cycles + phase));

function poseAt(n: number): Pose {
  // The first harmonic carries the stride. The second and third harmonics
  // sharpen propulsion and recovery without adding redundant key poses.
  const rightLeg =
    25.5 * cosine(n)
    + 2.8 * wave(n, 2, -0.055)
    + 0.6 * wave(n, 3, 0.08);
  const leftLeg =
    -24.8 * cosine(n)
    - 2.7 * wave(n, 2, 0.02)
    - 0.55 * wave(n, 3, 0.08);

  // Squared cosine pulses are smooth at both their peaks and valleys. They
  // avoid the clipped half-wave kink used by the previous take.
  const contactBase = 0.5 + 0.5 * cosine(n, 2, -0.035);
  const contactPulse = contactBase * contactBase;
  const swing = wave(n, 1, 0.03);
  const rightSwingLift = 0.03 + 0.03 * swing;
  const leftSwingLift = 0.03 - 0.03 * swing;
  const lateralWeight = 0.011 * wave(n, 1, 0.25) + 0.002 * wave(n, 2, -0.08);

  // A delayed martial arm swing: broad enough to read as anime action, but
  // carried low and twisted like closed fists instead of loose Roblox pendulums.
  const rightArmPitch =
    -31.5 * cosine(n, 1, -0.05)
    - 3.5 * wave(n, 2, -0.08)
    + 1.2;
  const leftArmPitch =
    30.5 * cosine(n, 1, -0.035)
    + 3.2 * wave(n, 2, -0.025)
    + 0.1;
  const shoulderFlare = 0.9 * contactPulse;

  const torsoYaw = -2.4 * wave(n, 1, 0.015) - 0.3 * wave(n, 2, 0.09);
  const torsoRoll = -0.85 * cosine(n, 1, 0.02) - 0.18 * wave(n, 2, 0.11);
  const torsoPitch =
    -11.2
    - 1.2 * contactPulse
    + 0.45 * wave(n, 2, 0.18)
    + 0.18 * wave(n, 4, -0.07);

  // The gaze remains locked ahead while the neck has a one-beat delayed recoil.
  const headPitch = 3.3 + 0.3 * wave(n, 2, -0.06) + 0.1 * wave(n, 4, 0.14);
  const headYaw = -0.5 * torsoYaw + 0.12 * wave(n, 2, -0.12);
  const headRoll = -0.35 * torsoRoll + 0.05 * wave(n, 3, 0.04);

  return {
    position: {
      Torso: [
        lateralWeight,
        -0.21 - 0.04 * contactPulse + 0.006 * cosine(n, 4, 0.08),
        -0.105 - 0.012 * cosine(n, 2, -0.03),
      ],
      Head: [0, 0, 0],
      "Right Arm": [
        0.012 + 0.004 * contactPulse,
        -0.13 - 0.025 * contactPulse,
        -0.075 + 0.013 * wave(n, 1, -0.05),
      ],
      "Left Arm": [
        -0.014 - 0.004 * contactPulse,
        -0.145 - 0.028 * contactPulse,
        -0.08 - 0.012 * wave(n, 1, -0.035),
      ],
      "Right Leg": [
        0,
        rightSwingLift,
        -0.088 * cosine(n) - 0.012 * wave(n, 2, -0.05),
      ],
      "Left Leg": [
        0,
        leftSwingLift,
        0.085 * cosine(n) + 0.011 * wave(n, 2, 0.03),
      ],
    },
    rotation: {
      Torso: [torsoPitch, torsoYaw, torsoRoll],
      Head: [headPitch, headYaw, headRoll],
      "Right Arm": [
        rightArmPitch,
        -12.0 + 2.8 * wave(n, 1, -0.08),
        2.8 + shoulderFlare + 0.45 * wave(n, 2, 0.04),
      ],
      "Left Arm": [
        leftArmPitch,
        11.0 + 2.5 * wave(n, 1, -0.02),
        -3.0 - shoulderFlare - 0.4 * wave(n, 2, -0.02),
      ],
      "Right Leg": [
        rightLeg,
        -0.8 - 0.5 * wave(n),
        0.65 - 0.4 * wave(n, 1, 0.25),
      ],
      "Left Leg": [
        leftLeg,
        0.8 + 0.5 * wave(n),
        -0.65 + 0.4 * wave(n, 1, 0.25),
      ],
    },
  };
}

const samples = frameNumbers.map((frame) => {
  const normalized = frame / timelineFrames;
  return {
    frame,
    time: frame / fps,
    pose: poseAt(frame === timelineFrames ? 0 : normalized),
  };
});

assert.deepEqual(samples[0]!.pose, samples.at(-1)!.pose, "loop must close exactly");
assert.equal(samples.length * joints.length, 330);
for (const normalized of [0, 0.5]) {
  const pose = poseAt(normalized);
  assert.ok(pose.rotation["Right Leg"][0] * pose.rotation["Left Leg"][0] < 0);
  assert.ok(pose.rotation["Right Arm"][0] * pose.rotation["Right Leg"][0] < 0);
  assert.ok(pose.rotation["Left Arm"][0] * pose.rotation["Left Leg"][0] < 0);
}

const blueprint = {
  name,
  rigId,
  rigType: "R6",
  duration,
  framesPerSecond: fps,
  looped: true,
  priority: "movement",
  intent:
    "A compact fast serious-protagonist R6 RPG walk strongly informed by Dragon Ball Xenoverse 2's custom-warrior fantasy: speed comes from cadence rather than excessive leg separation, with one forward axis, close low foot trajectories, restrained delayed fists and smooth contact pulses.",
  style: [
    "r6",
    "dragon-ball-rpg-inspired",
    "ki-loaded-martial-walk",
    "time-patroller-attitude",
    "serious-protagonist",
    "forward-focused",
    "straight-travel-axis",
    "fast-walk",
    "compact-stride",
    "close-foot-paths",
    "smooth-contact-curves",
    "strategic-exaggeration",
    "r6-anime-extreme-displacement",
    "dense-designed-curve-sampling",
    "linear-inbetweens",
    "120fps",
    "human-review-required",
  ],
  beats: [
    {
      id: "right-contact-ki-brace",
      label: "Right contact and ki brace",
      startTime: 0,
      endTime: 0.225,
      intention: "Receive weight low and forward while the close low fists remain ready without displaying swagger.",
      energy: 0.62,
      leadingBodyPart: "Right Leg",
      focalTarget: "Forward travel line",
    },
    {
      id: "left-passing-snap",
      label: "Left passing snap",
      startTime: 0.225,
      endTime: 0.45,
      intention: "Recover the left leg low and quickly under a fixed serious gaze while shoulders overlap subtly behind the hips.",
      energy: 0.7,
      leadingBodyPart: "Left Leg",
      focalTarget: "Forward travel line",
    },
    {
      id: "left-contact-ki-brace",
      label: "Left contact and ki brace",
      startTime: 0.45,
      endTime: 0.675,
      intention: "Mirror the grounded contact without erasing the deliberate upper-body asymmetry.",
      energy: 0.64,
      leadingBodyPart: "Left Leg",
      focalTarget: "Forward travel line",
    },
    {
      id: "right-passing-loop",
      label: "Right passing loop recovery",
      startTime: 0.675,
      endTime: 0.9,
      intention: "Snap the right leg through and close the loop with continuous ki-loaded readiness.",
      energy: 0.72,
      leadingBodyPart: "Right Leg",
      focalTarget: "Forward travel line",
    },
  ],
  contacts: [
    {
      id: "right-contact-a",
      effector: "Right Leg",
      target: "Ground",
      startTime: 0,
      endTime: 0.15,
      positionWeight: 1,
      rotationWeight: 0.3,
      allowSlideMeters: 0.015,
    },
    {
      id: "left-contact",
      effector: "Left Leg",
      target: "Ground",
      startTime: 0.375,
      endTime: 0.54,
      positionWeight: 1,
      rotationWeight: 0.3,
      allowSlideMeters: 0.015,
    },
    {
      id: "right-contact-b",
      effector: "Right Leg",
      target: "Ground",
      startTime: 0.81,
      endTime: 0.9,
      positionWeight: 1,
      rotationWeight: 0.3,
      allowSlideMeters: 0.015,
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
      // These samples already lie on the intended polished curves. Linear
      // interpolation avoids restarting slow-in/slow-out on all 330 keys.
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
  { transactionName: "R6 Ki Patrol compact fast protagonist walk", draftId },
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
  { animationName: name, normalizedTime: 0.125 },
  true,
);

process.stdout.write(JSON.stringify({
  signature: {
    duration,
    fps,
    globalKeyCount,
    authoredKeys: globalKeyCount * joints.length,
    thesis: "Fast serious-hero travel driven by cadence, with compact close-foot strides aligned to one forward axis.",
  },
  created,
  validation,
  staged,
  committed,
  attached,
  posed,
}, null, 2));
