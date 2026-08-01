import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { draftFromBlueprint, quaternionFromEulerDegrees } from "../src/draft-authoring.js";

type V3 = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type PoseKey = { t: number; label: string; r: Record<Joint, V3>; p: Record<Joint, V3> };

const dryRun = process.env.DRY === "1";
const name = "MD_R6_FangRushCombo_60_V1";
const rigId = process.env.MOTION_RIG_ID ?? "Workspace.R6 [Dummy]";
const duration = 1.75;
const fps = 60;
const timelineFrames = duration * fps;
const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];

// Parent-space axes are the Part0 part's axes: -Z forward, +Y up, +X the
// character's right. So a positive arm pitch throws the fist forward, a
// positive leg pitch swings the leg forward, a negative torso pitch leans in,
// and a negative torso yaw blades the left shoulder toward the opponent.
const guardRotation: Record<Joint, V3> = {
  Torso: [-8, -22, 0],
  Head: [2, 18, 0],
  "Right Arm": [50, 0, -25],
  "Left Arm": [60, 0, 25],
  "Right Leg": [-12, 0, -6],
  "Left Leg": [15, 0, 5],
};
const guardPosition: Record<Joint, V3> = {
  Torso: [0, -0.25, -0.04],
  Head: [0, 0, 0],
  "Right Arm": [0, -0.05, -0.03],
  "Left Arm": [0, -0.05, -0.03],
  "Right Leg": [0, 0, 0],
  "Left Leg": [0, 0, 0],
};

