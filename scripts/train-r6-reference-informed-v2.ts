import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { animationDraftSchema, type AnimationDraft } from "../src/domain.js";

type V3 = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type Pose = { p: Record<Joint, V3>; r: Record<Joint, V3> };
type Point = { n: number; pose: Pose; curve?: "smooth" | "snap" | "linear" };
type Motion = {
  name: string;
  duration: number;
  looped: boolean;
  intent: string;
  tags: string[];
  points: Point[];
  positionGain?: Partial<Record<Joint, number>>;
  rotationGain?: Partial<Record<Joint, number>>;
};

const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const zeros = (): Record<Joint, V3> => ({
  Torso: [0, 0, 0], Head: [0, 0, 0],
  "Right Arm": [0, 0, 0], "Left Arm": [0, 0, 0],
  "Right Leg": [0, 0, 0], "Left Leg": [0, 0, 0],
});
const P = (
  positions: Partial<Record<Joint, V3>> = {},
  rotations: Partial<Record<Joint, V3>> = {},
): Pose => ({ p: { ...zeros(), ...positions }, r: { ...zeros(), ...rotations } });
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => { const n = clamp(t); return n * n * (3 - 2 * n); };
const snap = (t: number) => 1 - Math.pow(1 - clamp(t), 3.4);
const blend = (a: Pose, b: Pose, t: number): Pose => {
  const p = zeros();
  const r = zeros();
  for (const joint of joints) {
    p[joint] = a.p[joint].map((v, i) => mix(v, b.p[joint][i]!, t)) as V3;
    r[joint] = a.r[joint].map((v, i) => mix(v, b.r[joint][i]!, t)) as V3;
  }
  return { p, r };
};
const sample = (points: Point[], n: number): Pose => {
  if (n <= points[0]!.n) return points[0]!.pose;
  for (let i = 1; i < points.length; i += 1) {
    const next = points[i]!;
    if (n <= next.n) {
      const previous = points[i - 1]!;
      let t = (n - previous.n) / (next.n - previous.n);
      t = next.curve === "linear" ? t : next.curve === "snap" ? snap(t) : smooth(t);
      return blend(previous.pose, next.pose, t);
    }
  }
  return points.at(-1)!.pose;
};
const quaternion = ([xd, yd, zd]: V3) => {
  const x = xd * Math.PI / 360;
  const y = yd * Math.PI / 360;
  const z = zd * Math.PI / 360;
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y);
  const cz = Math.cos(z), sz = Math.sin(z);
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };
};

