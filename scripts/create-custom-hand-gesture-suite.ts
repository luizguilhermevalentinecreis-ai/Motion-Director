import assert from "node:assert/strict";

const relay = process.env.MOTION_RELAY_URL ?? "https://motion-director-relay.onrender.com";
const pairingCode = process.env.MOTION_PAIRING_CODE;
if (!pairingCode) throw new Error("MOTION_PAIRING_CODE is required.");

type V3 = [number, number, number];
type Pose = Record<string, V3>;
type Gesture = { name: string; duration: number; looped: boolean; intent: string; poseAt: (n: number) => Pose };

const fingerBones = {
  index: ["Bone01", "Bone02", "Bone03", "Bone04"],
  middle: ["Bone05", "Bone06", "Bone07", "Bone08"],
  ring: ["Bone09", "Bone10", "Bone11", "Bone12"],
  pinky: ["Bone13", "Bone14", "Bone15", "Bone16"],
  thumb: ["Bone17", "Bone18", "Bone19"],
} as const;
const bones = Object.values(fingerBones).flat();
const sampleFps = 30;
const authoredFps = 60;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
const pulse = (n: number, start: number, end: number) => smooth((n - start) / (end - start));
const zeroPose = (): Pose => Object.fromEntries(bones.map((bone) => [bone, [0, 0, 0] as V3]));
const scaleV = (v: V3, s: number): V3 => [v[0] * s, v[1] * s, v[2] * s];
const setFinger = (pose: Pose, finger: keyof typeof fingerBones, curl: number, spread = 0, twist = 0) => {
  const chain = fingerBones[finger];
  if (finger === "thumb") {
    const values: V3[] = [
      [twist * 0.35, curl * 28, spread - curl * 34],
      [twist * 0.25, curl * 52, -curl * 8],
      [twist * 0.15, curl * 58, 0],
    ];
    chain.forEach((bone, index) => { pose[bone] = values[index]!; });
    return;
  }
  const curlAngles = [30, 72, 86, 34];
  chain.forEach((bone, index) => {
    pose[bone] = [twist * (index === 0 ? 1 : 0.25), curlAngles[index]! * curl, spread * (index === 0 ? 1 : 0.12)];
  });
};
const fistPose = (progress: number, thumbProgress = progress): Pose => {
  const pose = zeroPose();
  setFinger(pose, "index", progress, 2);
  setFinger(pose, "middle", progress, 0);
  setFinger(pose, "ring", progress, -2);
  setFinger(pose, "pinky", progress, -5);
  setFinger(pose, "thumb", thumbProgress, -18, 8);
  return pose;
};

const gestures: Gesture[] = [
  {
    name: "MD_HAND_FistClench_v1", duration: 1.25, looped: false,
    intent: "A natural sequential fist close: pinky initiates, ring and middle follow, index seals the front and the thumb locks across last with a subtle compression settle.",
    poseAt(n) {
      const pose = zeroPose();
      const amount = (delay: number) => pulse(n, delay, delay + 0.48) * (1 + 0.06 * Math.sin(Math.PI * pulse(n, 0.48, 0.82)));
      setFinger(pose, "pinky", amount(0.06), -5);
      setFinger(pose, "ring", amount(0.11), -2);
      setFinger(pose, "middle", amount(0.16), 0);
      setFinger(pose, "index", amount(0.21), 2);
      setFinger(pose, "thumb", pulse(n, 0.40, 0.82), -18, 8);
      return pose;
    },
  },
  {
    name: "MD_HAND_Point_v1", duration: 1.35, looped: false,
    intent: "A decisive pointing gesture with the index remaining long, other fingers closing in overlap, thumb bracing the middle finger and a small index settle toward the target.",
    poseAt(n) {
      const close = pulse(n, 0.10, 0.62);
      const pose = zeroPose();
      setFinger(pose, "index", 0.04 * close, 7 * close, -3 * close);
      setFinger(pose, "middle", close, -1);
      setFinger(pose, "ring", close, -3);
      setFinger(pose, "pinky", close, -6);
      setFinger(pose, "thumb", 0.72 * pulse(n, 0.30, 0.74), -24, 9);
      if (n > 0.68) {
        const wrist = pose.Bone01!;
        pose.Bone01 = [-2.5 * Math.sin((n - 0.68) * Math.PI / 0.32), wrist[1], wrist[2]];
      }
      return pose;
    },
  },
  {
    name: "MD_HAND_PeaceSign_v1", duration: 1.45, looped: false,
    intent: "A readable V sign: ring and pinky fold first, thumb pins them, then index and middle separate with asymmetric spread and a restrained overshoot.",
    poseAt(n) {
      const close = pulse(n, 0.08, 0.55);
      const open = pulse(n, 0.32, 0.78);
      const pose = zeroPose();
      setFinger(pose, "index", 0.035 * open, 13 * open, -2 * open);
      setFinger(pose, "middle", 0.025 * open, -9 * open, 1 * open);
      setFinger(pose, "ring", close, -3);
      setFinger(pose, "pinky", close, -7);
      setFinger(pose, "thumb", 0.78 * pulse(n, 0.25, 0.70), -26, 8);
      return pose;
    },
  },
  {
    name: "MD_HAND_ThumbsUp_v1", duration: 1.4, looped: false,
    intent: "A strong thumbs-up: four fingers close as a compact mass, thumb opposes out of the palm plane and straightens upward after the fist has formed.",
    poseAt(n) {
      const close = pulse(n, 0.06, 0.55);
      const pose = fistPose(close, 0);
      const thumb = pulse(n, 0.34, 0.78);
      pose.Bone17 = [-18 * thumb, -18 * thumb, -68 * thumb];
      pose.Bone18 = [-7 * thumb, -12 * thumb, -10 * thumb];
      pose.Bone19 = [0, -6 * thumb, 0];
      return pose;
    },
  },
  {
    name: "MD_HAND_Beckon_v1", duration: 1.8, looped: true,
    intent: "A come-here gesture: supporting fingers remain softly curled while the index performs two proximal-to-distal curls with tip drag and delayed release.",
    poseAt(n) {
      const pose = zeroPose();
      setFinger(pose, "middle", 0.34, -1);
      setFinger(pose, "ring", 0.48, -3);
      setFinger(pose, "pinky", 0.58, -6);
      setFinger(pose, "thumb", 0.38, -16, 5);
      const wave = (1 - Math.cos(Math.PI * 4 * n)) / 2;
      const root = smooth(wave);
      pose.Bone01 = [-4 * wave, 34 * root, 6];
      pose.Bone02 = [0, 62 * smooth(clamp01(wave * 1.18 - 0.08)), 1];
      pose.Bone03 = [0, 78 * smooth(clamp01(wave * 1.25 - 0.16)), 0];
      pose.Bone04 = [0, 26 * smooth(clamp01(wave * 1.35 - 0.26)), 0];
      return pose;
    },
  },
  {
    name: "MD_HAND_FingerRipple_v1", duration: 2.0, looped: true,
    intent: "A continuous finger ripple travelling pinky-to-index and back, using different joint delays so the motion flows through each chain rather than rotating every bone together.",
    poseAt(n) {
      const pose = zeroPose();
      const order: Array<keyof typeof fingerBones> = ["pinky", "ring", "middle", "index"];
      order.forEach((finger, index) => {
        const phase = Math.PI * 2 * n - index * 0.72;
        const curl = 0.12 + 0.34 * ((Math.sin(phase) + 1) / 2);
        setFinger(pose, finger, curl, 6 - index * 4, Math.sin(phase - 0.35) * 2);
      });
      const thumbBreath = 0.20 + 0.06 * Math.sin(Math.PI * 2 * n - 0.5);
      setFinger(pose, "thumb", thumbBreath, -13, 4);
      return pose;
    },
  },
];

