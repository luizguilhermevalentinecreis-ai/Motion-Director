import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { animationDraftSchema, type AnimationDraft } from "../src/domain.js";

type Rotation = [number, number, number];
type Position = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type Pose = { positions: Record<Joint, Position>; rotations: Record<Joint, Rotation> };
type Point = { n: number; pose: Pose; curve?: "smooth" | "snap" | "linear" };
type Original = {
  name: string;
  duration: number;
  looped: boolean;
  intent: string;
  tags: string[];
  points?: Point[];
  procedural?: (n: number) => Pose;
};

const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const zeroPositions: Record<Joint, Position> = {
  Torso: [0, 0, 0], Head: [0, 0, 0],
  "Right Arm": [0, 0, 0], "Left Arm": [0, 0, 0],
  "Right Leg": [0, 0, 0], "Left Leg": [0, 0, 0],
};
const zeroRotations: Record<Joint, Rotation> = {
  Torso: [0, 0, 0], Head: [0, 0, 0],
  "Right Arm": [0, 0, 0], "Left Arm": [0, 0, 0],
  "Right Leg": [0, 0, 0], "Left Leg": [0, 0, 0],
};
function pose(
  positions: Partial<Record<Joint, Position>>,
  rotations: Partial<Record<Joint, Rotation>>,
): Pose {
  return { positions: { ...zeroPositions, ...positions }, rotations: { ...zeroRotations, ...rotations } };
}
function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
function mix(a: number, b: number, t: number): number { return a + (b - a) * t; }
function smooth(t: number): number { const x = clamp(t); return x * x * (3 - 2 * x); }
function snap(t: number): number { return 1 - Math.pow(1 - clamp(t), 3.6); }
function interpolate(a: Pose, b: Pose, t: number): Pose {
  const positions = {} as Record<Joint, Position>;
  const rotations = {} as Record<Joint, Rotation>;
  for (const joint of joints) {
    positions[joint] = [
      mix(a.positions[joint][0], b.positions[joint][0], t),
      mix(a.positions[joint][1], b.positions[joint][1], t),
      mix(a.positions[joint][2], b.positions[joint][2], t),
    ];
    rotations[joint] = [
      mix(a.rotations[joint][0], b.rotations[joint][0], t),
      mix(a.rotations[joint][1], b.rotations[joint][1], t),
      mix(a.rotations[joint][2], b.rotations[joint][2], t),
    ];
  }
  return { positions, rotations };
}
function at(points: Point[], n: number): Pose {
  if (n <= points[0]!.n) return points[0]!.pose;
  for (let index = 1; index < points.length; index += 1) {
    const next = points[index]!;
    if (n <= next.n) {
      const previous = points[index - 1]!;
      let t = (n - previous.n) / (next.n - previous.n);
      t = next.curve === "linear" ? t : next.curve === "snap" ? snap(t) : smooth(t);
      return interpolate(previous.pose, next.pose, t);
    }
  }
  return points.at(-1)!.pose;
}
function quaternion([xd, yd, zd]: Rotation) {
  const x = xd * Math.PI / 360, y = yd * Math.PI / 360, z = zd * Math.PI / 360;
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y);
  const cz = Math.cos(z), sz = Math.sin(z);
  return { x: sx * cy * cz - cx * sy * sz, y: cx * sy * cz + sx * cy * sz, z: cx * cy * sz - sx * sy * cz, w: cx * cy * cz + sx * sy * sz };
}
function run(n: number): Pose {
  const phase = n * Math.PI * 2;
  const wave = Math.sin(phase);
  const double = 0.5 - 0.5 * Math.cos(phase * 2);
  const right = wave;
  const left = -wave;
  return pose({
    Torso: [0.012 * Math.sin(phase + 0.3), -0.17 + 0.055 * double, -0.055],
    Head: [0, 0, 0],
    "Right Arm": [0.22 * right, 0.01 * double, -0.13 - 0.07 * Math.abs(right)],
    "Left Arm": [0.22 * left, 0.012 * double, -0.13 - 0.07 * Math.abs(left)],
    "Right Leg": [0.58 * right, -0.025 * double, 0.2 + 0.22 * Math.max(0, right)],
    "Left Leg": [0.58 * left, -0.025 * double, 0.2 + 0.22 * Math.max(0, left)],
  }, {
    Torso: [8 + 1.8 * Math.cos(phase * 2), 4 * wave, 1.8 * wave],
    Head: [-2.5, -2.5 * wave, -0.8 * wave],
    "Right Arm": [-7 - 9 * right, 34 * right, -4 * right],
    "Left Arm": [-7 - 9 * left, 34 * left, -4 * left],
    "Right Leg": [-4 + 7 * right, -22 * right, -2 * right],
    "Left Leg": [-4 + 7 * left, -22 * left, -2 * left],
  });
}