// R6 Motor-space locomotion: fore/aft separation lives primarily on Z.
// X is used only to preserve the silhouette around the mirrored hip bases.
const runCycle: Point[] = [
  { n: 0, pose: P({
    Torso: [-0.015, -0.30, -0.24], "Right Arm": [-0.42, 0.04, -0.08], "Left Arm": [-0.46, 0.28, -0.48],
    "Right Leg": [0.50, -0.05, 0.40], "Left Leg": [0.22, -0.05, -0.38],
  }, {
    Torso: [22, -18, -2], Head: [-7, 16, 1], "Right Arm": [-38, -30, -9], "Left Arm": [-48, -128, 14],
    "Right Leg": [1, 52, 18], "Left Leg": [2, 61, 21],
  }) },
  { n: 0.125, curve: "smooth", pose: P({
    Torso: [-0.008, -0.25, -0.27], "Right Arm": [-0.28, 0.02, -0.17], "Left Arm": [-0.12, 0.13, -0.39],
    "Right Leg": [0.30, 0.01, 0.12], "Left Leg": [-0.42, 0.01, 0.18],
  }, {
    Torso: [20, -9, -1], Head: [-6, 8, 0], "Right Arm": [-28, 2, -7], "Left Arm": [-32, -82, 13],
    "Right Leg": [-1, 18, 5], "Left Leg": [0, 30, 5],
  }) },
  { n: 0.25, curve: "snap", pose: P({
    Torso: [0, -0.22, -0.22], "Right Arm": [0.12, 0.01, -0.30], "Left Arm": [0.18, 0.03, -0.25],
    "Right Leg": [0.13, 0.01, -0.08], "Left Leg": [-0.82, -0.01, 0.58],
  }, {
    Torso: [19, 0, 0], Head: [-5, 0, 0], "Right Arm": [-22, 38, -7], "Left Arm": [-20, -55, 15],
    "Right Leg": [-2, -5, -2], "Left Leg": [0, 20, 1],
  }) },
  { n: 0.375, curve: "smooth", pose: P({
    Torso: [0.008, -0.25, -0.20], "Right Arm": [0.48, 0.05, -0.43], "Left Arm": [0.35, -0.03, -0.12],
    "Right Leg": [-0.16, 0, -0.30], "Left Leg": [-0.66, -0.12, 0.50],
  }, {
    Torso: [20, 10, 1], Head: [-6, -9, 0], "Right Arm": [-34, 94, -10], "Left Arm": [-24, 12, 10],
    "Right Leg": [1, -42, -15], "Left Leg": [-1, -40, -14],
  }) },
  { n: 0.5, curve: "snap", pose: P({
    Torso: [0.015, -0.30, -0.24], "Right Arm": [0.64, 0.18, -0.45], "Left Arm": [0.45, -0.05, -0.07],
    "Right Leg": [-0.22, -0.05, -0.38], "Left Leg": [-0.50, -0.05, 0.40],
  }, {
    Torso: [22, 18, 2], Head: [-7, -16, -1], "Right Arm": [-48, 128, -14], "Left Arm": [-38, 30, 9],
    "Right Leg": [2, -61, -21], "Left Leg": [1, -52, -18],
  }) },
  { n: 0.625, curve: "smooth", pose: P({
    Torso: [0.008, -0.25, -0.27], "Right Arm": [0.26, 0.10, -0.36], "Left Arm": [0.20, -0.02, -0.16],
    "Right Leg": [0.42, 0.01, 0.18], "Left Leg": [-0.30, 0.01, 0.12],
  }, {
    Torso: [20, 9, 1], Head: [-6, -8, 0], "Right Arm": [-32, 82, -13], "Left Arm": [-28, -2, 7],
    "Right Leg": [0, -30, -5], "Left Leg": [-1, -18, -5],
  }) },
  { n: 0.75, curve: "snap", pose: P({
    Torso: [0, -0.22, -0.22], "Right Arm": [-0.16, 0.03, -0.24], "Left Arm": [-0.12, 0.01, -0.29],
    "Right Leg": [0.82, -0.01, 0.58], "Left Leg": [-0.13, 0.01, -0.08],
  }, {
    Torso: [19, 0, 0], Head: [-5, 0, 0], "Right Arm": [-20, 55, -15], "Left Arm": [-22, -38, 7],
    "Right Leg": [0, -20, -1], "Left Leg": [-2, 5, 2],
  }) },
  { n: 0.875, curve: "smooth", pose: P({
    Torso: [-0.008, -0.25, -0.20], "Right Arm": [-0.36, -0.03, -0.11], "Left Arm": [-0.48, 0.05, -0.42],
    "Right Leg": [0.66, -0.12, 0.50], "Left Leg": [0.16, 0, -0.30],
  }, {
    Torso: [20, -10, -1], Head: [-6, 9, 0], "Right Arm": [-24, -12, -10], "Left Arm": [-34, -94, 10],
    "Right Leg": [-1, 40, 14], "Left Leg": [1, 42, 15],
  }) },
  { n: 1, curve: "snap", pose: P({
    Torso: [-0.015, -0.30, -0.24], "Right Arm": [-0.42, 0.04, -0.08], "Left Arm": [-0.46, 0.28, -0.48],
    "Right Leg": [0.50, -0.05, 0.40], "Left Leg": [0.22, -0.05, -0.38],
  }, {
    Torso: [22, -18, -2], Head: [-7, 16, 1], "Right Arm": [-38, -30, -9], "Left Arm": [-48, -128, 14],
    "Right Leg": [1, 52, 18], "Left Leg": [2, 61, 21],
  }) },
];

