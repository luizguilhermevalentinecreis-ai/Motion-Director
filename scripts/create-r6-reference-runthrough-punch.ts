import { execFileSync } from "node:child_process";
import { animationDraftSchema, type AnimationDraft } from "../src/domain.js";

const relay = process.env.MOTION_RELAY_URL ?? "https://motion-director-relay.onrender.com";
const pairingCode = process.env.MOTION_PAIRING_CODE ?? "EZER3-ZHJGC";
const sourcePath = "ServerStorage.RBX_ANIMSAVES.kj anims.20 20 20 dropkick";
const destinationName = "MD_R6_FrenzyRun_RunawayPunch_v1";
const joints = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"] as const;
type Joint = typeof joints[number];
type V3 = { x: number; y: number; z: number };
type Q = { x: number; y: number; z: number; w: number };
type Transform = { position: V3; rotation: Q };
type DraftKey = {
  time: number;
  transform: Transform;
  easing: { style: "linear" | "constant" | "cubic" | "cubicV2" | "elastic" | "bounce"; direction: "in" | "out" | "inOut" };
  weight: number;
};
type RawPose = {
  name: string;
  cframe: Transform;
  easingStyle?: string;
  easingDirection?: string;
  weight?: number;
  children?: RawPose[];
};
type RawFrame = { time: number; poses: RawPose[] };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function action(name: string, input: Record<string, unknown>, confirmWrite = false): Promise<any> {
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

function flatten(poses: RawPose[]): RawPose[] {
  const result: RawPose[] = [];
  for (const pose of poses) {
    if ((joints as readonly string[]).includes(pose.name)) result.push(pose);
    if (pose.children) result.push(...flatten(pose.children));
  }
  return result;
}

function roundTime(value: number): number {
  return Number(value.toFixed(6));
}

function easingStyle(value?: string): DraftKey["easing"]["style"] {
  const normalized = value?.toLowerCase();
  if (normalized === "constant") return "constant";
  if (normalized === "cubic") return "cubic";
  if (normalized === "cubicv2") return "cubicV2";
  if (normalized === "elastic") return "elastic";
  if (normalized === "bounce") return "bounce";
  return "linear";
}

function easingDirection(value?: string): DraftKey["easing"]["direction"] {
  const normalized = value?.toLowerCase();
  if (normalized === "out") return "out";
  if (normalized === "inout") return "inOut";
  return "in";
}

function cloneTransform(transform: Transform): Transform {
  return {
    position: { ...transform.position },
    rotation: { ...transform.rotation },
  };
}

function poseKey(pose: RawPose, time: number): DraftKey {
  return {
    time: roundTime(time),
    transform: cloneTransform(pose.cframe),
    easing: {
      style: easingStyle(pose.easingStyle),
      direction: easingDirection(pose.easingDirection),
    },
    weight: Math.max(0, Math.min(1, pose.weight ?? 1)),
  };
}

function keyAtState(state: Transform, time: number): DraftKey {
  return {
    time: roundTime(time),
    transform: cloneTransform(state),
    easing: { style: "cubicV2", direction: "inOut" },
    weight: 1,
  };
}

function normalize(q: Q): Q {
  const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

function slerp(a: Q, bInput: Q, t: number): Q {
  let b = bInput;
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  if (dot < 0) {
    dot = -dot;
    b = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
  }
  if (dot > 0.9995) {
    return normalize({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      w: a.w + (b.w - a.w) * t,
    });
  }
  const theta = Math.acos(Math.min(1, dot));
  const sinTheta = Math.sin(theta);
  const left = Math.sin((1 - t) * theta) / sinTheta;
  const right = Math.sin(t * theta) / sinTheta;
  return normalize({
    x: a.x * left + b.x * right,
    y: a.y * left + b.y * right,
    z: a.z * left + b.z * right,
    w: a.w * left + b.w * right,
  });
}

function blendTransform(a: Transform, b: Transform, t: number): Transform {
  return {
    position: {
      x: a.position.x + (b.position.x - a.position.x) * t,
      y: a.position.y + (b.position.y - a.position.y) * t,
      z: a.position.z + (b.position.z - a.position.z) * t,
    },
    rotation: slerp(a.rotation, b.rotation, t),
  };
}

function dedupe(keys: DraftKey[]): DraftKey[] {
  const byTime = new Map<number, DraftKey>();
  for (const key of keys) byTime.set(roundTime(key.time), { ...key, time: roundTime(key.time) });
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function easingAmount(key: DraftKey, value: number): number {
  const t = Math.max(0, Math.min(1, value));
  if (key.easing.style === "constant") return 0;
  if (key.easing.style === "cubic" || key.easing.style === "cubicV2") {
    if (key.easing.direction === "in") return t * t * t;
    if (key.easing.direction === "out") return 1 - Math.pow(1 - t, 3);
    return t * t * (3 - 2 * t);
  }
  return t;
}

function sampleTrack(keysInput: DraftKey[], time: number): Transform {
  const keys = keysInput;
  if (time <= keys[0]!.time) return cloneTransform(keys[0]!.transform);
  if (time >= keys.at(-1)!.time) return cloneTransform(keys.at(-1)!.transform);
  let rightIndex = 1;
  while (rightIndex < keys.length && keys[rightIndex]!.time < time - 1e-7) rightIndex += 1;
  const left = keys[rightIndex - 1]!;
  const right = keys[rightIndex]!;
  const raw = (time - left.time) / Math.max(1e-7, right.time - left.time);
  return blendTransform(left.transform, right.transform, easingAmount(right, raw));
}

function resampleTrack(
  keysInput: DraftKey[],
  duration: number,
  fps: number,
  stabilizeForwardAxis: boolean,
): DraftKey[] {
  const keys = dedupe(keysInput);
  const count = Math.round(duration * fps);
  return Array.from({ length: count + 1 }, (_, index) => {
    const time = roundTime(Math.min(duration, index / fps));
    const transform = sampleTrack(keys, time);
    if (stabilizeForwardAxis && time >= 4.15) {
      const blend = (() => {
        const n = Math.max(0, Math.min(1, (time - 4.15) / 0.30));
        return n * n * (3 - 2 * n);
      })();
      const straightRunSway = 0.09 * Math.sin((time - 4.15) * Math.PI * 5.4);
      transform.position.x =
        transform.position.x * (1 - blend) + straightRunSway * blend;
    }
    return {
      time,
      transform,
      easing: { style: "linear", direction: "in" },
      weight: 1,
    };
  });
}

async function readReference(): Promise<RawFrame[]> {
  const frames: RawFrame[] = [];
  for (let page = 1; page <= 15; page += 1) {
    const result = await action("inspectAnimation", {
      sourcePath,
      section: "raw",
      page,
      pageSize: 10,
      parts: joints,
    });
    frames.push(...(result.rawKeyframes as RawFrame[]));
  }
  return frames.sort((a, b) => a.time - b.time);
}

function stateSnapshots(frames: RawFrame[]): Map<number, Map<Joint, Transform>> {
  const result = new Map<number, Map<Joint, Transform>>();
  const state = new Map<Joint, Transform>();
  for (const frame of frames) {
    for (const pose of flatten(frame.poses)) {
      state.set(pose.name as Joint, cloneTransform(pose.cframe));
    }
    result.set(roundTime(frame.time), new Map([...state].map(([joint, tf]) => [joint, cloneTransform(tf)])));
  }
  return result;
}

function stateAt(
  snapshots: Map<number, Map<Joint, Transform>>,
  time: number,
  joint: Joint,
): Transform {
  let found: Transform | undefined;
  for (const [snapshotTime, state] of snapshots) {
    if (snapshotTime > time + 1e-6) break;
    found = state.get(joint) ?? found;
  }
  if (!found) throw new Error(`No inherited state for ${joint} at ${time}`);
  return cloneTransform(found);
}

function referenceTrack(frames: RawFrame[], joint: Joint, endTime: number): DraftKey[] {
  const keys: DraftKey[] = [];
  for (const frame of frames) {
    if (frame.time > endTime + 1e-6) break;
    const pose = flatten(frame.poses).find((candidate) => candidate.name === joint);
    if (pose) keys.push(poseKey(pose, frame.time));
  }
  return keys;
}

function generatedPunchDraft(): AnimationDraft {
  const executable = process.platform === "win32"
    ? "node_modules\\.bin\\tsx.cmd"
    : "node_modules/.bin/tsx";
  const raw = execFileSync(
    executable,
    ["scripts/create-r6-world-solved-combat.ts"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        MOTION_DRAFT_NAME: "frenzy-ground-carry-punch",
        MOTION_EMIT_DRAFT: "1",
      },
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  return animationDraftSchema.parse(JSON.parse(raw));
}

async function main() {
  const frames = await readReference();
  const snapshots = stateSnapshots(frames);
  const punch = generatedPunchDraft();
  const cut = 4.65;
  const segmentStart = 2.916667;
  const bridge = 0.10;
  const extension = 2.40;
  const duration = roundTime(cut + extension);
  const segmentDuration = cut - segmentStart;
  const bodyJoints: Joint[] = ["Torso", "Head", "Left Arm", "Right Leg", "Left Leg"];
  const tracks: AnimationDraft["tracks"] = [];

  for (const joint of bodyJoints) {
    const keys = referenceTrack(frames, joint, cut);
    const cutState = stateAt(snapshots, cut, joint);
    const startState = stateAt(snapshots, segmentStart, joint);
    keys.push(keyAtState(cutState, cut));
    let cycleBase = cut;
    while (cycleBase < duration - 1e-6) {
      const bridgeEnd = cycleBase + bridge;
      if (bridgeEnd <= duration) keys.push(keyAtState(startState, bridgeEnd));
      for (const frame of frames) {
        if (frame.time <= segmentStart + 1e-6 || frame.time > cut + 1e-6) continue;
        const shifted = bridgeEnd + (frame.time - segmentStart);
        if (shifted > duration + 1e-6) break;
        const pose = flatten(frame.poses).find((candidate) => candidate.name === joint);
        if (pose) keys.push(poseKey(pose, shifted));
      }
      cycleBase += bridge + segmentDuration;
      if (cycleBase < duration - 1e-6) keys.push(keyAtState(cutState, cycleBase));
    }
    tracks.push({ joint, space: "motor", keys: dedupe(keys) });
  }

  const sourceArm = referenceTrack(frames, "Right Arm", cut);
  const sourceArmCut = stateAt(snapshots, cut, "Right Arm");
  const generatedArm = punch.tracks.find((track) => track.joint === "Right Arm");
  if (!generatedArm) throw new Error("Generated carry punch has no Right Arm track.");
  const armBlendDuration = 0.12;
  for (const key of generatedArm.keys) {
    const localTime = key.time;
    const smooth = localTime >= armBlendDuration
      ? 1
      : (() => {
          const n = localTime / armBlendDuration;
          return n * n * (3 - 2 * n);
        })();
    sourceArm.push({
      ...key,
      time: roundTime(cut + localTime),
      transform: blendTransform(sourceArmCut, key.transform, smooth),
      easing: { style: "linear", direction: "in" },
    });
  }
  tracks.push({ joint: "Right Arm", space: "motor", keys: dedupe(sourceArm) });
  const synchronizedTracks = tracks.map((track) => ({
    ...track,
    keys: resampleTrack(track.keys, duration, 60, track.joint === "Torso"),
  }));

  const draft = animationDraftSchema.parse({
    name: destinationName,
    rigId: "selection:1",
    duration,
    framesPerSecond: 60,
    looped: false,
    priority: "action",
    beats: [
      {
        id: "reference_frenzy_run",
        label: "20 20 20 run body",
        startTime: 0,
        endTime: cut,
        intention: "preserve the original accelerating run up to the last unbroken stride before braking",
        energy: 0.96,
        leadingBodyPart: "Torso",
      },
      {
        id: "punch_inside_stride",
        label: "running impact",
        startTime: cut,
        endTime: cut + 0.34,
        intention: "launch and land the punch without interrupting the inherited running cadence",
        energy: 1,
        leadingBodyPart: "Right Arm",
      },
      {
        id: "ground_carry_run",
        label: "continuous ground carry",
        startTime: cut + 0.34,
        endTime: duration,
        intention: "keep the torso folded and legs cycling while the engaged fist drives the fallen target forward",
        energy: 0.97,
        leadingBodyPart: "Right Leg",
      },
    ],
    contacts: [],
    tracks: synchronizedTracks,
    metadata: {
      intent:
        "Direct edit of the 20 20 20 dropkick run: cut before braking, continue its own body and leg mechanics, punch inside the stride, then keep running while ground-carrying the target.",
      rigType: "R6",
      style: [
        "reference-cut",
        "source-derived-run-cycle",
        "unbroken-running-punch",
        "ground-carry",
        "no-recovery",
        "human-review-required",
      ],
      version: 1,
    },
  });

  const validation = await action("validateAnimationDraft", { draft });
  const blocking = validation?.report?.blockingIssues ?? validation?.blockingIssues ?? [];
  if (blocking.length > 0) throw new Error(`Blocking validation issues: ${blocking.join("; ")}`);
  const staged = await action(
    "stageAnimationDraft",
    { transactionName: `${destinationName} source-cut rebuild`, draft },
    true,
  );
  const committed = await action(
    "commitAnimationDraft",
    { transactionId: staged.transactionId, destinationName },
    true,
  );
  const attached = await action(
    "attachCommittedAnimations",
    { namePrefix: destinationName },
    true,
  );
  process.stdout.write(JSON.stringify({
    destinationName,
    duration,
    cut,
    repeatedSourceSegment: { start: segmentStart, end: cut, bridge },
    trackKeyCounts: Object.fromEntries(
      synchronizedTracks.map((track) => [track.joint, track.keys.length]),
    ),
    validation,
    staged,
    committed,
    attached,
  }, null, 2));
}

await main();