const neutral = pose({}, {});
const originals: Original[] = [
  {
    name: "MD_REFLEARN_R6_01_MomentumRun",
    duration: 0.58, looped: true,
    intent: "Original obstacle-focused run using translated R6 stride shapes, stable head and asymmetric frame overlap learned from the reference library",
    tags: ["run", "reference-study", "loop"],
    procedural: run,
  },
  {
    name: "MD_REFLEARN_R6_02_CompressedBurstStep",
    duration: 0.36, looped: false,
    intent: "Original short forward burst with an early energy peak, translated reach and a longer controlled consequence",
    tags: ["dash", "forward", "reference-study"],
    points: [
      { n: 0, pose: neutral },
      { n: 0.12, curve: "smooth", pose: pose({
        Torso: [0, -0.08, 0.04], "Right Arm": [0.08, 0.03, -0.04], "Left Arm": [-0.08, 0.03, -0.04],
        "Right Leg": [0.08, 0.02, 0.04], "Left Leg": [-0.08, 0.02, 0.04],
      }, {
        Torso: [-8, -7, 2], Head: [5, 5, -1], "Right Arm": [16, -20, -8], "Left Arm": [12, 16, 7],
        "Right Leg": [-12, 7, 3], "Left Leg": [18, -5, -2],
      }) },
      { n: 0.28, curve: "snap", pose: pose({
        Torso: [0, -0.2, -0.14], "Right Arm": [0.12, 0.02, -0.34], "Left Arm": [0.38, -0.25, -0.18],
        "Right Leg": [0.5, 0.22, 0.48], "Left Leg": [-0.16, 0.04, -0.1],
      }, {
        Torso: [34, 36, 4], Head: [-18, -25, 5], "Right Arm": [-38, 88, -10], "Left Arm": [-31, 18, 12],
        "Right Leg": [12, -22, -16], "Left Leg": [-8, 15, 4],
      }) },
      { n: 0.5, curve: "linear", pose: pose({
        Torso: [0, -0.22, -0.2], "Right Arm": [0.14, 0.02, -0.42], "Left Arm": [0.48, -0.34, -0.22],
        "Right Leg": [0.62, 0.28, 0.55], "Left Leg": [-0.18, 0.06, -0.12],
      }, {
        Torso: [39, 48, 5], Head: [-24, -36, 8], "Right Arm": [-48, 116, -18], "Left Arm": [-45, 26, 17],
        "Right Leg": [15, -30, -19], "Left Leg": [-11, 24, 3],
      }) },
      { n: 0.74, curve: "smooth", pose: pose({
        Torso: [0, -0.15, -0.1], "Right Arm": [0.08, 0.01, -0.26], "Left Arm": [0.25, -0.18, -0.14],
        "Right Leg": [0.36, 0.14, 0.34], "Left Leg": [-0.1, 0.03, -0.06],
      }, {
        Torso: [24, 28, 2], Head: [-14, -20, 4], "Right Arm": [-31, 72, -8], "Left Arm": [-28, 14, 10],
        "Right Leg": [8, -18, -10], "Left Leg": [-7, 14, 2],
      }) },
      { n: 1, curve: "smooth", pose: run(0.1) },
    ],
  },
  {
    name: "MD_REFLEARN_R6_03_PrecisionDropRecovery",
    duration: 0.72, looped: false,
    intent: "Original forefoot-style landing with staggered positional compression, quiet head translation and a two-stage recovery",
    tags: ["landing", "parkour", "reference-study"],
    points: [
      { n: 0, pose: pose({
        Torso: [0, 0.15, 0], "Right Arm": [0.16, 0.06, -0.12], "Left Arm": [-0.14, 0.05, -0.1],
        "Right Leg": [0.22, 0.02, 0.12], "Left Leg": [-0.18, 0.02, 0.1],
      }, {
        Torso: [-5, 0, 0], Head: [-8, 0, 0], "Right Arm": [24, -18, -22], "Left Arm": [20, 16, 20],
        "Right Leg": [12, -5, 4], "Left Leg": [9, 5, -4],
      }) },
      { n: 0.2, curve: "snap", pose: pose({
        Torso: [0, -0.08, 0.04], "Right Arm": [0.24, 0.04, -0.18], "Left Arm": [-0.22, 0.05, -0.16],
        "Right Leg": [0.4, -0.04, 0.32], "Left Leg": [-0.4, -0.03, 0.3],
      }, {
        Torso: [18, 0, 0], Head: [4, 0, 0], "Right Arm": [-34, -20, -24], "Left Arm": [-30, 18, 22],
        "Right Leg": [24, -9, 7], "Left Leg": [22, 9, -7],
      }) },
      { n: 0.4, curve: "smooth", pose: pose({
        Torso: [0.03, -0.52, 0.16], "Right Arm": [0.36, -0.08, -0.28], "Left Arm": [-0.3, -0.04, -0.22],
        "Right Leg": [0.68, -0.18, 0.52], "Left Leg": [-0.62, -0.15, 0.48],
      }, {
        Torso: [42, -4, 3], Head: [14, 3, -2], "Right Arm": [-58, -28, -32], "Left Arm": [-49, 24, 28],
        "Right Leg": [38, -16, 12], "Left Leg": [34, 14, -11],
      }) },
      { n: 0.58, curve: "linear", pose: pose({
        Torso: [-0.02, -0.42, 0.12], "Right Arm": [0.28, -0.04, -0.22], "Left Arm": [-0.25, -0.02, -0.19],
        "Right Leg": [0.58, -0.12, 0.43], "Left Leg": [-0.54, -0.1, 0.4],
      }, {
        Torso: [34, 5, -3], Head: [10, -4, 2], "Right Arm": [-45, -20, -25], "Left Arm": [-42, 18, 23],
        "Right Leg": [31, -12, 9], "Left Leg": [29, 11, -9],
      }) },
      { n: 0.78, curve: "smooth", pose: pose({
        Torso: [0, -0.18, 0.04], "Right Arm": [0.12, 0, -0.1], "Left Arm": [-0.1, 0, -0.09],
        "Right Leg": [0.28, -0.04, 0.18], "Left Leg": [-0.27, -0.03, 0.17],
      }, {
        Torso: [16, 2, -1], Head: [3, -2, 1], "Right Arm": [-20, -8, -11], "Left Arm": [-18, 7, 10],
        "Right Leg": [16, -5, 4], "Left Leg": [15, 5, -4],
      }) },
      { n: 1, curve: "smooth", pose: neutral },
    ],
  },
  {
    name: "MD_REFLEARN_R6_04_WallStepReach",
    duration: 0.86, looped: false,
    intent: "Original vertical wall step converting forward speed into height with inside-foot pressure and delayed two-hand reach",
    tags: ["wall-run", "vertical", "parkour", "reference-study"],
    points: [
      { n: 0, pose: run(0.05) },
      { n: 0.2, curve: "snap", pose: pose({
        Torso: [-0.03, -0.08, -0.08], "Right Arm": [0.18, 0.04, -0.2], "Left Arm": [-0.14, 0.03, -0.12],
        "Right Leg": [0.52, 0.18, 0.38], "Left Leg": [-0.2, 0.02, -0.08],
      }, {
        Torso: [18, -12, -14], Head: [-7, 12, 5], "Right Arm": [-38, 46, -28], "Left Arm": [-20, -18, 14],
        "Right Leg": [24, -36, -18], "Left Leg": [-14, 18, 7],
      }) },
      { n: 0.38, curve: "snap", pose: pose({
        Torso: [-0.1, 0.18, -0.16], "Right Arm": [0.35, 0.08, -0.28], "Left Arm": [-0.22, 0.05, -0.18],
        "Right Leg": [0.72, 0.32, 0.5], "Left Leg": [-0.36, 0.08, -0.16],
      }, {
        Torso: [12, -18, -20], Head: [-12, 18, 8], "Right Arm": [-58, 86, -38], "Left Arm": [-32, -26, 20],
        "Right Leg": [34, -52, -26], "Left Leg": [-22, 28, 12],
      }) },
      { n: 0.58, curve: "smooth", pose: pose({
        Torso: [-0.06, 0.46, -0.1], "Right Arm": [0.2, 0.14, 0.3], "Left Arm": [-0.18, 0.12, 0.22],
        "Right Leg": [0.4, 0.18, 0.2], "Left Leg": [-0.48, 0.2, 0.34],
      }, {
        Torso: [-4, -8, -10], Head: [-18, 8, 3], "Right Arm": [8, 142, -14], "Left Arm": [12, -125, 16],
        "Right Leg": [18, -24, -10], "Left Leg": [28, 38, 16],
      }) },
      { n: 0.76, curve: "snap", pose: pose({
        Torso: [0, 0.62, -0.05], "Right Arm": [0.04, 0.06, 0.58], "Left Arm": [-0.04, 0.06, 0.56],
        "Right Leg": [0.22, 0.08, 0.12], "Left Leg": [-0.28, 0.1, 0.18],
      }, {
        Torso: [-8, 0, -4], Head: [-14, 0, 0], "Right Arm": [2, 165, -8], "Left Arm": [2, -165, 8],
        "Right Leg": [10, -12, -5], "Left Leg": [18, 20, 8],
      }) },
      { n: 1, curve: "linear", pose: pose({
        Torso: [0, 0.5, -0.02], "Right Arm": [0.02, 0.02, 0.62], "Left Arm": [-0.02, 0.02, 0.62],
        "Right Leg": [0.16, 0.04, 0.1], "Left Leg": [-0.18, 0.04, 0.11],
      }, {
        Torso: [4, 0, 0], Head: [-8, 0, 0], "Right Arm": [0, 172, -5], "Left Arm": [0, -172, 5],
        "Right Leg": [7, -8, -3], "Left Leg": [8, 9, 3],
      }) },
    ],
  },
  {
    name: "MD_REFLEARN_R6_05_DiagonalMomentumRoll",
    duration: 0.62, looped: false,
    intent: "Original diagonal shoulder roll using large torso travel, limb clearance and continuous rotation rather than a torso-only flip",
    tags: ["forward-roll", "parkour", "reference-study"],
    points: [
      { n: 0, pose: pose({
        Torso: [0, -0.1, 0], "Right Arm": [0.18, 0.02, -0.08], "Left Arm": [-0.24, 0.02, -0.06],
        "Right Leg": [0.18, 0, 0.06], "Left Leg": [-0.2, 0, 0.08],
      }, {
        Torso: [24, -8, -12], Head: [-4, 7, 5], "Right Arm": [0, 92, -8], "Left Arm": [0, -118, 12],
        "Right Leg": [0, -14, -4], "Left Leg": [0, 10, 4],
      }) },
      { n: 0.22, curve: "snap", pose: pose({
        Torso: [-0.12, -0.58, -0.22], "Right Arm": [0.72, 0.04, 0.15], "Left Arm": [-0.7, -0.02, 0.2],
        "Right Leg": [0.48, 0.02, 0.32], "Left Leg": [-0.54, 0.01, 0.36],
      }, {
        Torso: [108, -18, -28], Head: [12, 14, 10], "Right Arm": [0, 145, -18], "Left Arm": [0, -156, 22],
        "Right Leg": [0, -28, -10], "Left Leg": [0, 20, 8],
      }) },
      { n: 0.46, curve: "smooth", pose: pose({
        Torso: [-0.22, -1.22, -0.32], "Right Arm": [0.34, 0.02, -0.42], "Left Arm": [-0.3, 0.02, -0.46],
        "Right Leg": [0.78, 0.02, 0.52], "Left Leg": [-0.76, 0.02, 0.55],
      }, {
        Torso: [192, -24, -34], Head: [38, 18, 12], "Right Arm": [0, 104, -20], "Left Arm": [0, -112, 24],
        "Right Leg": [0, -48, -14], "Left Leg": [0, 42, 12],
      }) },
      { n: 0.7, curve: "smooth", pose: pose({
        Torso: [-0.18, -1.55, -0.2], "Right Arm": [0.22, 0.02, -0.38], "Left Arm": [-0.2, 0.02, -0.4],
        "Right Leg": [0.64, 0.02, 0.46], "Left Leg": [-0.62, 0.02, 0.48],
      }, {
        Torso: [282, -16, -24], Head: [50, 12, 8], "Right Arm": [0, 62, -14], "Left Arm": [0, -68, 16],
        "Right Leg": [0, -34, -10], "Left Leg": [0, 30, 9],
      }) },
      { n: 0.86, curve: "snap", pose: pose({
        Torso: [-0.08, -0.66, -0.08], "Right Arm": [0.16, 0.02, -0.2], "Left Arm": [-0.14, 0.02, -0.22],
        "Right Leg": [0.42, 0.01, 0.3], "Left Leg": [-0.4, 0.01, 0.32],
      }, {
        Torso: [342, -6, -10], Head: [18, 5, 3], "Right Arm": [0, 30, -8], "Left Arm": [0, -34, 9],
        "Right Leg": [0, -20, -6], "Left Leg": [0, 18, 6],
      }) },
      { n: 1, curve: "smooth", pose: run(0.12) },
    ],
  },
  {
    name: "MD_REFLEARN_R6_06_AsymmetricLedgeTopout",
    duration: 1.32, looped: false,
    intent: "Original ledge top-out with independent hand loading, hip shift and sequential leg recovery instead of a symmetric upward slide",
    tags: ["ledge-climb", "parkour", "reference-study"],
    points: [
      { n: 0, pose: pose({
        Torso: [0.02, 0.02, 0], "Right Arm": [-0.02, -0.02, 0.58], "Left Arm": [0.02, -0.06, 0.5],
        "Right Leg": [0.04, 0.03, 0], "Left Leg": [-0.04, 0.02, 0],
      }, {
        Torso: [0, 0, -2], Head: [-12, 0, -2], "Right Arm": [2, 172, -8], "Left Arm": [-2, -164, 6],
        "Right Leg": [-2, 2, -1], "Left Leg": [-2, -2, 1],
      }) },
      { n: 0.18, curve: "snap", pose: pose({
        Torso: [-0.04, -0.04, 0], "Right Arm": [-0.34, -0.04, 0.18], "Left Arm": [0.46, -0.08, 0.05],
        "Right Leg": [0.12, 0.16, 0.08], "Left Leg": [-0.06, 0, 0.02],
      }, {
        Torso: [2, -3, -8], Head: [-9, 2, -3], "Right Arm": [1, 150, -7], "Left Arm": [-2, -138, 4],
        "Right Leg": [-5, 4, -7], "Left Leg": [-4, -1, 2],
      }) },
      { n: 0.4, curve: "smooth", pose: pose({
        Torso: [-0.1, 0.12, -0.04], "Right Arm": [-0.5, -0.06, -0.08], "Left Arm": [0.62, -0.12, -0.24],
        "Right Leg": [0.22, -0.08, 0.14], "Left Leg": [-0.36, -0.14, 0.18],
      }, {
        Torso: [-4, -8, -18], Head: [20, 10, -6], "Right Arm": [-2, 118, -4], "Left Arm": [4, -96, -12],
        "Right Leg": [-18, -4, 5], "Left Leg": [-34, 3, 8],
      }) },
      { n: 0.58, curve: "snap", pose: pose({
        Torso: [-0.04, 0.36, -0.12], "Right Arm": [-0.26, -0.04, -0.18], "Left Arm": [0.42, -0.1, -0.32],
        "Right Leg": [0.34, -0.16, 0.28], "Left Leg": [-0.56, -0.18, 0.32],
      }, {
        Torso: [-12, -10, -24], Head: [28, 14, -8], "Right Arm": [-3, 72, -2], "Left Arm": [5, -62, -15],
        "Right Leg": [-28, -5, 8], "Left Leg": [-46, 4, 12],
      }) },
      { n: 0.76, curve: "smooth", pose: pose({
        Torso: [0.04, 0.56, -0.16], "Right Arm": [-0.12, -0.02, -0.1], "Left Arm": [0.2, -0.05, -0.16],
        "Right Leg": [0.5, -0.2, 0.42], "Left Leg": [-0.42, -0.12, 0.28],
      }, {
        Torso: [18, 6, -14], Head: [12, -5, 4], "Right Arm": [-8, 38, -4], "Left Arm": [-4, -30, -8],
        "Right Leg": [-38, -8, 12], "Left Leg": [-28, 6, 8],
      }) },
      { n: 0.9, curve: "snap", pose: pose({
        Torso: [0.02, 0.2, -0.08], "Right Arm": [-0.05, 0, -0.05], "Left Arm": [0.08, 0, -0.06],
        "Right Leg": [0.36, -0.1, 0.26], "Left Leg": [-0.3, -0.08, 0.22],
      }, {
        Torso: [20, 3, -6], Head: [5, -2, 2], "Right Arm": [-10, 18, -3], "Left Arm": [-8, -14, -4],
        "Right Leg": [-24, -5, 7], "Left Leg": [-20, 4, 6],
      }) },
      { n: 1, curve: "smooth", pose: neutral },
    ],
  },
];