const neutral = P();
const motions: Motion[] = [
  {
    name: "MD_REFLEARN_R6_V2_01_PursuitRun", duration: 0.54, looped: true,
    intent: "A readable pursuit run with alternating fore-aft legs, airborne passing poses and strong opposite arm drive",
    tags: ["run", "pursuit", "locomotion"], points: runCycle,
    positionGain: { Torso: 0.92, "Right Arm": 0.68, "Left Arm": 0.68, "Right Leg": 0.76, "Left Leg": 0.76 },
    rotationGain: { Torso: 0.90, Head: 0.90, "Right Arm": 0.76, "Left Arm": 0.76, "Right Leg": 0.80, "Left Leg": 0.80 },
  },
  {
    name: "MD_REFLEARN_R6_V2_02_LowBurstDash", duration: 0.34, looped: false,
    intent: "A compact forward dash that loads one foot, projects the chest and leaves a clearly trailing leg",
    tags: ["dash", "forward"],
    positionGain: { Torso: 0.92, "Right Arm": 0.72, "Left Arm": 0.72, "Right Leg": 0.78, "Left Leg": 0.78 },
    rotationGain: { Torso: 0.92, Head: 0.90, "Right Arm": 0.78, "Left Arm": 0.78, "Right Leg": 0.82, "Left Leg": 0.82 },
    points: [
      { n: 0, pose: sample(runCycle, 0.75) },
      { n: 0.14, curve: "smooth", pose: P({
        Torso: [0, -0.20, -0.08], "Right Arm": [-0.10, 0.02, -0.10], "Left Arm": [0.12, 0.02, -0.12],
        "Right Leg": [0.26, 0, 0.20], "Left Leg": [-0.22, 0, -0.18],
      }, {
        Torso: [-6, -8, 1], Head: [4, 7, -1], "Right Arm": [-12, -18, -6], "Left Arm": [-10, 22, 6],
        "Right Leg": [0, 20, 7], "Left Leg": [0, 14, 5],
      }) },
      { n: 0.30, curve: "snap", pose: P({
        Torso: [0, -0.26, -0.28], "Right Arm": [0.12, 0.02, -0.40], "Left Arm": [0.42, -0.12, -0.26],
        "Right Leg": [0.72, 0.16, 0.62], "Left Leg": [-0.36, -0.02, -0.42],
      }, {
        Torso: [29, 22, 3], Head: [-15, -18, 3], "Right Arm": [-42, 104, -16], "Left Arm": [-38, 20, 13],
        "Right Leg": [5, -42, -16], "Left Leg": [3, -36, -13],
      }) },
      { n: 0.58, curve: "linear", pose: P({
        Torso: [0, -0.28, -0.34], "Right Arm": [0.15, 0.02, -0.48], "Left Arm": [0.50, -0.16, -0.30],
        "Right Leg": [0.84, 0.22, 0.72], "Left Leg": [-0.44, -0.04, -0.54],
      }, {
        Torso: [32, 26, 4], Head: [-18, -22, 4], "Right Arm": [-48, 126, -19], "Left Arm": [-44, 26, 16],
        "Right Leg": [7, -52, -19], "Left Leg": [4, -46, -16],
      }) },
      { n: 0.82, curve: "smooth", pose: P({
        Torso: [0, -0.20, -0.22], "Right Arm": [0.06, 0.01, -0.28], "Left Arm": [0.28, -0.07, -0.18],
        "Right Leg": [0.58, 0.10, 0.46], "Left Leg": [-0.30, -0.02, -0.30],
      }, {
        Torso: [24, 15, 2], Head: [-12, -12, 2], "Right Arm": [-34, 78, -11], "Left Arm": [-30, 12, 10],
        "Right Leg": [4, -32, -12], "Left Leg": [2, -28, -10],
      }) },
      { n: 1, curve: "smooth", pose: sample(runCycle, 0.1) },
    ],
  },
  {
    name: "MD_REFLEARN_R6_V2_03_ImpactLanding", duration: 0.66, looped: false,
    intent: "A two-foot impact landing with rapid root compression, bracing arms and an uneven human recovery",
    tags: ["landing", "parkour"],
    positionGain: { Torso: 0.86, "Right Arm": 0.70, "Left Arm": 0.70, "Right Leg": 0.72, "Left Leg": 0.72 },
    rotationGain: { Torso: 0.90, Head: 0.88, "Right Arm": 0.78, "Left Arm": 0.78, "Right Leg": 0.82, "Left Leg": 0.82 },
    points: [
      { n: 0, pose: P({
        Torso: [0, 0.12, -0.02], "Right Arm": [-0.10, 0.08, -0.14], "Left Arm": [0.12, 0.06, -0.12],
        "Right Leg": [0.18, 0.02, 0.16], "Left Leg": [-0.20, 0.02, 0.12],
      }, {
        Torso: [-5, 0, 0], Head: [-7, 0, 0], "Right Arm": [-25, -28, -18], "Left Arm": [-22, 25, 17],
        "Right Leg": [-5, 8, 3], "Left Leg": [-4, -8, -3],
      }) },
      { n: 0.16, curve: "snap", pose: P({
        Torso: [0, -0.92, -0.22], "Right Arm": [0.26, -0.04, -0.42], "Left Arm": [-0.24, -0.02, -0.38],
        "Right Leg": [0.68, -0.05, 1.02], "Left Leg": [-0.62, -0.02, 0.92],
      }, {
        Torso: [23, 0, 0], Head: [18, 0, 0], "Right Arm": [-48, 46, 38], "Left Arm": [-42, -42, -36],
        "Right Leg": [-6, -7, -9], "Left Leg": [1, -32, 9],
      }) },
      { n: 0.34, curve: "smooth", pose: P({
        Torso: [-0.02, -1.12, -0.36], "Right Arm": [0.34, -0.10, -0.46], "Left Arm": [-0.30, -0.07, -0.43],
        "Right Leg": [0.76, -0.08, 1.18], "Left Leg": [-0.70, -0.04, 1.08],
      }, {
        Torso: [38, -3, 1], Head: [29, 3, -1], "Right Arm": [-54, 58, 46], "Left Arm": [-48, -52, -43],
        "Right Leg": [-8, -4, -11], "Left Leg": [1, -38, 11],
      }) },
      { n: 0.52, curve: "linear", pose: P({
        Torso: [0.03, -0.86, -0.30], "Right Arm": [0.25, -0.04, -0.37], "Left Arm": [-0.22, -0.03, -0.35],
        "Right Leg": [0.66, -0.05, 1.02], "Left Leg": [-0.61, -0.02, 0.96],
      }, {
        Torso: [31, 4, -2], Head: [20, -4, 2], "Right Arm": [-46, 44, 38], "Left Arm": [-43, -40, -36],
        "Right Leg": [-7, -8, -9], "Left Leg": [0, -31, 9],
      }) },
      { n: 0.76, curve: "smooth", pose: P({
        Torso: [0, -0.38, -0.15], "Right Arm": [0.10, 0.01, -0.20], "Left Arm": [-0.08, 0.01, -0.18],
        "Right Leg": [0.42, -0.02, 0.58], "Left Leg": [-0.40, -0.01, 0.54],
      }, {
        Torso: [18, 2, -1], Head: [8, -2, 1], "Right Arm": [-28, 22, 20], "Left Arm": [-26, -20, -19],
        "Right Leg": [-4, -8, -5], "Left Leg": [0, -18, 5],
      }) },
      { n: 1, curve: "smooth", pose: P({
        Torso: [0, -0.12, -0.04], "Right Leg": [0.12, 0, 0.14], "Left Leg": [-0.12, 0, 0.12],
      }, { Torso: [7, 0, 0], Head: [-2, 0, 0], "Right Arm": [-8, 4, 4], "Left Arm": [-7, -4, -4] }) },
    ],
  },
  {
    name: "MD_REFLEARN_R6_V2_04_SideWallStride", duration: 0.62, looped: true,
    intent: "A lateral wall stride with a stable wall-facing lean, alternating feet and one protective leading arm",
    tags: ["wallrun", "parkour"],
    positionGain: { Torso: 0.90, "Right Arm": 0.74, "Left Arm": 0.74, "Right Leg": 0.76, "Left Leg": 0.76 },
    rotationGain: { Torso: 0.92, Head: 0.90, "Right Arm": 0.82, "Left Arm": 0.82, "Right Leg": 0.82, "Left Leg": 0.82 },
    points: [
      { n: 0, pose: P({
        Torso: [-0.10, 0.10, -0.02], "Right Arm": [0.14, 0.62, -0.02], "Left Arm": [-0.42, 0.18, 0.58],
        "Right Leg": [0.68, -0.10, 0.16], "Left Leg": [-0.08, -0.08, -0.04],
      }, {
        Torso: [27, 2, 36], Head: [-12, 8, -22], "Right Arm": [-58, 118, -105], "Left Arm": [46, -126, -38],
        "Right Leg": [34, 48, -8], "Left Leg": [18, 42, -14],
      }) },
      { n: 0.25, curve: "snap", pose: P({
        Torso: [-0.02, 0.16, -0.02], "Right Arm": [0.16, 0.68, -0.08], "Left Arm": [0.10, 0.28, 0.10],
        "Right Leg": [0.08, -0.26, 0.24], "Left Leg": [-1.02, -0.30, 0.72],
      }, {
        Torso: [31, -2, 39], Head: [-12, 9, -23], "Right Arm": [-61, 108, -102], "Left Arm": [49, -54, 54],
        "Right Leg": [24, 8, -36], "Left Leg": [20, 34, -30],
      }) },
      { n: 0.5, curve: "smooth", pose: P({
        Torso: [-0.12, 0.13, -0.01], "Right Arm": [0.18, 0.70, -0.12], "Left Arm": [0.02, 0.68, -0.20],
        "Right Leg": [-0.72, -0.14, 0.10], "Left Leg": [-0.68, -0.18, 0.64],
      }, {
        Torso: [30, 3, 42], Head: [-12, 10, -24], "Right Arm": [-63, 112, -106], "Left Arm": [-36, -24, 116],
        "Right Leg": [-14, -22, -48], "Left Leg": [-28, -48, -18],
      }) },
      { n: 0.75, curve: "snap", pose: P({
        Torso: [-0.02, 0.17, -0.02], "Right Arm": [0.15, 0.69, -0.07], "Left Arm": [-0.50, 0.46, 0.24],
        "Right Leg": [0.18, 0.02, 0.62], "Left Leg": [-0.70, 0.18, 0.20],
      }, {
        Torso: [28, 0, 38], Head: [-12, 9, -22], "Right Arm": [-62, 114, -104], "Left Arm": [18, -34, 84],
        "Right Leg": [10, -12, -24], "Left Leg": [11, 4, -3],
      }) },
      { n: 1, curve: "smooth", pose: P({
        Torso: [-0.10, 0.10, -0.02], "Right Arm": [0.14, 0.62, -0.02], "Left Arm": [-0.42, 0.18, 0.58],
        "Right Leg": [0.68, -0.10, 0.16], "Left Leg": [-0.08, -0.08, -0.04],
      }, {
        Torso: [27, 2, 36], Head: [-12, 8, -22], "Right Arm": [-58, 118, -105], "Left Arm": [46, -126, -38],
        "Right Leg": [34, 48, -8], "Left Leg": [18, 42, -14],
      }) },
    ],
  },
  {
    name: "MD_REFLEARN_R6_V2_05_ShoulderRoll", duration: 0.56, looped: false,
    intent: "A diagonal shoulder roll with continuous root rotation, compact limbs and a planted asymmetric exit",
    tags: ["roll", "parkour"],
    positionGain: { Torso: 0.92, "Right Arm": 0.78, "Left Arm": 0.78, "Right Leg": 0.80, "Left Leg": 0.80 },
    rotationGain: { Torso: 1, Head: 0.90, "Right Arm": 0.86, "Left Arm": 0.86, "Right Leg": 0.86, "Left Leg": 0.86 },
    points: [
      { n: 0, pose: P({
        Torso: [0, -0.10, -0.02], "Right Arm": [0.20, 0, -0.05], "Left Arm": [-0.24, 0, -0.06],
        "Right Leg": [0.16, 0, 0.10], "Left Leg": [-0.18, 0, -0.08],
      }, { Torso: [20, -8, -10], Head: [-4, 7, 5], "Right Arm": [0, 96, -8], "Left Arm": [0, -112, 11] }) },
      { n: 0.18, curve: "snap", pose: P({
        Torso: [-0.10, -0.58, -0.25], "Right Arm": [0.78, 0, 0.34], "Left Arm": [-0.70, 0, 0.30],
        "Right Leg": [0.48, 0, 0.38], "Left Leg": [-0.52, 0, 0.40],
      }, { Torso: [82, -16, -24], Head: [8, 12, 8], "Right Arm": [0, 148, -16], "Left Arm": [0, -152, 19],
        "Right Leg": [0, -24, -9], "Left Leg": [0, 20, 8] }) },
      { n: 0.38, curve: "smooth", pose: P({
        Torso: [-0.20, -1.18, -0.38], "Right Arm": [0.36, 0, -0.46], "Left Arm": [-0.32, 0, -0.48],
        "Right Leg": [0.74, 0, 0.58], "Left Leg": [-0.72, 0, 0.60],
      }, { Torso: [166, -22, -30], Head: [30, 16, 10], "Right Arm": [0, 112, -20], "Left Arm": [0, -118, 22],
        "Right Leg": [0, -46, -13], "Left Leg": [0, 40, 12] }) },
      { n: 0.60, curve: "linear", pose: P({
        Torso: [-0.23, -1.62, -0.30], "Right Arm": [0.24, 0, -0.42], "Left Arm": [-0.22, 0, -0.44],
        "Right Leg": [0.66, 0, 0.52], "Left Leg": [-0.64, 0, 0.54],
      }, { Torso: [252, -19, -27], Head: [46, 14, 9], "Right Arm": [0, 72, -15], "Left Arm": [0, -78, 17],
        "Right Leg": [0, -34, -10], "Left Leg": [0, 30, 9] }) },
      { n: 0.80, curve: "snap", pose: P({
        Torso: [-0.10, -0.72, -0.12], "Right Arm": [0.14, 0, -0.22], "Left Arm": [-0.12, 0, -0.24],
        "Right Leg": [0.44, 0, 0.34], "Left Leg": [-0.40, 0, 0.32],
      }, { Torso: [326, -8, -12], Head: [20, 6, 4], "Right Arm": [0, 32, -8], "Left Arm": [0, -36, 9],
        "Right Leg": [0, -20, -6], "Left Leg": [0, 17, 5] }) },
      { n: 1, curve: "smooth", pose: P({
        Torso: [-0.01, -0.25, -0.27], "Right Arm": [-0.28, 0.02, -0.17], "Left Arm": [-0.12, 0.13, -0.39],
        "Right Leg": [0.30, 0.01, 0.12], "Left Leg": [-0.42, 0.01, 0.18],
      }, {
        Torso: [380, -9, -1], Head: [-6, 8, 0], "Right Arm": [-28, 2, -7], "Left Arm": [-32, -82, 13],
        "Right Leg": [-1, 18, 5], "Left Leg": [0, 30, 5],
      }) },
    ],
  },
  {
    name: "MD_REFLEARN_R6_V2_06_LedgeTopout", duration: 1.38, looped: false,
    intent: "An asymmetric ledge top-out with separate hand loading, hip shift, one-leg shelf and a controlled standing exit",
    tags: ["ledge", "climb", "parkour"],
    positionGain: { Torso: 0.92, "Right Arm": 0.86, "Left Arm": 0.86, "Right Leg": 0.80, "Left Leg": 0.80 },
    rotationGain: { Torso: 0.94, Head: 0.90, "Right Arm": 0.96, "Left Arm": 0.96, "Right Leg": 0.84, "Left Leg": 0.84 },
    points: [
      { n: 0, pose: P({
        Torso: [0, 0.02, 0], "Right Arm": [-0.02, -0.02, 0.68], "Left Arm": [0.02, -0.06, 0.60],
      }, { Torso: [0, 0, -2], Head: [-12, 0, -2], "Right Arm": [2, 174, -7], "Left Arm": [-2, -168, 6] }) },
      { n: 0.16, curve: "snap", pose: P({
        Torso: [-0.05, -0.06, 0], "Right Arm": [-0.30, -0.04, 0.30], "Left Arm": [0.42, -0.08, 0.16],
        "Right Leg": [0.10, 0.10, 0.06], "Left Leg": [-0.06, 0, 0],
      }, { Torso: [2, -4, -8], Head: [-8, 3, -3], "Right Arm": [1, 148, -6], "Left Arm": [-2, -138, 4],
        "Right Leg": [-4, 3, -5], "Left Leg": [-3, -1, 2] }) },
      { n: 0.34, curve: "smooth", pose: P({
        Torso: [-0.10, 0.10, -0.03], "Right Arm": [-0.48, -0.06, -0.08], "Left Arm": [0.60, -0.12, -0.22],
        "Right Leg": [0.20, -0.06, 0.14], "Left Leg": [-0.32, -0.10, 0.18],
      }, { Torso: [-4, -8, -17], Head: [18, 9, -5], "Right Arm": [-2, 116, -4], "Left Arm": [4, -98, -10],
        "Right Leg": [-16, -4, 5], "Left Leg": [-30, 3, 8] }) },
      { n: 0.52, curve: "snap", pose: P({
        Torso: [-0.04, 0.34, -0.10], "Right Arm": [-0.25, -0.04, -0.18], "Left Arm": [0.40, -0.10, -0.30],
        "Right Leg": [0.34, -0.14, 0.30], "Left Leg": [-0.54, -0.16, 0.36],
      }, { Torso: [-11, -10, -23], Head: [27, 13, -7], "Right Arm": [-3, 72, -2], "Left Arm": [5, -62, -14],
        "Right Leg": [-28, -5, 9], "Left Leg": [-44, 4, 13] }) },
      { n: 0.70, curve: "smooth", pose: P({
        Torso: [0.04, 0.56, -0.14], "Right Arm": [-0.10, -0.02, -0.10], "Left Arm": [0.18, -0.05, -0.16],
        "Right Leg": [0.54, -0.18, 0.52], "Left Leg": [-0.38, -0.10, 0.28],
      }, { Torso: [17, 6, -13], Head: [12, -5, 4], "Right Arm": [-8, 36, -4], "Left Arm": [-4, -28, -8],
        "Right Leg": [-40, -8, 14], "Left Leg": [-26, 6, 8] }) },
      { n: 0.84, curve: "snap", pose: P({
        Torso: [0.03, 0.30, -0.10], "Right Arm": [-0.04, 0, -0.06], "Left Arm": [0.07, 0, -0.07],
        "Right Leg": [0.40, -0.08, 0.34], "Left Leg": [-0.28, -0.06, 0.22],
      }, { Torso: [21, 3, -6], Head: [6, -2, 2], "Right Arm": [-11, 18, -3], "Left Arm": [-8, -14, -4],
        "Right Leg": [-27, -5, 8], "Left Leg": [-18, 4, 6] }) },
      { n: 1, curve: "smooth", pose: neutral },
    ],
  },
];

