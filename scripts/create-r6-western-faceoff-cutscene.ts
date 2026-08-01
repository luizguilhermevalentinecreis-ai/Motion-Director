import assert from "node:assert/strict";

const relay = process.env.MOTION_RELAY_URL ?? "https://motion-director-relay.onrender.com";
const pairingCode = process.env.MOTION_PAIRING_CODE;
if (!pairingCode) throw new Error("MOTION_PAIRING_CODE is required.");

type V3 = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type Pose = { position: Record<Joint, V3>; rotation: Record<Joint, V3> };
type Role = "A" | "B";

const duration = 12;
const fps = 120;
const sampleFps = 40;
const globalKeyCount = duration * sampleFps + 1;
const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const names = {
  A: "MD_R6_LeoneFaceoff_ActorA_120_V3",
  B: "MD_R6_LeoneFaceoff_ActorB_120_V3",
} as const;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const smooth = (u: number) => {
  const x = clamp01(u);
  return x * x * (3 - 2 * x);
};
const blendV3 = (a: V3, b: V3, u: number): V3 => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const zeroRecord = (): Record<Joint, V3> => Object.fromEntries(joints.map((joint) => [joint, [0, 0, 0] as V3])) as Record<Joint, V3>;

function finalPose(role: Role): Pose {
  const side = role === "A" ? 1 : -1;
  return {
    position: {
      Torso: [0.075 * side, -0.15, -3.25],
      Head: [0, 0, 0],
      "Right Arm": [0.06, -0.12, 0.01],
      "Left Arm": [-0.06, -0.12, 0.01],
      "Right Leg": [0.03, 0.02, role === "A" ? -0.14 : 0.1],
      "Left Leg": [-0.03, 0, role === "A" ? 0.1 : -0.14],
    },
    rotation: {
      Torso: [-7, 3 * side, 2.5 * side],
      Head: [5, -3 * side, -1.5 * side],
      "Right Arm": [role === "A" ? -7 : 3, -4, -9],
      "Left Arm": [role === "A" ? 3 : -7, 4, 9],
      "Right Leg": [role === "A" ? 10 : -7, -2, -1],
      "Left Leg": [role === "A" ? -7 : 10, 2, 1],
    },
  };
}

function approachPose(role: Role, t: number): Pose {
  const side = role === "A" ? 1 : -1;
  const stepDuration = 1.25;
  const clamped = Math.min(t, 7.4999);
  const segment = Math.floor(clamped / stepDuration);
  const raw = (clamped - segment * stepDuration) / stepDuration;
  const step = smooth(raw);
  const roleOffset = role === "A" ? 0 : 1;
  const startSign = (segment + roleOffset) % 2 === 0 ? 1 : -1;
  const stride = lerp(startSign, -startSign, step);
  const advancingRight = startSign < 0;
  const liftArc = Math.sin(Math.PI * raw);
  const travel = clamp01(t / 7.5);
  const z = -3.05 * smooth(travel);
  // Frank does not swagger straight at Harmonica: he chooses his mark on a
  // shallow arc. The lateral drift is spatial intent, not rhythmic sway.
  const xArc = 0.16 * side * smooth(travel);
  const contactCompression = 0.018 * Math.pow(Math.cos(Math.PI * raw), 2);
  const position = zeroRecord();
  const rotation = zeroRecord();

  position.Torso = [xArc, -0.135 - contactCompression, z];
  rotation.Torso = [-5.8 - 0.35 * contactCompression, 1.1 * side * travel, 0.48 * stride * side];
  // The gaze does not bounce with the gait. It gradually finds the opponent,
  // with only a delayed counter-rotation against the torso arc.
  rotation.Head = [4.2, -0.7 * side * travel, -0.18 * stride * side];

  // Hands remain near the hips. Shoulder drag is barely visible and never
  // becomes an expressive locomotion gesture.
  position["Right Arm"] = [0, -0.11, 0.004 * stride];
  position["Left Arm"] = [0, -0.11, -0.004 * stride];
  rotation["Right Arm"] = [-2.2 - 1.1 * stride, -3, -7.2];
  rotation["Left Arm"] = [-2.2 + 1.1 * stride, 3, 7.2];

  // Six low, deliberate steps. Only the recovering foot lifts; the supporting
  // side stays quiet long enough to communicate weight.
  position["Right Leg"] = [0, advancingRight ? 0.052 * liftArc : 0, -0.09 * stride];
  position["Left Leg"] = [0, advancingRight ? 0 : 0.052 * liftArc, 0.09 * stride];
  rotation["Right Leg"] = [15 * stride, -1, -0.2 * side];
  rotation["Left Leg"] = [-15 * stride, 1, 0.2 * side];
  return { position, rotation };
}

function poseAt(role: Role, t: number): Pose {
  const target = finalPose(role);
  if (t < 7.5) return approachPose(role, t);
  const source = approachPose(role, 7.5);
  const plant = smooth((t - 7.5) / 1.35);
  const pose: Pose = {
    position: Object.fromEntries(joints.map((joint) => [joint, blendV3(source.position[joint], target.position[joint], plant)])) as Record<Joint, V3>,
    rotation: Object.fromEntries(joints.map((joint) => [joint, blendV3(source.rotation[joint], target.rotation[joint], plant)])) as Record<Joint, V3>,
  };

  if (t >= 8.85) {
    const side = role === "A" ? 1 : -1;
    const settle = Math.exp(-(t - 8.85) * 3.6);
    const overshoot = Math.sin((t - 8.85) * 5.2) * settle;
    const breath = Math.sin((t - 8.85) * Math.PI * 0.36);
    pose.position.Torso[1] += 0.0045 * breath;
    pose.rotation.Torso[0] += 0.38 * overshoot + 0.08 * breath;
    pose.rotation.Torso[2] += 0.2 * overshoot * side;
    // Head counter-settles, then remains aimed down the opponent line.
    pose.rotation.Head[0] -= 0.24 * overshoot;
    pose.rotation.Head[1] -= 0.12 * overshoot * side;
    pose.rotation["Right Arm"][0] += 0.2 * overshoot;
    pose.rotation["Left Arm"][0] -= 0.2 * overshoot;
  }
  return pose;
}