const keys: PoseKey[] = [
  {
    t: 0,
    label: "guard",
    r: guardRotation,
    p: guardPosition,
  },
  {
    // Coil right to load the lead hand, and sink so the drive comes from the legs.
    t: 0.1,
    label: "anticipation",
    r: {
      Torso: [-11, -34, 3],
      Head: [3, 26, -1],
      "Right Arm": [46, 0, -28],
      "Left Arm": [52, -4, 32],
      "Right Leg": [-14, 0, -7],
      "Left Leg": [18, 0, 6],
    },
    p: {
      Torso: [0.01, -0.3, -0.02],
      Head: [0, 0, 0],
      "Right Arm": [0, -0.05, -0.02],
      "Left Arm": [0, -0.05, 0.01],
      "Right Leg": [0, 0, 0],
      "Left Leg": [0, 0, 0],
    },
  },
  {
    // Hit 1: the jab unwinds the coil. Torso yaw does the work, not the shoulder.
    t: 0.21,
    label: "jab-impact",
    r: {
      Torso: [-13, -6, 1],
      Head: [1, 3, 0],
      "Right Arm": [44, 0, -30],
      "Left Arm": [92, -6, 8],
      "Right Leg": [-16, 0, -7],
      "Left Leg": [20, 0, 5],
    },
    p: {
      Torso: [0, -0.27, -0.1],
      Head: [0, 0, 0],
      "Right Arm": [0, -0.05, -0.02],
      "Left Arm": [0, -0.03, -0.13],
      "Right Leg": [0, 0, 0],
      "Left Leg": [0, 0, -0.03],
    },
  },
  {
    // Follow-through. The fist keeps drifting a few degrees past contact before
    // it retracts, so the strike decelerates through the reversal instead of
    // hitting a one-frame velocity cliff.
    t: 0.26,
    label: "jab-follow-through",
    r: {
      Torso: [-13, -9, 1],
      Head: [1, 1, 0],
      "Right Arm": [45, 0, -29],
      "Left Arm": [96, -7, 6],
      "Right Leg": [-16, 0, -7],
      "Left Leg": [20, 0, 5],
    },
    p: {
      Torso: [0, -0.27, -0.11],
      Head: [0, 0, 0],
      "Right Arm": [0, -0.05, -0.02],
      "Left Arm": [0, -0.03, -0.15],
      "Right Leg": [0, 0, 0],
      "Left Leg": [0, 0, -0.03],
    },
  },
  {
    // Recoil the jab and store the rotation the cross will spend.
    t: 0.33,
    label: "jab-recoil",
    r: {
      Torso: [-11, -18, 2],
      Head: [2, 10, 0],
      "Right Arm": [50, 0, -26],
      "Left Arm": [64, -2, 26],
      "Right Leg": [-14, 0, -7],
      "Left Leg": [17, 0, 5],
    },
    p: {
      Torso: [0, -0.29, -0.06],
      Head: [0, 0, 0],
      "Right Arm": [0, -0.05, -0.02],
      "Left Arm": [0, -0.05, -0.03],
      "Right Leg": [0, 0, 0],
      "Left Leg": [0, 0, 0],
    },
  },
  {
    // Hit 2: the cross. A 44-degree torso whip is the power source; the rear
    // foot pivots so the hip can actually deliver it.
    t: 0.45,
    label: "cross-impact",
    r: {
      Torso: [-15, 30, -4],
      Head: [1, -14, 1],
      "Right Arm": [96, 8, -4],
      "Left Arm": [50, 4, 34],
      "Right Leg": [-8, 0, -4],
      "Left Leg": [14, 0, 5],
    },
    p: {
      Torso: [-0.01, -0.26, -0.13],
      Head: [0, 0, 0],
      "Right Arm": [0.02, -0.03, -0.15],
      "Left Arm": [0, -0.05, 0.01],
      "Right Leg": [0, 0, 0],
      "Left Leg": [0, 0, -0.02],
    },
  },
  {
    // The cross drifts through its own follow-through before the weight
    // transfers onto the right foot.
    t: 0.51,
    label: "cross-follow-through",
    r: {
      Torso: [-15, 26, -5],
      Head: [1, -17, 1],
      "Right Arm": [99, 9, -2],
      "Left Arm": [51, 4, 33],
      "Right Leg": [-7, 0, -4],
      "Left Leg": [20, 1, 8],
    },
    p: {
      Torso: [-0.01, -0.25, -0.13],
      Head: [0, 0, 0],
      "Right Arm": [0.02, -0.03, -0.16],
      "Left Arm": [0, -0.05, 0.01],
      "Right Leg": [0, 0, 0],
      "Left Leg": [0, 0, -0.02],
    },
  },
  {
    // Plant on the right foot and chamber the left leg. R6 has no knee, so the
    // chamber is the whole leg lifting forward and out.
    t: 0.58,
    label: "kick-chamber",
    r: {
      Torso: [-12, 14, -8],
      Head: [2, -8, 2],
      "Right Arm": [58, 4, -22],
      "Left Arm": [54, 2, 30],
      "Right Leg": [-4, 0, -3],
      "Left Leg": [44, 6, 18],
    },
    p: {
      Torso: [-0.02, -0.24, -0.08],
      Head: [0, 0, 0],
      "Right Arm": [0, -0.05, -0.03],
      "Left Arm": [0, -0.05, -0.02],
      "Right Leg": [0, 0, 0],
      "Left Leg": [0, 0.04, -0.05],
    },
  },
  {
    // Hit 3: left roundhouse. The torso leans away from the kick because the
    // support leg is the only thing holding the mass up.
    t: 0.72,
    label: "roundhouse-impact",
    r: {
      Torso: [-6, 39, -16],
      Head: [3, -20, 4],
      "Right Arm": [34, 6, -46],
      "Left Arm": [40, 0, 16],
      "Right Leg": [-6, 0, -2],
      "Left Leg": [72, 10, 34],
    },
    p: {
      Torso: [-0.03, -0.18, -0.1],
      Head: [0, 0, 0],
      "Right Arm": [0, -0.04, -0.02],
      "Left Arm": [0, -0.05, -0.02],
      "Right Leg": [0, 0, 0],
      "Left Leg": [0.02, 0.05, -0.11],
    },
  },
  {
    // The leg keeps travelling through the target before the mass comes back
    // down, which is what makes a roundhouse read as heavy rather than tapped.
    t: 0.79,
    label: "roundhouse-follow-through",
    r: {
      Torso: [-5, 36, -18],
      Head: [3, -21, 4],
      "Right Arm": [36, 5, -44],
      "Left Arm": [40, 0, 15],
      "Right Leg": [-6, 0, -2],
      "Left Leg": [76, 11, 37],
    },
    p: {
      Torso: [-0.03, -0.17, -0.1],
      Head: [0, 0, 0],
      "Right Arm": [0, -0.04, -0.02],
      "Left Arm": [0, -0.05, -0.02],
      "Right Leg": [0, 0, 0],
      "Left Leg": [0.02, 0.05, -0.12],
    },
  },
  {
    // Land and absorb. The root drops because the legs cannot.
    t: 0.88,
    label: "kick-land",
    r: {
      Torso: [-12, 20, -6],
      Head: [2, -11, 2],
      "Right Arm": [46, 2, -32],
      "Left Arm": [50, 0, 26],
      "Right Leg": [-10, 0, -5],
      "Left Leg": [26, 2, 10],
    },
    p: {
      Torso: [-0.01, -0.3, -0.06],
      Head: [0, 0, 0],
      "Right Arm": [0, -0.05, -0.03],
      "Left Arm": [0, -0.05, -0.03],
      "Right Leg": [0, 0, 0],
      "Left Leg": [0, 0.01, -0.02],
    },
  },
  {
    // Wind the spin the other way. The head leads: it finds the target before
    // the body commits, which is what makes a blind spinning attack readable.
    t: 1.06,
    label: "spin-load",
    r: {
      Torso: [-14, -46, 10],
      Head: [4, -50, -4],
      "Right Arm": [30, -8, -40],
      "Left Arm": [44, 6, 40],
      "Right Leg": [-34, -6, -12],
      "Left Leg": [10, 0, 4],
    },
    p: {
      Torso: [0.02, -0.28, -0.04],
      Head: [0, 0, 0],
      "Right Arm": [0, -0.05, 0.02],
      "Left Arm": [0, -0.05, 0.02],
      "Right Leg": [0, 0.02, 0.04],
      "Left Leg": [0, 0, 0],
    },
  },
  {
    // Hit 4: spinning back kick. 64 degrees of torso whip unloads into the
    // right leg, the torso pitches back to counterweight the high extension,
    // and both arms are thrown wide by the rotation.
    t: 1.3,
    label: "impact",
    r: {
      Torso: [10, 18, -22],
      Head: [6, -16, 6],
      "Right Arm": [26, 10, -58],
      "Left Arm": [36, -6, 50],
      "Right Leg": [78, 10, -26],
      "Left Leg": [-14, 0, -4],
    },
    p: {
      Torso: [-0.04, -0.12, -0.09],
      Head: [0, 0, 0],
      "Right Arm": [0, -0.03, 0.02],
      "Left Arm": [0, -0.03, 0.02],
      "Right Leg": [0.03, 0.06, -0.14],
      "Left Leg": [0, 0, 0.02],
    },
  },
  {
    // A short held extension instead of a hard freeze: the follow-through keeps
    // drifting so the stop never becomes a one-frame velocity cliff.
    t: 1.44,
    label: "follow-through",
    r: {
      Torso: [8, 24, -20],
      Head: [5, -12, 5],
      "Right Arm": [28, 8, -54],
      "Left Arm": [38, -4, 46],
      "Right Leg": [73, 9, -30],
      "Left Leg": [-12, 0, -4],
    },
    p: {
      Torso: [-0.04, -0.16, -0.08],
      Head: [0, 0, 0],
      "Right Arm": [0, -0.03, 0.02],
      "Left Arm": [0, -0.03, 0.02],
      "Right Leg": [0.03, 0.05, -0.12],
      "Left Leg": [0, 0, 0.02],
    },
  },
  {
    // Recover under the body and reabsorb, ready to chain.
    t: 1.6,
    label: "recovery",
    r: {
      Torso: [-10, 0, -4],
      Head: [2, 6, 1],
      "Right Arm": [44, 2, -30],
      "Left Arm": [52, 0, 28],
      "Right Leg": [20, 2, -8],
      "Left Leg": [-6, 0, 2],
    },
    p: {
      Torso: [-0.01, -0.3, -0.05],
      Head: [0, 0, 0],
      "Right Arm": [0, -0.05, -0.03],
      "Left Arm": [0, -0.05, -0.03],
      "Right Leg": [0, 0.01, -0.02],
      "Left Leg": [0, 0, 0],
    },
  },
  {
    // Settle back into the exact opening guard so the combo can chain into itself.
    t: 1.75,
    label: "guard-return",
    r: guardRotation,
    p: guardPosition,
  },
];

