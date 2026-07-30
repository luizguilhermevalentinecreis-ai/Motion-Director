import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { animationDraftSchema, type AnimationDraft, type QualityReport } from "../src/domain.js";
import { reviewDraft } from "../src/quality.js";
import {
  parkourDirections,
  type ParkourAction,
  type ParkourDirection,
} from "../src/parkour-directions.js";

type Rotation = [number, number, number];
type Position = [number, number, number];
const joints = [
  "LowerTorso", "UpperTorso", "Head",
  "RightUpperArm", "RightLowerArm", "RightHand",
  "LeftUpperArm", "LeftLowerArm", "LeftHand",
  "RightUpperLeg", "RightLowerLeg", "RightFoot",
  "LeftUpperLeg", "LeftLowerLeg", "LeftFoot",
] as const;
type Joint = (typeof joints)[number];
type Pose = { root: Position; rotations: Record<Joint, Rotation> };
type Point = { n: number; pose: Pose; curve?: "smooth" | "snap" | "linear" };
type Candidate = { direction: ParkourDirection; draft: AnimationDraft; report: QualityReport; score: number };

const actions: ParkourAction[] = [
  "approach", "takeoff", "precision-jump", "landing", "vault",
  "wall-run", "wall-climb", "ledge", "slide", "roll",
];
const neutral: Record<Joint, Rotation> = {
  LowerTorso: [0, 0, 0], UpperTorso: [0, 0, 0], Head: [0, 0, 0],
  RightUpperArm: [4, -3, -6], RightLowerArm: [10, 0, 0], RightHand: [0, 0, 0],
  LeftUpperArm: [4, 3, 6], LeftLowerArm: [10, 0, 0], LeftHand: [0, 0, 0],
  RightUpperLeg: [0, 0, 0], RightLowerLeg: [0, 0, 0], RightFoot: [0, 0, 0],
  LeftUpperLeg: [0, 0, 0], LeftLowerLeg: [0, 0, 0], LeftFoot: [0, 0, 0],
};