function draftFor(motion: Motion): AnimationDraft {
  const fps = 60;
  const frames = Math.max(16, Math.round(motion.duration * fps));
  const phaseOffsets: Record<Joint, number> = {
    Torso: 0, Head: -0.006, "Right Arm": -0.010, "Left Arm": 0.009, "Right Leg": -0.004, "Left Leg": 0.006,
  };
  return animationDraftSchema.parse({
    name: motion.name,
    rigId: "selection:1",
    duration: motion.duration,
    framesPerSecond: fps,
    looped: motion.looped,
    priority: motion.looped ? "movement" : "action3",
    beats: motion.looped ? [
      { id: "phase_a", label: "First support", startTime: 0, endTime: motion.duration / 2, intention: motion.intent, energy: 0.82, leadingBodyPart: "Torso" },
      { id: "phase_b", label: "Opposite support", startTime: motion.duration / 2, endTime: motion.duration, intention: "Resolve the opposing support and close the loop", energy: 0.82, leadingBodyPart: "Torso" },
    ] : [
      { id: "prepare", label: "Preparation", startTime: 0, endTime: motion.duration * 0.18, intention: "Establish support and direction", energy: 0.50, leadingBodyPart: "Torso" },
      { id: "action", label: "Primary action", startTime: motion.duration * 0.18, endTime: motion.duration * 0.62, intention: motion.intent, energy: 0.95, leadingBodyPart: "Torso" },
      { id: "resolve", label: "Consequence", startTime: motion.duration * 0.62, endTime: motion.duration, intention: "Resolve weight and silhouette on staggered frames", energy: 0.48, leadingBodyPart: "Torso" },
    ],
    contacts: [],
    tracks: joints.map((joint) => ({
      joint,
      space: "motor",
      keys: Array.from({ length: frames + 1 }, (_, index) => {
        const n = index / frames;
        const shifted = motion.looped
          ? ((n + phaseOffsets[joint]) % 1 + 1) % 1
          : clamp(n + phaseOffsets[joint]);
        const current = sample(motion.points, shifted);
        const positionGain = motion.positionGain?.[joint] ?? 1;
        const rotationGain = motion.rotationGain?.[joint] ?? 1;
        return {
          time: Number((n * motion.duration).toFixed(6)),
          transform: {
            position: {
              x: current.p[joint][0] * positionGain,
              y: current.p[joint][1] * positionGain,
              z: current.p[joint][2] * positionGain,
            },
            rotation: quaternion(current.r[joint].map((value) => value * rotationGain) as V3),
          },
          easing: { style: "linear", direction: "in" },
          weight: 1,
        };
      }),
    })),
    metadata: {
      intent: motion.intent,
      rigType: "R6",
      style: [
        "r6", "original", "reference-informed-v2", "reference-informed-translation",
        "dense-sampled", "pose-phase-authored", "amplitude-calibrated",
        "human-review-required", ...motion.tags,
      ],
      version: 1,
    },
  });
}