for (let index = 1; index < keys.length; index += 1) {
  assert.ok(keys[index]!.t > keys[index - 1]!.t, "pose keys must be chronological");
}
assert.equal(keys.at(-1)!.t, duration);

// Non-uniform Catmull-Rom. C1 continuity means velocity never jumps between
// segments, which is what keeps a snappy combo from reading as a stutter.
function tangent(values: number[], times: number[], index: number): number {
  if (index === 0) return (values[1]! - values[0]!) / (times[1]! - times[0]!);
  if (index === values.length - 1) {
    return (values[index]! - values[index - 1]!) / (times[index]! - times[index - 1]!);
  }
  return (values[index + 1]! - values[index - 1]!) / (times[index + 1]! - times[index - 1]!);
}

function sampleChannel(values: number[], times: number[], time: number): number {
  let segment = 0;
  while (segment < times.length - 2 && time > times[segment + 1]!) segment += 1;
  const t0 = times[segment]!;
  const t1 = times[segment + 1]!;
  const h = t1 - t0;
  const u = Math.min(1, Math.max(0, (time - t0) / h));
  const m0 = tangent(values, times, segment);
  const m1 = tangent(values, times, segment + 1);
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    (2 * u3 - 3 * u2 + 1) * values[segment]! +
    (u3 - 2 * u2 + u) * h * m0 +
    (-2 * u3 + 3 * u2) * values[segment + 1]! +
    (u3 - u2) * h * m1
  );
}