function draftFor(original: Original): AnimationDraft {
  const fps = 60;
  const frames = Math.max(16, Math.round(original.duration * fps));
  const samples = Array.from({ length: frames + 1 }, (_, index) => {
    const n = index / frames;
    const base = original.procedural ? original.procedural(n) : at(original.points!, n);
    if (original.looped || !original.points) return { time: n * original.duration, pose: base };
    const offsets: Record<Joint, number> = {
      Torso: 0, Head: -0.008, "Right Arm": -0.012, "Left Arm": 0.014, "Right Leg": -0.007, "Left Leg": 0.009,
    };
    const poses = {} as Pose;
    poses.positions = {} as Record<Joint, Position>;
    poses.rotations = {} as Record<Joint, Rotation>;
    for (const joint of joints) {
      const shifted = at(original.points!, clamp(n + offsets[joint]));
      poses.positions[joint] = shifted.positions[joint];
      poses.rotations[joint] = shifted.rotations[joint];
    }
    return { time: n * original.duration, pose: poses };
  });
  return animationDraftSchema.parse({
    name: original.name, rigId: "selection:1", duration: original.duration, framesPerSecond: fps,
    looped: original.looped, priority: original.looped ? "movement" : "action3",
    beats: original.looped ? [
      { id: "support_a", label: "First support", startTime: 0, endTime: original.duration / 2, intention: original.intent, energy: 0.78, leadingBodyPart: "Torso" },
      { id: "support_b", label: "Opposite support", startTime: original.duration / 2, endTime: original.duration, intention: "Close the original loop with asymmetric overlap", energy: 0.78, leadingBodyPart: "Torso" },
    ] : [
      { id: "anticipation", label: "Preparation", startTime: 0, endTime: original.duration * 0.2, intention: "Establish support and readable direction", energy: 0.55, leadingBodyPart: "Torso" },
      { id: "action", label: "Primary action", startTime: original.duration * 0.2, endTime: original.duration * 0.62, intention: original.intent, energy: 0.95, leadingBodyPart: "Torso" },
      { id: "recovery", label: "Consequence", startTime: original.duration * 0.62, endTime: original.duration, intention: "Let body parts resolve on separate frames", energy: 0.5, leadingBodyPart: "Torso" },
    ],
    contacts: [],
    tracks: joints.map((joint) => ({
      joint, space: "motor",
      keys: samples.map((sample) => ({
        time: Number(sample.time.toFixed(6)),
        transform: {
          position: { x: sample.pose.positions[joint][0], y: sample.pose.positions[joint][1], z: sample.pose.positions[joint][2] },
          rotation: quaternion(sample.pose.rotations[joint]),
        },
        easing: { style: "linear", direction: "in" }, weight: 1,
      })),
    })),
    metadata: {
      intent: original.intent, rigType: "R6",
      style: ["r6", "original", "reference-informed", "reference-informed-translation", "dense-sampled", "human-review-required", ...original.tags],
      version: 1,
    },
  });
}