function clamp(v: number, min = 0, max = 1): number { return Math.min(max, Math.max(min, v)); }
function mix(a: number, b: number, t: number): number { return a + (b - a) * t; }
function smooth(t: number): number { const x = clamp(t); return x * x * (3 - 2 * x); }
function snap(t: number): number { return 1 - Math.pow(1 - clamp(t), 3.4); }
function has(d: ParkourDirection, tag: string): boolean { return d.tags.includes(tag); }
function slug(v: string): string { return v.replace(/[^A-Za-z0-9]+/g, ""); }
function r(x = 0, y = 0, z = 0): Rotation { return [x, y, z]; }
function p(root: Position = [0, 0, 0], changes: Partial<Record<Joint, Rotation>> = {}): Pose {
  return { root, rotations: { ...neutral, ...changes } };
}
function m(base: Pose, root: Position, changes: Partial<Record<Joint, Rotation>>): Pose {
  return { root, rotations: { ...base.rotations, ...changes } };
}
function mirror(source: Pose): Pose {
  const rotations = {} as Record<Joint, Rotation>;
  for (const joint of joints) {
    const mirrored = joint.startsWith("Left")
      ? (`Right${joint.slice(4)}` as Joint)
      : joint.startsWith("Right") ? (`Left${joint.slice(5)}` as Joint) : joint;
    const a = source.rotations[joint];
    rotations[mirrored] = [a[0], -a[1], -a[2]];
  }
  return { root: [-source.root[0], source.root[1], source.root[2]], rotations };
}
function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const rotations = {} as Record<Joint, Rotation>;
  for (const joint of joints) {
    const left = a.rotations[joint], right = b.rotations[joint];
    rotations[joint] = [mix(left[0], right[0], t), mix(left[1], right[1], t), mix(left[2], right[2], t)];
  }
  return {
    root: [mix(a.root[0], b.root[0], t), mix(a.root[1], b.root[1], t), mix(a.root[2], b.root[2], t)],
    rotations,
  };
}
function sample(points: Point[], n: number): Pose {
  if (n <= points[0]!.n) return points[0]!.pose;
  for (let i = 1; i < points.length; i += 1) {
    const b = points[i]!;
    if (n <= b.n) {
      const a = points[i - 1]!;
      let t = (n - a.n) / (b.n - a.n);
      t = b.curve === "linear" ? t : b.curve === "snap" ? snap(t) : smooth(t);
      return lerpPose(a.pose, b.pose, t);
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

function runPose(d: ParkourDirection, phase: number): Pose {
  const fast = has(d, "sprint") || has(d, "fast");
  const quiet = has(d, "quiet");
  const tired = has(d, "fatigued");
  const angle = has(d, "angled") ? 1 : 0;
  const stride = (fast ? 58 : 44) * mix(0.8, 1.08, d.energy) * (tired ? 0.78 : 1);
  const wave = Math.sin(phase * Math.PI * 2);
  const lift = 0.5 - 0.5 * Math.cos(phase * Math.PI * 4);
  const arm = stride * 0.88 * wave;
  return p([
    angle * 0.035 * Math.sin(phase * Math.PI * 2),
    (quiet ? 0.035 : 0.07) * lift - 0.025,
    0,
  ], {
    LowerTorso: r(fast ? 12 : 7, angle * 10 + wave * 3, angle * 5 + wave * 2),
    UpperTorso: r(fast ? -7 : -4, -angle * 7 - wave * 5, -angle * 3 - wave * 2),
    Head: r(fast ? -4 : -2, -angle * 3, -angle * 2),
    RightUpperArm: r(-arm, -5, -9), RightLowerArm: r(48 + 16 * Math.abs(wave), 0, 0),
    LeftUpperArm: r(arm, 5, 9), LeftLowerArm: r(48 + 16 * Math.abs(wave), 0, 0),
    RightUpperLeg: r(stride * wave, -2, 3), RightLowerLeg: r(-18 - 58 * Math.max(0, -wave), 0, 0), RightFoot: r(12 * -wave, 0, 0),
    LeftUpperLeg: r(-stride * wave, 2, -3), LeftLowerLeg: r(-18 - 58 * Math.max(0, wave), 0, 0), LeftFoot: r(12 * wave, 0, 0),
  });
}
function approachPoints(d: ParkourDirection): Point[] {
  return Array.from({ length: 9 }, (_, i) => ({ n: i / 8, pose: runPose(d, i / 8), curve: "smooth" as const }));
}

function takeoffPoints(d: ParkourDirection): Point[] {
  const one = has(d, "one-foot");
  const slip = has(d, "slip");
  const hurdle = has(d, "hurdle");
  const start = runPose(d, 0.1);
  const coil = p([one ? -0.03 : 0, -0.27 * mix(0.75, 1.15, d.height), 0.035], {
    LowerTorso: r(24, one ? -7 : 0, one ? 4 : 0), UpperTorso: r(-13, one ? 8 : 0, one ? -3 : 0), Head: r(8, 0, 0),
    RightUpperArm: r(-48, -8, -15), RightLowerArm: r(38, 0, 0),
    LeftUpperArm: r(-48, 8, 15), LeftLowerArm: r(38, 0, 0),
    RightUpperLeg: r(one ? 42 : 30, -4, 6), RightLowerLeg: r(one ? -96 : -112, 0, 0), RightFoot: r(28, 0, 0),
    LeftUpperLeg: r(one ? -18 : 30, 4, -6), LeftLowerLeg: r(one ? -35 : -112, 0, 0), LeftFoot: r(one ? 10 : 28, 0, 0),
  });
  const extend = p([slip ? 0.08 : 0, 0.16 * d.height, -0.12 * d.distance], {
    LowerTorso: r(-8, one ? 5 : 0, 0), UpperTorso: r(7, one ? -4 : 0, 0), Head: r(-5, 0, 0),
    RightUpperArm: r(62, -12, -20), RightLowerArm: r(18, 0, 0),
    LeftUpperArm: r(62, 12, 20), LeftLowerArm: r(18, 0, 0),
    RightUpperLeg: r(one ? -22 : -12, -3, 4), RightLowerLeg: r(-18, 0, 0), RightFoot: r(-18, 0, 0),
    LeftUpperLeg: r(one ? 48 : -12, 3, -4), LeftLowerLeg: r(one ? -62 : -18, 0, 0), LeftFoot: r(one ? 20 : -18, 0, 0),
  });
  return [
    { n: 0, pose: start }, { n: hurdle ? 0.24 : 0.3, pose: coil, curve: "smooth" },
    { n: 0.42, pose: coil, curve: "linear" }, { n: 0.62, pose: extend, curve: "snap" },
    { n: 1, pose: m(extend, [extend.root[0], extend.root[1] * 1.2, extend.root[2] * 1.3], {}), curve: "smooth" },
  ];
}
function jumpPoints(d: ParkourDirection): Point[] {
  const lateral = has(d, "lateral"), cat = has(d, "cat-leap"), stride = has(d, "stride");
  const side = lateral ? 1 : 0;
  const extend = p([0, 0.12, 0], {
    LowerTorso: r(-5, side * 8, side * 4), UpperTorso: r(5, -side * 5, -side * 2), Head: r(-3, -side * 3, 0),
    RightUpperArm: r(48, -10, -18), RightLowerArm: r(20, 0, 0),
    LeftUpperArm: r(48, 10, 18), LeftLowerArm: r(20, 0, 0),
    RightUpperLeg: r(stride ? -25 : -12, -3, 4), RightLowerLeg: r(-20, 0, 0),
    LeftUpperLeg: r(stride ? 38 : -12, 3, -4), LeftLowerLeg: r(stride ? -58 : -20, 0, 0),
  });
  const flight = p([side * 0.14, 0.28 * d.height, -0.16 * d.distance], {
    LowerTorso: r(2, side * 12, side * 6), UpperTorso: r(-2, -side * 8, -side * 3), Head: r(-5, -side * 3, 0),
    RightUpperArm: r(cat ? 115 : 20, -12, -18), RightLowerArm: r(cat ? 25 : 42, 0, 0),
    LeftUpperArm: r(cat ? 115 : 20, 12, 18), LeftLowerArm: r(cat ? 25 : 42, 0, 0),
    RightUpperLeg: r(cat ? 65 : 32, -4, 6), RightLowerLeg: r(cat ? -105 : -70, 0, 0), RightFoot: r(22, 0, 0),
    LeftUpperLeg: r(cat ? 65 : 28, 4, -6), LeftLowerLeg: r(cat ? -105 : -65, 0, 0), LeftFoot: r(22, 0, 0),
  });
  const prepare = p([side * 0.2, 0.05, -0.28 * d.distance], {
    LowerTorso: r(12, side * 8, side * 5), UpperTorso: r(-7, -side * 5, -side * 3), Head: r(3, 0, 0),
    RightUpperArm: r(-35, -12, -18), RightLowerArm: r(48, 0, 0),
    LeftUpperArm: r(-35, 12, 18), LeftLowerArm: r(48, 0, 0),
    RightUpperLeg: r(38, -3, 5), RightLowerLeg: r(-52, 0, 0), RightFoot: r(12, 0, 0),
    LeftUpperLeg: r(38, 3, -5), LeftLowerLeg: r(-52, 0, 0), LeftFoot: r(12, 0, 0),
  });
  return [{ n: 0, pose: extend }, { n: 0.45, pose: flight, curve: "smooth" }, { n: 0.7, pose: flight, curve: "linear" }, { n: 1, pose: prepare, curve: "snap" }];
}
function landingPoints(d: ParkourDirection): Point[] {
  const one = has(d, "one-foot"), roll = has(d, "roll-ready"), unstable = has(d, "unstable") || has(d, "fatigued");
  const pre = jumpPoints({ ...d, action: "precision-jump" }).at(-1)!.pose;
  const contact = p([0, -0.05, 0.035], {
    LowerTorso: r(16, one ? -8 : 0, one ? 5 : 0), UpperTorso: r(-9, one ? 8 : 0, one ? -3 : 0), Head: r(5, 0, 0),
    RightUpperArm: r(-42, -12, -20), RightLowerArm: r(52, 0, 0),
    LeftUpperArm: r(-42, 12, 20), LeftLowerArm: r(52, 0, 0),
    RightUpperLeg: r(one ? 38 : 28, -3, 5), RightLowerLeg: r(one ? -58 : -72, 0, 0), RightFoot: r(18, 0, 0),
    LeftUpperLeg: r(one ? -12 : 28, 3, -5), LeftLowerLeg: r(one ? -22 : -72, 0, 0), LeftFoot: r(one ? 4 : 18, 0, 0),
  });
  const absorb = p([one ? -0.05 : 0, -0.31 * mix(0.8, 1.15, d.height), 0.06], {
    LowerTorso: r(roll ? 38 : 30, one ? -12 : 0, one ? 7 : 0), UpperTorso: r(roll ? -18 : -16, one ? 10 : 0, one ? -5 : 0), Head: r(roll ? 12 : 9, 0, 0),
    RightUpperArm: r(unstable ? -12 : -58, -14, -24), RightLowerArm: r(unstable ? 80 : 42, 0, 0),
    LeftUpperArm: r(-58, 14, 24), LeftLowerArm: r(42, 0, 0),
    RightUpperLeg: r(one ? 52 : 42, -4, 6), RightLowerLeg: r(one ? -105 : -116, 0, 0), RightFoot: r(32, 0, 0),
    LeftUpperLeg: r(one ? 18 : 42, 4, -6), LeftLowerLeg: r(one ? -45 : -116, 0, 0), LeftFoot: r(one ? 14 : 32, 0, 0),
  });
  const settle = unstable ? m(absorb, [-0.06, -0.2, 0.035], { UpperTorso: r(-24, 12, -8), RightUpperArm: r(55, -20, -30) }) : p([0, -0.04, 0], {});
  return [{ n: 0, pose: pre }, { n: 0.25, pose: contact, curve: "snap" }, { n: 0.55, pose: absorb, curve: "smooth" }, { n: 0.72, pose: absorb, curve: "linear" }, { n: 1, pose: settle, curve: "smooth" }];
}

function vaultPoints(d: ParkourDirection): Point[] {
  const two = has(d, "two-hand"), one = has(d, "one-hand"), under = has(d, "underbar");
  const reverse = has(d, "reverse-turn") || has(d, "palm-spin"), legsForward = has(d, "legs-forward");
  const plant = p([one ? 0.08 : 0, -0.08, -0.05], {
    LowerTorso: r(30, reverse ? 34 : one ? 18 : 0, one ? 12 : 0), UpperTorso: r(-16, reverse ? -20 : one ? -12 : 0, one ? -8 : 0), Head: r(9, reverse ? -18 : 0, 0),
    RightUpperArm: r(one ? 125 : two ? 132 : under ? 155 : 80, -12, -20), RightLowerArm: r(under ? 16 : 28, 0, 0), RightHand: r(-10, 0, 5),
    LeftUpperArm: r(one ? 35 : two ? 132 : under ? 155 : 80, 12, 20), LeftLowerArm: r(under ? 16 : 28, 0, 0), LeftHand: r(-10, 0, -5),
    RightUpperLeg: r(42, -8, 12), RightLowerLeg: r(-92, 0, 0),
    LeftUpperLeg: r(35, 8, -12), LeftLowerLeg: r(-82, 0, 0),
  });
  const clear = p([one ? 0.16 : 0, 0.25 * d.height, -0.16 * d.distance], {
    LowerTorso: r(legsForward ? -12 : 24, reverse ? 110 : one ? 34 : 0, one ? 18 : 0), UpperTorso: r(legsForward ? 8 : -12, reverse ? -70 : one ? -20 : 0, one ? -10 : 0), Head: r(-4, reverse ? -72 : 0, 0),
    RightUpperArm: r(110, -18, -25), RightLowerArm: r(22, 0, 0),
    LeftUpperArm: r(two ? 110 : 50, 18, 25), LeftLowerArm: r(two ? 22 : 55, 0, 0),
    RightUpperLeg: r(legsForward ? 86 : 72, -12, 18), RightLowerLeg: r(legsForward ? -20 : -112, 0, 0),
    LeftUpperLeg: r(legsForward ? 78 : 66, 12, -18), LeftLowerLeg: r(legsForward ? -24 : -104, 0, 0),
  });
  const release = p([one ? 0.12 : 0, 0.16, -0.28 * d.distance], {
    LowerTorso: r(8, reverse ? 176 : one ? 14 : 0, one ? 8 : 0), UpperTorso: r(-5, reverse ? -135 : one ? -8 : 0, 0), Head: r(-2, reverse ? -145 : 0, 0),
    RightUpperArm: r(22, -10, -16), LeftUpperArm: r(26, 10, 16),
    RightUpperLeg: r(-18, -4, 6), RightLowerLeg: r(-38, 0, 0), LeftUpperLeg: r(28, 4, -6), LeftLowerLeg: r(-62, 0, 0),
  });
  return [{ n: 0, pose: runPose(d, 0) }, { n: 0.24, pose: plant, curve: "snap" }, { n: 0.52, pose: clear, curve: "snap" }, { n: 0.66, pose: clear, curve: "linear" }, { n: 0.84, pose: release, curve: "snap" }, { n: 1, pose: runPose(d, 0.5), curve: "smooth" }];
}
function wallRunPoints(d: ParkourDirection): Point[] {
  const right = has(d, "right-wall"), vertical = has(d, "vertical");
  const sign = right ? 1 : -1;
  const wall = p([sign * 0.08, vertical ? 0.18 : 0.04, -0.06], {
    LowerTorso: r(vertical ? 14 : 9, sign * 10, sign * 20), UpperTorso: r(-7, -sign * 8, -sign * 16), Head: r(-4, -sign * 12, -sign * 5),
    RightUpperArm: r(right ? 96 : -42, right ? -24 : -8, right ? -42 : -12), RightLowerArm: r(right ? 62 : 48, 0, 0),
    LeftUpperArm: r(right ? -42 : 96, right ? 8 : 24, right ? 12 : 42), LeftLowerArm: r(right ? 48 : 62, 0, 0),
    RightUpperLeg: r(right ? 56 : -28, -8, 14), RightLowerLeg: r(right ? -92 : -42, 0, 0), RightFoot: r(right ? 28 : 12, 0, -sign * 12),
    LeftUpperLeg: r(right ? -28 : 56, 8, -14), LeftLowerLeg: r(right ? -42 : -92, 0, 0), LeftFoot: r(right ? 12 : 28, 0, -sign * 12),
  });
  const next = mirror(wall);
  next.root[0] = wall.root[0];
  if (vertical) next.root[1] = 0.35 * d.height;
  return [{ n: 0, pose: runPose(d, 0) }, { n: 0.28, pose: wall, curve: "snap" }, { n: 0.58, pose: next, curve: "smooth" }, { n: 0.78, pose: next, curve: "linear" }, { n: 1, pose: vertical ? m(next, [0, 0.48 * d.height, -0.08], { RightUpperArm: r(132, -10, -15), LeftUpperArm: r(132, 10, 15) }) : wall, curve: "smooth" }];
}
function wallClimbPoints(d: ParkourDirection): Point[] {
  const failed = has(d, "failed"), one = has(d, "one-hand"), tired = has(d, "fatigued");
  const reach = p([one ? 0.08 : 0, 0.24, -0.04], {
    LowerTorso: r(12, one ? 10 : 0, one ? 6 : 0), UpperTorso: r(-8, one ? -8 : 0, one ? -4 : 0), Head: r(-10, 0, 0),
    RightUpperArm: r(152, -12, -18), RightLowerArm: r(18, 0, 0), RightHand: r(-12, 0, 0),
    LeftUpperArm: r(one ? 96 : 152, 12, 18), LeftLowerArm: r(one ? 72 : 18, 0, 0), LeftHand: r(-12, 0, 0),
    RightUpperLeg: r(42, -6, 10), RightLowerLeg: r(-96, 0, 0), RightFoot: r(30, 0, 0),
    LeftUpperLeg: r(-18, 6, -10), LeftLowerLeg: r(-46, 0, 0), LeftFoot: r(16, 0, 0),
  });
  const pull = p([one ? 0.06 : 0, failed ? 0.18 : 0.46 * d.height, -0.02], {
    LowerTorso: r(22, one ? 12 : 0, one ? 8 : 0), UpperTorso: r(-14, one ? -10 : 0, one ? -6 : 0), Head: r(-6, 0, 0),
    RightUpperArm: r(126, -10, -16), RightLowerArm: r(tired ? 98 : 72, 0, 0),
    LeftUpperArm: r(one ? 126 : 126, 10, 16), LeftLowerArm: r(tired ? 108 : 72, 0, 0),
    RightUpperLeg: r(72, -8, 14), RightLowerLeg: r(-112, 0, 0), LeftUpperLeg: r(35, 8, -14), LeftLowerLeg: r(-78, 0, 0),
  });
  const top = failed ? m(reach, [0, -0.08, 0.05], { RightUpperArm: r(108, -10, -16), LeftUpperArm: r(108, 10, 16) }) : p([0, 0.62 * d.height, -0.18], {
    LowerTorso: r(36, 0, 0), UpperTorso: r(-22, 0, 0), Head: r(10, 0, 0),
    RightUpperArm: r(98, -12, -18), RightLowerArm: r(32, 0, 0), LeftUpperArm: r(112, 12, 18), LeftLowerArm: r(42, 0, 0),
    RightUpperLeg: r(82, -8, 14), RightLowerLeg: r(-118, 0, 0), LeftUpperLeg: r(52, 8, -14), LeftLowerLeg: r(-92, 0, 0),
  });
  return [{ n: 0, pose: runPose(d, 0.2) }, { n: 0.28, pose: reach, curve: "snap" }, { n: 0.5, pose: pull, curve: "snap" }, { n: 0.68, pose: pull, curve: tired ? "smooth" : "linear" }, { n: 1, pose: top, curve: "snap" }];
}
function ledgePoints(d: ParkourDirection): Point[] {
  const one = has(d, "one-hand"), swing = has(d, "swing"), mantle = has(d, "mantle"), drop = has(d, "drop"), shimmy = has(d, "shimmy");
  const side = has(d, "right") ? 1 : -1;
  const hang = p([one ? side * 0.08 : 0, -0.06, 0], {
    LowerTorso: r(6, one ? side * 10 : 0, one ? side * 7 : 0), UpperTorso: r(-4, one ? -side * 8 : 0, one ? -side * 5 : 0), Head: r(-8, 0, 0),
    RightUpperArm: r(154, -10, -14), RightLowerArm: r(one && side < 0 ? 72 : 24, 0, 0), RightHand: r(-10, 0, 0),
    LeftUpperArm: r(154, 10, 14), LeftLowerArm: r(one && side > 0 ? 72 : 24, 0, 0), LeftHand: r(-10, 0, 0),
    RightUpperLeg: r(24, -5, 9), RightLowerLeg: r(-58, 0, 0), RightFoot: r(18, 0, 0),
    LeftUpperLeg: r(24, 5, -9), LeftLowerLeg: r(-58, 0, 0), LeftFoot: r(18, 0, 0),
  });
  let extreme = m(hang, [shimmy ? side * 0.14 : 0, swing ? -0.12 : mantle ? 0.26 : -0.08, swing ? -0.12 : 0], {
    LowerTorso: r(swing ? -16 : mantle ? 28 : 8, shimmy ? side * 10 : 0, shimmy ? side * 6 : 0),
    RightLowerArm: r(mantle ? 82 : 35, 0, 0), LeftLowerArm: r(mantle ? 54 : 35, 0, 0),
    RightUpperLeg: r(mantle ? 78 : swing ? -22 : 28, -5, 9), LeftUpperLeg: r(mantle ? 46 : swing ? -18 : 28, 5, -9),
  });
  if (drop) extreme = p([0, -0.28, 0.04], { RightUpperArm: r(82, -10, -16), LeftUpperArm: r(82, 10, 16), RightUpperLeg: r(18, 0, 0), LeftUpperLeg: r(18, 0, 0) });
  return [{ n: 0, pose: hang }, { n: 0.3, pose: extreme, curve: "smooth" }, { n: 0.62, pose: swing ? m(hang, [0, -0.04, 0.1], { LowerTorso: r(14, 0, 0) }) : extreme, curve: "smooth" }, { n: 1, pose: drop || mantle ? extreme : hang, curve: "smooth" }];
}
function slidePoints(d: ParkourDirection): Point[] {
  const side = has(d, "side") || has(d, "slip"), knees = has(d, "knees"), under = has(d, "underbar");
  const low = p([side ? 0.1 : 0, -0.34, -0.08], {
    LowerTorso: r(under ? 42 : 52, side ? 18 : 0, side ? 14 : 0), UpperTorso: r(under ? -24 : -28, side ? -12 : 0, side ? -9 : 0), Head: r(under ? 16 : 18, 0, 0),
    RightUpperArm: r(-48, -18, -28), RightLowerArm: r(35, 0, 0), LeftUpperArm: r(side ? 58 : -32, 18, 28), LeftLowerArm: r(side ? 72 : 42, 0, 0),
    RightUpperLeg: r(knees ? 58 : 82, -8, 14), RightLowerLeg: r(knees ? -112 : -18, 0, 0), RightFoot: r(-12, 0, 0),
    LeftUpperLeg: r(knees ? 58 : 26, 8, -14), LeftLowerLeg: r(knees ? -112 : -118, 0, 0), LeftFoot: r(30, 0, 0),
  });
  const glide = m(low, [side ? 0.14 : 0, -0.38, -0.18 * d.distance], { LowerTorso: r(low.rotations.LowerTorso[0] + 4, low.rotations.LowerTorso[1], low.rotations.LowerTorso[2]) });
  const exit = has(d, "running-exit") ? runPose(d, 0.25) : p([0, -0.08, 0], { LowerTorso: r(12, 0, 0), RightUpperLeg: r(25, 0, 0), LeftUpperLeg: r(20, 0, 0) });
  return [{ n: 0, pose: runPose(d, 0) }, { n: 0.2, pose: low, curve: "snap" }, { n: 0.58, pose: glide, curve: "smooth" }, { n: 0.72, pose: glide, curve: "linear" }, { n: 1, pose: exit, curve: "snap" }];
}
function rollPoints(d: ParkourDirection): Point[] {
  const right = has(d, "right-shoulder"), sign = right ? 1 : -1;
  const entry = p([0, -0.18, 0.02], { LowerTorso: r(45, sign * 8, sign * 12), UpperTorso: r(-18, -sign * 8, -sign * 10), Head: r(18, -sign * 10, -sign * 8), RightUpperArm: r(-62, -18, -28), LeftUpperArm: r(-48, 18, 28), RightUpperLeg: r(58, -6, 10), RightLowerLeg: r(-106, 0, 0), LeftUpperLeg: r(48, 6, -10), LeftLowerLeg: r(-96, 0, 0) });
  const mid = m(entry, [sign * 0.08, -0.3, -0.12], { LowerTorso: r(165, sign * 18, sign * 28), UpperTorso: r(28, -sign * 12, -sign * 18), Head: r(-22, -sign * 15, -sign * 12), RightUpperArm: r(92, -22, -36), LeftUpperArm: r(78, 22, 36), RightUpperLeg: r(92, -8, 14), LeftUpperLeg: r(86, 8, -14), RightLowerLeg: r(-126, 0, 0), LeftLowerLeg: r(-122, 0, 0) });
  const back = m(mid, [sign * 0.12, -0.22, -0.22], { LowerTorso: r(265, sign * 14, sign * 20), UpperTorso: r(18, -sign * 10, -sign * 14), Head: r(-16, -sign * 10, -sign * 8), RightUpperLeg: r(64, -6, 10), LeftUpperLeg: r(58, 6, -10) });
  const exit = has(d, "running-exit") ? runPose(d, 0.25) : p([sign * 0.06, -0.1, -0.3], { LowerTorso: r(360, 0, 0), UpperTorso: r(0, 0, 0), Head: r(0, 0, 0), RightUpperLeg: r(32, 0, 0), RightLowerLeg: r(-72, 0, 0), LeftUpperLeg: r(22, 0, 0), LeftLowerLeg: r(-58, 0, 0) });
  return [{ n: 0, pose: entry }, { n: 0.34, pose: mid, curve: "snap" }, { n: 0.62, pose: back, curve: "smooth" }, { n: 1, pose: exit, curve: "snap" }];
}
function pointsFor(d: ParkourDirection): Point[] {
  switch (d.action) {
    case "approach": return approachPoints(d);
    case "takeoff": return takeoffPoints(d);
    case "precision-jump": return jumpPoints(d);
    case "landing": return landingPoints(d);
    case "vault": return vaultPoints(d);
    case "wall-run": return wallRunPoints(d);
    case "wall-climb": return wallClimbPoints(d);
    case "ledge": return ledgePoints(d);
    case "slide": return slidePoints(d);
    case "roll": return rollPoints(d);
  }
}
function styles(d: ParkourDirection): string[] {
  const values = ["r15", "parkour", "realistic-human", "dense-sampled", "human-review-required", "visual-direction", d.action, ...d.tags];
  if (d.action === "approach") values.push("run");
  if (d.action === "takeoff" || d.action === "precision-jump") values.push("jump");
  if (d.action === "landing") values.push("land");
  return [...new Set(values)];
}
function draftFor(d: ParkourDirection): AnimationDraft {
  const fps = 30, frameCount = Math.max(12, Math.round(d.duration * fps));
  const points = pointsFor(d);
  const samples = Array.from({ length: frameCount + 1 }, (_, index) => ({ time: index * d.duration / frameCount, pose: sample(points, index / frameCount) }));
  const looped = d.action === "approach";
  return animationDraftSchema.parse({
    name: `Attempt_Parkour_${d.id}_${slug(d.name)}`, rigId: "selection:1", duration: d.duration, framesPerSecond: fps,
    looped, priority: looped ? "movement" : "action3",
    beats: looped ? [
      { id: "support_a", label: "First support", startTime: 0, endTime: d.duration / 2, intention: d.thesis, energy: d.energy, leadingBodyPart: "LowerTorso" },
      { id: "support_b", label: "Opposite support", startTime: d.duration / 2, endTime: d.duration, intention: "Complete the asymmetric support cycle without losing obstacle focus", energy: d.energy, leadingBodyPart: "LowerTorso" },
    ] : [
      { id: "preparation", label: "Preparation", startTime: 0, endTime: d.duration * 0.25, intention: "Organize support and center of mass before committing", energy: d.energy * 0.55, leadingBodyPart: "LowerTorso" },
      { id: "contact", label: "Primary contact or flight", startTime: d.duration * 0.25, endTime: d.duration * 0.68, intention: d.thesis, energy: d.energy, leadingBodyPart: "LowerTorso" },
      { id: "recovery", label: "Recovery", startTime: d.duration * 0.68, endTime: d.duration, intention: "Dissipate force or hand off to the next locomotion state", energy: d.energy * 0.5, leadingBodyPart: "LowerTorso" },
    ],
    contacts: [],
    tracks: joints.map((joint) => ({
      joint, space: "parent",
      keys: samples.map(({ time, pose: value }) => ({
        time: Number(time.toFixed(6)),
        transform: {
          position: joint === "LowerTorso" ? { x: value.root[0], y: value.root[1], z: value.root[2] } : { x: 0, y: 0, z: 0 },
          rotation: quaternion(value.rotations[joint]),
        },
        easing: { style: "linear", direction: "inOut" }, weight: 1,
      })),
    })),
    metadata: { intent: `${d.name}: ${d.thesis}`, rigType: "R15", style: styles(d), version: 1 },
  });
}
function metric(report: QualityReport, name: string): number | undefined { return report.metrics.find((m) => m.name === name)?.score; }
function rank(direction: ParkourDirection): Candidate {
  const draft = draftFor(direction), report = reviewDraft(draft);
  const relevant = ["dense_temporal_sampling", "easing_velocity_continuity", "angular_velocity_spike_health", "overlap_timing_diversity", "loop_closure", "locomotion_cadence", "roll_rotation_continuity"]
    .map((name) => metric(report, name)).filter((v): v is number => v !== undefined);
  const technical = relevant.reduce((sum, v) => sum + v, 0) / Math.max(1, relevant.length);
  return { direction, draft, report, score: report.overallScore * 0.45 + technical * 0.55 };
}
const candidates = parkourDirections.map(rank);
const preferredVariants: Record<ParkourAction, [string, string]> = {
  approach: ["flow", "acceleration"],
  takeoff: ["two-foot", "one-foot"],
  "precision-jump": ["standing", "running"],
  landing: ["precision", "running"],
  vault: ["safety", "kong"],
  "wall-run": ["left", "vertical"],
  "wall-climb": ["power", "technical"],
  ledge: ["catch", "mantle"],
  slide: ["baseball", "run-exit"],
  roll: ["left", "landing"],
};
const queue = actions.flatMap((action) =>
  preferredVariants[action].map((variant) => {
    const candidate = candidates.find((item) =>
      item.direction.action === action && item.direction.variant === variant
    );
    if (!candidate) throw new Error(`Missing preferred ${action}/${variant} parkour direction.`);
    return candidate;
  }),
);
queue.forEach((candidate, index) => {
  candidate.draft.name = `MD_REVIEW_PARKOUR_R15_${String(index + 1).padStart(2, "0")}_${slug(candidate.direction.name)}`;
  candidate.draft.metadata.style.push("numeric-shortlist");
});
process.stdout.write(`GENERATED ${candidates.length}\nDISTINCT_DIRECTIONS ${new Set(candidates.map((c) => c.direction.id)).size}\nSHORTLISTED ${queue.length}\nAPPROVED 0\n`);
for (const c of queue) process.stdout.write(`REVIEW ${c.draft.name} score=${c.score.toFixed(4)} action=${c.direction.action}\n`);

const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
const client = new Client({ name: "motion-director-r15-realistic-parkour", version: "0.1.0" });
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
  const capabilities = await client.callTool({ name: "studio_animation_capabilities", arguments: {} });
  if (capabilities.isError) throw new Error(text(capabilities));
  for (const candidate of queue) {
    const validation = await client.callTool({ name: "validate_animation_draft", arguments: { draft: candidate.draft } });
    if (validation.isError) throw new Error(`${candidate.draft.name}: ${text(validation)}`);
    const staged = await client.callTool({ name: "stage_animation_draft", arguments: { transactionName: `R15 parkour review - ${candidate.direction.name}`, draft: candidate.draft } });
    if (staged.isError) throw new Error(`${candidate.draft.name}: ${text(staged)}`);
    const transactionId = (JSON.parse(text(staged)) as { transactionId: string }).transactionId;
    const committed = await client.callTool({ name: "commit_animation_draft", arguments: { transactionId, destinationName: candidate.draft.name } });
    if (committed.isError) throw new Error(`${candidate.draft.name}: ${text(committed)}`);
    process.stdout.write(`STAGED ${candidate.draft.name}\n`);
  }
  const attached = await client.callTool({ name: "attach_committed_animations_to_selected_rig_animsaves", arguments: { namePrefix: "MD_REVIEW_PARKOUR_R15_" } });
  if (attached.isError) throw new Error(text(attached));
  process.stdout.write(`ATTACHED\n${text(attached)}\n`);
} finally { await client.close(); }