const times = keys.map((key) => key.t);
const channel = (joint: Joint, kind: "r" | "p", axis: number) =>
  keys.map((key) => key[kind][joint][axis]!);

const samples = Array.from({ length: timelineFrames + 1 }, (_, frame) => {
  const time = frame / fps;
  const rotation = {} as Record<Joint, V3>;
  const position = {} as Record<Joint, V3>;
  for (const joint of joints) {
    rotation[joint] = [0, 1, 2].map((axis) =>
      sampleChannel(channel(joint, "r", axis), times, time),
    ) as V3;
    position[joint] = [0, 1, 2].map((axis) =>
      sampleChannel(channel(joint, "p", axis), times, time),
    ) as V3;
  }
  return { time, rotation, position };
});

// Catmull-Rom can overshoot at sharp direction changes. Overshoot is desirable
// follow-through, but it still has to land inside the R6 combat envelopes.
const envelope: Record<Joint, number> = {
  Torso: 45 * 1.5,
  Head: 55 * 1.5,
  "Right Arm": 125 * 1.5,
  "Left Arm": 125 * 1.5,
  "Right Leg": 65 * 1.5,
  "Left Leg": 65 * 1.5,
};
// A head does not reciprocate as sharply as the torso it sits on: it carries
// the same intent with softened extremes. Smoothing the sampled head channels
// with a centered window keeps the authored timing (including the deliberate
// spin lead) while removing corners the neck would never actually produce.
const headWindow = 4;
for (const axis of [0, 1, 2]) {
  const raw = samples.map((sample) => sample.rotation.Head[axis]!);
  samples.forEach((sample, index) => {
    let sum = 0;
    let count = 0;
    for (let offset = -headWindow; offset <= headWindow; offset += 1) {
      const neighbour = raw[Math.min(raw.length - 1, Math.max(0, index + offset))]!;
      sum += neighbour;
      count += 1;
    }
    sample.rotation.Head[axis] = sum / count;
  });
}

// The rubric measures the composed quaternion's rotation magnitude, which is
// not the Euclidean norm of the three Euler angles, so check what it checks.
const quaternionAngle = (euler: V3) => {
  const q = quaternionFromEulerDegrees({ x: euler[0], y: euler[1], z: euler[2] });
  return (2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180) / Math.PI;
};
for (const joint of joints) {
  const worst = Math.max(...samples.map((sample) => quaternionAngle(sample.rotation[joint])));
  assert.ok(
    worst < envelope[joint],
    `${joint} peaks at ${worst.toFixed(1)} deg, over its ${envelope[joint]} deg combat envelope`,
  );
}
const worstOffset = Math.max(
  ...samples.flatMap((sample) =>
    joints.filter((j) => j !== "Torso").map((j) => Math.hypot(...sample.position[j])),
  ),
);
assert.ok(worstOffset <= 0.72, `limb offset ${worstOffset.toFixed(3)} exceeds the combat envelope`);