const drafts = originals.map(draftFor);
process.stdout.write(`ORIGINALS ${drafts.length}\nAPPROVED 0\n${drafts.map((d) => d.name).join("\n")}\n`);
const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
const client = new Client({ name: "motion-director-reference-informed-r6", version: "0.1.0" });
const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/src/index.js"], cwd: process.cwd(), env, stderr: "pipe" });
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function text(result: unknown): string {
  const content = result && typeof result === "object" && "content" in result ? (result as { content?: unknown }).content : undefined;
  if (!Array.isArray(content)) return "";
  const block = content.find((item) => item && typeof item === "object" && "type" in item && item.type === "text" && "text" in item && typeof item.text === "string") as { text?: string } | undefined;
  return block?.text ?? "";
}
try {
  await client.connect(transport);
  let connected = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await client.callTool({ name: "studio_status", arguments: {} });
    if ((JSON.parse(text(status)) as { connected: boolean }).connected) { connected = true; break; }
    await sleep(500);
  }
  if (!connected) throw new Error("Studio did not connect to Motion Director.");
  for (const draft of drafts) {
    const validation = await client.callTool({ name: "validate_animation_draft", arguments: { draft } });
    if (validation.isError) throw new Error(`${draft.name}: ${text(validation)}`);
    const staged = await client.callTool({ name: "stage_animation_draft", arguments: { transactionName: `Reference-informed original - ${draft.name}`, draft } });
    if (staged.isError) throw new Error(`${draft.name}: ${text(staged)}`);
    const transactionId = (JSON.parse(text(staged)) as { transactionId: string }).transactionId;
    const committed = await client.callTool({ name: "commit_animation_draft", arguments: { transactionId, destinationName: draft.name } });
    if (committed.isError) throw new Error(`${draft.name}: ${text(committed)}`);
    process.stdout.write(`STAGED ${draft.name}\n`);
  }
  const attached = await client.callTool({ name: "attach_committed_animations_to_selected_rig_animsaves", arguments: { namePrefix: "MD_REFLEARN_R6_" } });
  if (attached.isError) throw new Error(text(attached));
  process.stdout.write(`ATTACHED\n${text(attached)}\n`);
} finally { await client.close(); }