function blueprint(role: Role) {
  const frames = Array.from({ length: globalKeyCount }, (_, index) => {
    const time = index / sampleFps;
    return { time, pose: poseAt(role, time) };
  });
  return {
    name: names[role],
    rigId: "Workspace.R6 [Dummy]",
    rigType: "R6",
    duration,
    framesPerSecond: fps,
    looped: false,
    priority: "action4",
    intent: `${role === "A" ? "Dominant fighter" : "Controlled rival"} approaches in the restrained physical language of Harmonica and Frank's final duel: low hands, shallow repositioning arc, delayed gaze, chosen mark, and threatening stillness.`,
    style: ["r6", "cinematic", "sergio-leone-inspired", "once-upon-a-time-in-the-west-reference", "western-faceoff", "pre-fight", "low-hands", "shallow-arc", "delayed-head-response", "grounded-weight", "chosen-mark", "threatening-stillness", "120fps", role === "A" ? "dominant" : "restrained-rival"],
    beats: [
      { id: "approach", label: "Leone measured approach", startTime: 0, endTime: 7.5, intention: "Take six low steps along a shallow arc with hands quiet at the hips and no swagger.", energy: 0.24, leadingBodyPart: role === "A" ? "Left Leg" : "Right Leg", focalTarget: "Chosen ground mark" },
      { id: "plant", label: "Choose the mark", startTime: 7.5, endTime: 8.85, intention: "Set the final stance slowly, let the pelvis accept the mass, then allow the head to finish the confrontation.", energy: 0.48, leadingBodyPart: "Torso", focalTarget: "Opponent centerline" },
      { id: "stare", label: "Threat through stillness", startTime: 8.85, endTime: 12, intention: "Hold the opponent with almost no secondary movement; silence is the dominant action.", energy: 0.76, leadingBodyPart: "Head", focalTarget: "Opponent eyes" },
    ],
    contacts: [
      { id: "walk-contacts", effector: "Left Leg", target: "Ground", startTime: 0, endTime: 7.5, positionWeight: 0.95, rotationWeight: 0.48, allowSlideMeters: 0.012 },
      { id: "final-left-support", effector: "Left Leg", target: "Ground", startTime: 7.7, endTime: 12, positionWeight: 1, rotationWeight: 0.68, allowSlideMeters: 0.004 },
      { id: "final-right-support", effector: "Right Leg", target: "Ground", startTime: 8.15, endTime: 12, positionWeight: 1, rotationWeight: 0.68, allowSlideMeters: 0.004 },
    ],
    tracks: joints.map((joint) => ({
      joint,
      space: "parent",
      keys: frames.map(({ time, pose }) => ({
        time,
        position: { x: pose.position[joint][0], y: pose.position[joint][1], z: pose.position[joint][2] },
        rotationDegrees: { x: pose.rotation[joint][0], y: pose.rotation[joint][1], z: pose.rotation[joint][2] },
        easing: { style: "linear", direction: "inOut" },
        weight: 1,
      })),
    })),
  };
}

assert.equal(globalKeyCount, 481);
assert.equal(blueprint("A").tracks.reduce((sum, track) => sum + track.keys.length, 0), 2886);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function post(path: string, body: unknown): Promise<any> {
  const response = await fetch(`${relay}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(json)}`);
  return json;
}
async function action(name: string, input: Record<string, unknown>, confirmWrite = false) {
  const started = await post("/v1/actions/execute", { pairingCode, action: name, input, ...(confirmWrite ? { confirmWrite: true } : {}) });
  if (started.status === "succeeded") return started.result;
  for (;;) {
    await sleep(started.pollAfterMs ?? 600);
    const job = await post("/v1/actions/job", { pairingCode, jobId: started.jobId });
    if (job.status === "succeeded") return job.result;
    if (job.status === "failed") throw new Error(`${name}: ${job.error}`);
  }
}

const results: Record<string, unknown> = {};
for (const role of ["A", "B"] as const) {
  const created = await post("/v1/drafts/create", { pairingCode, blueprint: blueprint(role) });
  const draftId = created.draftId as string;
  const validation = await action("validateAnimationDraft", { draftId });
  if ((validation?.report?.blockingIssues ?? []).length) throw new Error(validation.report.blockingIssues.join("; "));
  const staged = await action("stageAnimationDraft", { transactionName: `R6 western faceoff Actor ${role}`, draftId }, true);
  const committed = await action("commitAnimationDraft", { transactionId: staged.transactionId, destinationName: names[role] }, true);
  results[role] = { created, validation: { valid: validation.valid, overallScore: validation.report?.overallScore }, staged, committed };
}
const attached = await action("attachCommittedAnimations", { namePrefix: "MD_R6_LeoneFaceoff_" }, true);
const posed = await action("poseCommittedAnimation", { animationName: names.A, normalizedTime: 0.82 }, true);
process.stdout.write(JSON.stringify({ duration, fps, sampledAt: sampleFps, globalKeyCount, authoredKeysPerActor: globalKeyCount * joints.length, results, attached, posed }, null, 2));