const blueprint = {
  name,
  rigId,
  rigType: "R6" as const,
  duration,
  framesPerSecond: fps,
  looped: false,
  priority: "action" as const,
  intent:
    "A four-hit R6 fighting-game combo: left jab, right cross, left roundhouse, and a spinning right back kick finisher. Every strike is powered by torso rotation rather than the shoulder or hip alone, the root carries all compression because R6 limbs are rigid, and the head leads the spin so the blind finisher stays readable.",
  style: [
    "r6",
    "combat-strike",
    "right-leg",
    "r6-combat-displacement",
    "fighting-game-skill",
    "four-hit-combo",
    "torso-driven-power",
    "head-leads-spin",
    "chainable-guard-loop",
    "dense-sampled",
    "linear-inbetweens",
    "60fps",
    "human-review-required",
  ],
  beats: [
    {
      id: "anticipation",
      label: "Coil and load",
      startTime: 0,
      endTime: 0.1,
      intention: "Blade the stance, coil the torso right, and sink so the combo is driven by the legs rather than the arms.",
      energy: 0.35,
      leadingBodyPart: "Torso",
      focalTarget: "Opponent centerline",
    },
    {
      id: "jab",
      label: "Lead jab",
      startTime: 0.1,
      endTime: 0.31,
      intention: "Spend the coil on a fast lead hand that opens the guard without overcommitting the weight.",
      energy: 0.62,
      leadingBodyPart: "Left Arm",
      focalTarget: "Opponent head",
    },
    {
      id: "cross",
      label: "Rear cross",
      startTime: 0.31,
      endTime: 0.56,
      intention: "Whip the torso the other way and let the rear hand arrive with the full hip rotation behind it.",
      energy: 0.82,
      leadingBodyPart: "Right Arm",
      focalTarget: "Opponent head",
    },
    {
      id: "roundhouse",
      label: "Left roundhouse",
      startTime: 0.56,
      endTime: 0.86,
      intention: "Transfer onto the right foot and swing the whole left leg through, leaning away to keep the mass balanced.",
      energy: 0.88,
      leadingBodyPart: "Left Leg",
      focalTarget: "Opponent ribs",
    },
    {
      id: "spin-load",
      label: "Spin windup",
      startTime: 0.86,
      endTime: 1.18,
      intention: "Reverse the rotation and let the head find the target first so the blind finisher reads before it lands.",
      energy: 0.7,
      leadingBodyPart: "Head",
      focalTarget: "Opponent centerline",
    },
    {
      id: "impact",
      label: "Spinning back kick finisher",
      startTime: 1.18,
      endTime: 1.46,
      intention: "Unload the stored rotation into the right leg at full extension, counterweighted by a backward torso pitch.",
      energy: 1,
      leadingBodyPart: "Right Leg",
      focalTarget: "Opponent chest",
    },
    {
      id: "recovery",
      label: "Recover to guard",
      startTime: 1.46,
      endTime: 1.75,
      intention: "Bring the leg back under the body, reabsorb into the guard, and end ready to chain.",
      energy: 0.4,
      leadingBodyPart: "Torso",
      focalTarget: "Opponent centerline",
    },
  ],
  contacts: [
    {
      id: "left-foot-base",
      effector: "Left Leg",
      target: "Ground",
      startTime: 0,
      endTime: 0.5,
      positionWeight: 1,
      rotationWeight: 0.3,
      allowSlideMeters: 0.02,
    },
    {
      id: "right-foot-plant",
      effector: "Right Leg",
      target: "Ground",
      startTime: 0.52,
      endTime: 0.88,
      positionWeight: 1,
      rotationWeight: 0.3,
      allowSlideMeters: 0.02,
    },
    {
      id: "left-foot-pivot",
      effector: "Left Leg",
      target: "Ground",
      startTime: 0.95,
      endTime: 1.5,
      positionWeight: 1,
      rotationWeight: 0.2,
      allowSlideMeters: 0.06,
    },
    {
      id: "right-foot-recover",
      effector: "Right Leg",
      target: "Ground",
      startTime: 1.62,
      endTime: 1.75,
      positionWeight: 1,
      rotationWeight: 0.3,
      allowSlideMeters: 0.02,
    },
  ],
  tracks: joints.map((joint) => ({
    joint,
    space: "parent" as const,
    keys: samples.map((sample) => ({
      time: sample.time,
      position: {
        x: sample.position[joint][0],
        y: sample.position[joint][1],
        z: sample.position[joint][2],
      },
      rotationDegrees: {
        x: sample.rotation[joint][0],
        y: sample.rotation[joint][1],
        z: sample.rotation[joint][2],
      },
      easing: { style: "linear" as const, direction: "inOut" as const },
      weight: 1,
    })),
  })),
};