const drafts = motions.map(draftFor);
process.stdout.write(`V2_ORIGINALS ${drafts.length}\nAPPROVED 0\n${drafts.map((draft) => draft.name).join("\n")}\n`);
const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
const client = new Client({ name: "motion-director-reference-informed-r6-v2", version: "0.2.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/src/index.js"],
  cwd: process.cwd(),
  env,
  stderr: "pipe",
});
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function resultText(result: unknown): string {
  const content = result && typeof result === "object" && "content" in result
    ? (result as { content?: unknown }).content
    : undefined;
  if (!Array.isArray(content)) return "";
  const block = content.find((item) =>
    item && typeof item === "object" && "type" in item && item.type === "text" &&
    "text" in item && typeof item.text === "string"
  ) as { text?: string } | undefined;
  return block?.text ?? "";
}

try {
  await client.connect(transport);
  let connected = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await client.callTool({ name: "studio_status", arguments: {} });
    if ((JSON.parse(resultText(status)) as { connected: boolean }).connected) {
      connected = true;
      break;
    }
    await sleep(500);
  }
  if (!connected) throw new Error("Studio did not connect to Motion Director.");
  for (const draft of drafts) {
    const validation = await client.callTool({ name: "validate_animation_draft", arguments: { draft } });
    if (validation.isError) throw new Error(`${draft.name}: ${resultText(validation)}`);
    const staged = await client.callTool({
      name: "stage_animation_draft",
      arguments: { transactionName: `Reference-informed V2 - ${draft.name}`, draft },
    });
    if (staged.isError) throw new Error(`${draft.name}: ${resultText(staged)}`);
    const transactionId = (JSON.parse(resultText(staged)) as { transactionId: string }).transactionId;
    const committed = await client.callTool({
      name: "commit_animation_draft",
      arguments: { transactionId, destinationName: draft.name },
    });
    if (committed.isError) throw new Error(`${draft.name}: ${resultText(committed)}`);
    process.stdout.write(`COMMITTED ${draft.name}\n`);
  }
  const attached = await client.callTool({
    name: "attach_committed_animations_to_selected_rig_animsaves",
    arguments: { namePrefix: "MD_REFLEARN_R6_V2_" },
  });
  if (attached.isError) throw new Error(resultText(attached));
  process.stdout.write(`ATTACHED\n${resultText(attached)}\n`);
} finally {
  await client.close();
}