function makeBlueprint(gesture: Gesture) {
  const frameCount = Math.round(gesture.duration * sampleFps);
  const samples = Array.from({ length: frameCount + 1 }, (_, index) => {
    const n = index / frameCount;
    return { time: n * gesture.duration, pose: gesture.poseAt(n) };
  });
  if (gesture.looped) samples[samples.length - 1]!.pose = structuredClone(samples[0]!.pose);
  return {
    name: gesture.name,
    rigId: "Workspace.Hand Rigged",
    rigType: "Custom",
    duration: gesture.duration,
    framesPerSecond: authoredFps,
    looped: gesture.looped,
    priority: "action",
    intent: gesture.intent,
    style: ["custom-bone-rig", "hand-acting", "finger-overlap", "anatomical-curl", "local-axis-authored", "gesture-readability", "dense-polish", "human-review-required"],
    beats: [
      { id: "gesture-form", label: "Gesture forms", startTime: 0, endTime: gesture.duration * 0.72, intention: gesture.intent, energy: 0.62, leadingBodyPart: gesture.name.includes("Thumb") ? "Bone17" : "Bone01", focalTarget: "Hand silhouette" },
      { id: "gesture-settle", label: "Gesture settles", startTime: gesture.duration * 0.72, endTime: gesture.duration, intention: "Preserve a clean readable hand silhouette without a mechanical stop.", energy: 0.34, leadingBodyPart: "Bone01", focalTarget: "Fingertips" },
    ],
    contacts: [],
    tracks: bones.map((bone) => ({
      joint: bone,
      // Bone.Transform is already authored in each Bone's local space.
      space: "local",
      keys: samples.map(({ time, pose }) => ({
        time,
        position: { x: 0, y: 0, z: 0 },
        rotationDegrees: { x: pose[bone]![0], y: pose[bone]![1], z: pose[bone]![2] },
        easing: { style: "linear", direction: "inOut" },
        weight: 1,
      })),
    })),
  };
}

assert.equal(bones.length, 19);
assert.equal(new Set(bones).size, 19);

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

const results = [];
for (const gesture of gestures) {
  const blueprint = makeBlueprint(gesture);
  const created = await post("/v1/drafts/create", { pairingCode, blueprint });
  const validation = await action("validateAnimationDraft", { draftId: created.draftId });
  if ((validation?.report?.blockingIssues ?? []).length) throw new Error(`${gesture.name}: ${validation.report.blockingIssues.join("; ")}`);
  const staged = await action("stageAnimationDraft", { transactionName: `Custom hand gesture: ${gesture.name}`, draftId: created.draftId }, true);
  const committed = await action("commitAnimationDraft", { transactionId: staged.transactionId, destinationName: gesture.name }, true);
  results.push({ name: gesture.name, score: validation.report?.overallScore, keyCount: committed.keyframeCount });
}
const attached = await action("attachCommittedAnimations", { namePrefix: "MD_HAND_" }, true);
const posed = await action("poseCommittedAnimation", { animationName: "MD_HAND_PeaceSign_v1", normalizedTime: 0.86 }, true);
process.stdout.write(JSON.stringify({ rig: "Workspace.Hand Rigged", topology: "Bone", fingerMapping: fingerBones, results, attached, posed }, null, 2));