const draft = draftFromBlueprint(blueprint);

if (process.env.DIAG === "1") {
  for (const joint of joints) {
    const trackKeys = draft.tracks.find((t) => t.joint === joint)!.keys;
    const speeds: number[] = [];
    for (let i = 1; i < trackKeys.length; i += 1) {
      const a = trackKeys[i - 1]!.transform.rotation;
      const b = trackKeys[i]!.transform.rotation;
      const dot = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
      speeds.push(((2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI) * fps);
    }
    const hits: string[] = [];
    for (let i = 1; i < speeds.length; i += 1) {
      const hi = Math.max(speeds[i - 1]!, speeds[i]!);
      const lo = Math.min(speeds[i - 1]!, speeds[i]!);
      if (hi >= 20 && hi / Math.max(8, lo) > 3.5) {
        hits.push(`t=${(i / fps).toFixed(2)}s ${lo.toFixed(0)}->${hi.toFixed(0)}`);
      }
    }
    process.stdout.write(`${joint.padEnd(10)} ${hits.length} spikes  ${hits.join("  ")}\n`);
  }
}

const client = new Client({ name: "motion-director-fighting-combo", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/src/index.js"],
  cwd: process.cwd(),
  env: Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  ),
  stderr: "pipe",
});

function payload(result: { content?: unknown }): any {
  const first = (result.content as { type: string; text: string }[] | undefined)?.[0];
  if (!first) return undefined;
  try {
    return JSON.parse(first.text);
  } catch {
    return first.text;
  }
}

async function call(tool: string, args: Record<string, unknown>): Promise<any> {
  const result = await client.callTool({ name: tool, arguments: args });
  if (result.isError) throw new Error(`${tool}: ${JSON.stringify(result.content)}`);
  return payload(result as { content?: unknown });
}

try {
  await client.connect(transport);

  const validation = await call("validate_animation_draft", { draft });
  const report = validation.report;
  process.stdout.write(
    `\nvalid=${validation.valid}  overallScore=${report.overallScore.toFixed(4)}\n` +
      `keys=${samples.length * joints.length} (${samples.length} per joint x ${joints.length} joints)\n\n` +
      report.metrics
        .map(
          (metric: any) =>
            `  ${metric.score.toFixed(3)}  ${metric.severity.padEnd(7)} ${metric.name}` +
            (metric.joints.length > 0 ? `  [${metric.joints.join(", ")}]` : "") +
            `\n         ${metric.explanation}` +
            (metric.suggestedAction ? `\n         -> ${metric.suggestedAction}` : ""),
        )
        .join("\n") +
      `\n\nblockingIssues: ${JSON.stringify(report.blockingIssues)}\n`,
  );

  if (dryRun) {
    process.stdout.write("\nDRY run: nothing was sent to Studio.\n");
  } else {
    let status = await call("studio_status", {});
    for (let attempt = 0; attempt < 20 && !status.connected; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      status = await call("studio_status", {});
    }
    if (!status.connected) throw new Error("Roblox Studio never reconnected to the bridge.");
    process.stdout.write(`\nstudio: ${status.session.placeName} (plugin ${status.session.pluginVersion})\n`);

    const staged = await call("stage_animation_draft", {
      transactionName: "R6 four-hit fighting combo",
      draft,
    });
    process.stdout.write(`\nstaged: ${JSON.stringify(staged)}\n`);

    const committed = await call("commit_animation_draft", {
      transactionId: staged.transactionId,
      destinationName: name,
    });
    process.stdout.write(`committed: ${JSON.stringify(committed)}\n`);

    const attached = await call("attach_committed_animations_to_selected_rig_animsaves", {
      namePrefix: name,
    });
    process.stdout.write(`attached: ${JSON.stringify(attached)}\n`);
  }
} finally {
  await client.close();
}
