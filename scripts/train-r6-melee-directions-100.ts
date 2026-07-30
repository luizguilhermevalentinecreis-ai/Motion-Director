import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  animationDraftSchema,
  type AnimationDraft,
  type QualityReport,
} from "../src/domain.js";
import { reviewDraft } from "../src/quality.js";
import {
  combatDirections,
  type CombatAction,
  type CombatDirection,
} from "../src/combat-directions.js";

type Rotation = [number, number, number];
type Root = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type Sample = {
  root: Root;
  rotations: Record<Joint, Rotation>;
  positions: Record<Joint, Root>;
};
type PosePoint = { n: number; sample: Sample; curve?: "linear" | "smooth" | "snap" };
type Candidate = { direction: CombatDirection; draft: AnimationDraft; report: QualityReport; score: number };

const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const actions: CombatAction[] = [
  "stance", "jab", "cross", "hook", "uppercut",
  "kick", "block", "parry", "dodge", "hit-reaction",
];

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}
function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function smooth(t: number): number {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
}
function snap(t: number): number {
  const x = clamp(t);
  return 1 - Math.pow(1 - x, 3.8);
}
function rotation(x = 0, y = 0, z = 0): Rotation {
  return [x, y, z];
}
function body(
  torso: Rotation,
  head: Rotation,
  rightArm: Rotation,
  leftArm: Rotation,
  rightLeg: Rotation,
  leftLeg: Rotation,
): Record<Joint, Rotation> {
  return { Torso: torso, Head: head, "Right Arm": rightArm, "Left Arm": leftArm, "Right Leg": rightLeg, "Left Leg": leftLeg };
}
function pose(
  root: Root,
  torso: Rotation,
  head: Rotation,
  rightArm: Rotation,
  leftArm: Rotation,
  rightLeg: Rotation,
  leftLeg: Rotation,
): Sample {
  return {
    root,
    rotations: body(torso, head, rightArm, leftArm, rightLeg, leftLeg),
    positions: {
      Torso: [0, 0, 0],
      Head: [0, 0, 0],
      "Right Arm": [0.035, 0.025, -0.025],
      "Left Arm": [-0.035, 0.025, -0.025],
      "Right Leg": [0.018, 0, 0],
      "Left Leg": [-0.018, 0, 0],
    },
  };
}
function has(direction: CombatDirection, tag: string): boolean {
  return direction.tags.includes(tag);
}
function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "");
}
function quaternion([xd, yd, zd]: Rotation) {
  const x = xd * Math.PI / 360, y = yd * Math.PI / 360, z = zd * Math.PI / 360;
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y);
  const cz = Math.cos(z), sz = Math.sin(z);
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };
}
function interpolateRotation(a: Rotation, b: Rotation, t: number): Rotation {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}
function interpolateSample(a: Sample, b: Sample, t: number): Sample {
  const rotations = {} as Record<Joint, Rotation>;
  const positions = {} as Record<Joint, Root>;
  for (const joint of joints) {
    rotations[joint] = interpolateRotation(a.rotations[joint], b.rotations[joint], t);
    positions[joint] = [
      mix(a.positions[joint][0], b.positions[joint][0], t),
      mix(a.positions[joint][1], b.positions[joint][1], t),
      mix(a.positions[joint][2], b.positions[joint][2], t),
    ];
  }
  return {
    root: [mix(a.root[0], b.root[0], t), mix(a.root[1], b.root[1], t), mix(a.root[2], b.root[2], t)],
    rotations,
    positions,
  };
}
function samplePoints(points: PosePoint[], n: number): Sample {
  if (n <= points[0]!.n) return points[0]!.sample;
  for (let index = 1; index < points.length; index += 1) {
    const next = points[index]!;
    if (n <= next.n) {
      const previous = points[index - 1]!;
      let alpha = (n - previous.n) / (next.n - previous.n);
      alpha = next.curve === "linear" ? alpha : next.curve === "snap" ? snap(alpha) : smooth(alpha);
      return interpolateSample(previous.sample, next.sample, alpha);
    }
  }
  return points.at(-1)!.sample;
}

function sideSign(direction: CombatDirection): number {
  return direction.side === "left" ? -1 : direction.side === "right" ? 1 : 0;
}
function guardPose(direction: CombatDirection): Sample {
  const side = sideSign(direction);
  const loose = has(direction, "loose") || has(direction, "street");
  const open = has(direction, "reckless") || has(direction, "berserker");
  const tall = has(direction, "muay-thai");
  const bladed = has(direction, "bladed") || has(direction, "karate");
  const level = loose ? -28 : open ? -18 : -mix(42, 66, direction.guard);
  const leftGuard = rotation(level + (side < 0 ? -5 : 2), -10, -mix(5, 18, direction.guard));
  const rightGuard = rotation(level + (side > 0 ? -5 : 2), 10, mix(5, 18, direction.guard));
  return pose(
    [0, tall ? 0.015 : -0.035, 0],
    rotation(tall ? 1 : 5, side * (bladed ? 15 : 5), side * 2),
    rotation(-3, -side * 4, -side * 1.5),
    rightGuard,
    leftGuard,
    rotation(side * -8, 0, -side * 3),
    rotation(side * 8, 0, side * 3),
  );
}
function override(
  base: Sample,
  changes: Partial<Record<Joint | "root", Rotation | Root>>,
  positionChanges: Partial<Record<Joint, Root>> = {},
): Sample {
  const rotations = { ...base.rotations };
  const positions = { ...base.positions };
  for (const joint of joints) {
    const value = changes[joint];
    if (value) rotations[joint] = value as Rotation;
    const positionValue = positionChanges[joint];
    if (positionValue) positions[joint] = positionValue;
  }
  return {
    root: (changes.root as Root | undefined) ?? base.root,
    rotations,
    positions,
  };
}
function mirrorArm(side: "left" | "right"): { striker: Joint; guard: Joint; sign: number } {
  return side === "left"
    ? { striker: "Left Arm", guard: "Right Arm", sign: -1 }
    : { striker: "Right Arm", guard: "Left Arm", sign: 1 };
}
function strikeTiming(direction: CombatDirection): [number, number, number, number] {
  if (has(direction, "anime") || has(direction, "held-release")) return [0.34, 0.49, 0.56, 0.64];
  if (has(direction, "telegraphed") || has(direction, "double-load")) return [0.28, 0.48, 0.6, 0.7];
  if (has(direction, "no-tell") || has(direction, "snap")) return [0.14, 0.39, 0.5, 0.59];
  return [0.22, 0.43, 0.56, 0.66];
}

function handStrikePoints(direction: CombatDirection): PosePoint[] {
  const base = guardPose(direction);
  const side = direction.side === "left" ? "left" : "right";
  const { striker, guard, sign } = mirrorArm(side);
  const [loadN, preN, impactN, followN] = strikeTiming(direction);
  const force = direction.force;
  const bodyShot = has(direction, "body-shot") || has(direction, "low-line");
  const step = has(direction, "step-in") || has(direction, "lunge") || has(direction, "long-range") || has(direction, "step-through");
  const retreat = has(direction, "retreat");
  const falling = has(direction, "falling");
  const leap = has(direction, "leap") || has(direction, "gazelle") || has(direction, "launcher") || has(direction, "whole-body");
  const spin = has(direction, "spin") || has(direction, "full-turn");
  const isHook = direction.action === "hook";
  const isUppercut = direction.action === "uppercut";
  const isCross = direction.action === "cross";
  const torsoTurn = (isCross ? 27 : isHook ? 38 : isUppercut ? 18 : 13) * sign * direction.commitment;
  const loadTurn = -torsoTurn * 0.65;
  const drop = bodyShot || isUppercut ? -mix(0.07, 0.18, force) : -0.035;
  const forward = retreat ? 0.06 : -(step ? mix(0.12, 0.28, direction.commitment) : mix(0.035, 0.1, direction.commitment));

  let loadArm = rotation(8, -sign * 18, sign * 20);
  let preArm = rotation(-64, sign * 4, sign * 3);
  let impactArm = rotation(-102 - force * 10, sign * 4, sign * 2);
  let followArm = rotation(-92, sign * 12, sign * 5);

  if (isHook) {
    loadArm = rotation(-34, -sign * 42, sign * 22);
    preArm = rotation(-70, -sign * 20, sign * 32);
    impactArm = rotation(-78, sign * (has(direction, "diagonal-arc") ? 48 : 70), sign * 38);
    followArm = rotation(-66, sign * 82, sign * 28);
  }
  if (isUppercut) {
    loadArm = rotation(26, -sign * 16, sign * 16);
    preArm = rotation(-54, sign * 4, sign * 18);
    impactArm = rotation(has(direction, "body-shot") ? -96 : -142, sign * 12, sign * 12);
    followArm = rotation(has(direction, "launcher") ? -166 : -126, sign * 18, sign * 8);
  }
  if (has(direction, "overhand") || has(direction, "descending")) {
    loadArm = rotation(-116, -sign * 30, sign * 34);
    preArm = rotation(-145, sign * 10, sign * 26);
    impactArm = rotation(-92, sign * 38, sign * 18);
    followArm = rotation(-64, sign * 58, sign * 12);
  }
  if (spin) {
    loadArm = rotation(48, -sign * 72, sign * 24);
    preArm = rotation(-28, sign * 100, sign * 42);
    impactArm = rotation(-76, sign * 148, sign * 32);
    followArm = rotation(-62, sign * 196, sign * 22);
  }

  const load = override(base, {
    root: [0, drop, retreat ? -0.02 : 0.015],
    Torso: rotation(bodyShot ? 14 : 7, loadTurn, -sign * 7),
    Head: rotation(bodyShot ? -4 : -2, torsoTurn * 0.25, sign * 4),
    [striker]: loadArm,
    [guard]: rotation(-68 * direction.guard, -sign * 8, -sign * 18),
    "Right Leg": rotation(sign > 0 ? 14 : -8, 0, -sign * 4),
    "Left Leg": rotation(sign < 0 ? 14 : -8, 0, sign * 4),
  }, {
    [striker]: [sign * 0.055, 0.015, 0.02],
    [guard]: [-sign * 0.045, 0.055, -0.055],
  });
  const pre = override(load, {
    root: [0, drop * 0.82 + (leap ? 0.07 : 0), forward * 0.42],
    Torso: rotation(bodyShot ? 12 : -2, torsoTurn * 0.5, sign * 5),
    Head: rotation(bodyShot ? -2 : 2, -torsoTurn * 0.32, -sign * 3),
    [striker]: preArm,
  }, {
    [striker]: [sign * (isHook ? 0.095 : 0.065), isUppercut ? 0.045 : 0.025, -0.065],
  });
  const impact = override(pre, {
    root: [sign * (isHook ? 0.04 : 0), leap ? 0.18 : drop * 0.55, forward],
    Torso: rotation(bodyShot ? 17 : isUppercut ? -12 : falling ? -18 : -5, spin ? sign * 156 : torsoTurn, sign * (isHook ? 11 : 4)),
    Head: rotation(bodyShot ? -8 : isUppercut ? 11 : 4, spin ? -sign * 118 : -torsoTurn * 0.5, -sign * 4),
    [striker]: impactArm,
    [guard]: rotation(-72 * direction.guard, -sign * 8, -sign * 20),
    "Right Leg": rotation(sign > 0 ? -20 : 18, 0, -sign * 6),
    "Left Leg": rotation(sign < 0 ? -20 : 18, 0, sign * 6),
  }, {
    [striker]: [
      sign * (isHook || spin ? 0.14 : 0.08),
      isUppercut ? 0.13 : bodyShot ? -0.055 : 0.035,
      isHook ? -0.085 : -0.14,
    ],
    [guard]: [-sign * 0.055, 0.07, -0.065],
  });
  const follow = override(impact, {
    root: [sign * (isHook ? 0.055 : 0.01), leap ? 0.1 : drop * 0.3, forward * (has(direction, "step-through") ? 1.35 : 0.82)],
    Torso: rotation(isUppercut ? -9 : 1, spin ? sign * 188 : torsoTurn * 0.82, sign * (isHook ? 8 : 2)),
    Head: rotation(isUppercut ? 7 : 1, spin ? -sign * 150 : -torsoTurn * 0.42, -sign * 2),
    [striker]: followArm,
  }, {
    [striker]: [sign * (isHook ? 0.12 : 0.075), isUppercut ? 0.1 : 0.02, -0.1],
  });
  const recover = has(direction, "no-recovery") || has(direction, "step-through")
    ? override(base, { root: [0, -0.04, forward * 0.9], Torso: rotation(5, torsoTurn * 0.25, sign * 3) })
    : base;
  return [
    { n: 0, sample: base },
    { n: loadN, sample: load, curve: has(direction, "anime") ? "smooth" : "snap" },
    { n: preN, sample: pre, curve: "snap" },
    { n: impactN, sample: impact, curve: "snap" },
    { n: followN, sample: follow, curve: "linear" },
    { n: 1, sample: recover, curve: has(direction, "exhausted") || has(direction, "unstable") ? "smooth" : "snap" },
  ];
}

function kickPoints(direction: CombatDirection): PosePoint[] {
  const base = guardPose(direction);
  const side = direction.side === "left" ? "left" : "right";
  const sign = side === "left" ? -1 : 1;
  const striker: Joint = side === "left" ? "Left Leg" : "Right Leg";
  const support: Joint = side === "left" ? "Right Leg" : "Left Leg";
  const spin = has(direction, "spin");
  const flying = has(direction, "airborne");
  const axe = has(direction, "axe-kick") || has(direction, "vertical-arc");
  const round = has(direction, "roundhouse") || has(direction, "low-kick") || has(direction, "hook-kick");
  const sideKick = has(direction, "side-kick") || has(direction, "back-kick");
  let impactLeg = rotation(-100, sign * 5, sign * 3);
  if (round) impactLeg = rotation(has(direction, "low-kick") ? -42 : -72, sign * 70, sign * 34);
  if (sideKick) impactLeg = rotation(-36, sign * 92, sign * 16);
  if (axe) impactLeg = rotation(-154, sign * 12, sign * 8);
  const chamber = override(base, {
    root: [0, -0.13, 0.025],
    Torso: rotation(12, -sign * (spin ? 42 : 9), -sign * 9),
    Head: rotation(-6, sign * (spin ? 34 : 6), sign * 6),
    [striker]: rotation(52, -sign * 15, sign * 8),
    [support]: rotation(-12, 0, -sign * 7),
    "Right Arm": rotation(-52, -16, -18),
    "Left Arm": rotation(-52, 16, 18),
  }, {
    [striker]: [sign * 0.07, 0.085, 0.015],
    [support]: [-sign * 0.025, -0.015, 0],
    "Right Arm": [0.055, 0.055, -0.045],
    "Left Arm": [-0.055, 0.055, -0.045],
  });
  const pre = override(chamber, {
    root: [0, flying ? 0.14 : -0.07, -0.05],
    Torso: rotation(4, sign * (spin ? 82 : round ? 30 : 12), -sign * 12),
    Head: rotation(-2, -sign * (spin ? 62 : 8), sign * 7),
    [striker]: axe ? rotation(-118, sign * 4, sign * 5) : rotation(12, sign * (round ? 24 : 4), sign * 8),
  }, {
    [striker]: [sign * 0.1, 0.12, -0.055],
  });
  const impact = override(pre, {
    root: [sign * (round ? 0.05 : 0), flying ? 0.28 : -0.02, has(direction, "space-making") ? -0.18 : -0.11],
    Torso: rotation(sideKick ? -8 : 4, sign * (spin ? 154 : round ? 52 : 18), -sign * 18),
    Head: rotation(sideKick ? 5 : -2, -sign * (spin ? 126 : 22), sign * 10),
    [striker]: impactLeg,
    [support]: rotation(-18, -sign * 5, -sign * 10),
    "Right Arm": rotation(-34, -28, -24),
    "Left Arm": rotation(-34, 28, 24),
  }, {
    [striker]: [sign * (round || sideKick ? 0.16 : 0.1), axe ? 0.15 : 0.08, -0.15],
    [support]: [-sign * 0.04, -0.025, 0.015],
    "Right Arm": [0.07, 0.04, -0.02],
    "Left Arm": [-0.07, 0.04, -0.02],
  });
  const follow = override(impact, {
    root: [sign * (round ? 0.07 : 0), flying ? 0.18 : -0.04, -0.08],
    Torso: rotation(6, sign * (spin ? 185 : round ? 64 : 12), -sign * 11),
    Head: rotation(-3, -sign * (spin ? 150 : 18), sign * 5),
    [striker]: has(direction, "hook-kick") ? rotation(-44, sign * 125, sign * 24) : rotation(-58, sign * (round ? 84 : 8), sign * 12),
  }, {
    [striker]: [sign * 0.13, 0.055, -0.1],
  });
  const landing = override(base, {
    root: [sign * (flying ? 0.08 : 0), -0.09, flying ? -0.06 : 0],
    Torso: rotation(9, sign * (spin ? 15 : 4), -sign * 4),
    [striker]: rotation(18, 0, sign * 4),
  }, {
    [striker]: [sign * 0.055, 0.025, -0.025],
  });
  return [
    { n: 0, sample: base },
    { n: 0.25, sample: chamber, curve: "snap" },
    { n: 0.46, sample: pre, curve: "snap" },
    { n: 0.6, sample: impact, curve: "snap" },
    { n: 0.72, sample: follow, curve: "linear" },
    { n: 0.88, sample: landing, curve: "snap" },
    { n: 1, sample: has(direction, "imperfect") ? landing : base, curve: "smooth" },
  ];
}

function stancePoints(direction: CombatDirection): PosePoint[] {
  const base = guardPose(direction);
  const side = sideSign(direction);
  const pressure = has(direction, "pressure") || has(direction, "berserker");
  const still = has(direction, "stillness") || has(direction, "patient");
  const injured = has(direction, "injured");
  const breath = still ? 0.008 : pressure ? 0.035 : 0.022;
  const phase = (n: number): Sample => {
    const wave = Math.sin(n * Math.PI * 2);
    const sway = Math.sin(n * Math.PI * 4 + 0.4);
    return override(base, {
      root: [injured ? side * 0.045 : sway * 0.012, base.root[1] + breath * (0.5 - 0.5 * Math.cos(n * Math.PI * 2)), pressure ? -0.025 * (0.5 + 0.5 * wave) : 0],
      Torso: rotation(base.rotations.Torso[0] + (pressure ? 3 : 1.2) * wave, base.rotations.Torso[1] + side * 2 * sway, side * 1.5 * sway),
      Head: rotation(base.rotations.Head[0] - 0.8 * wave, base.rotations.Head[1] - side * (still ? 1 : 3) * sway, -side * sway),
      "Right Arm": rotation(base.rotations["Right Arm"][0] + wave * (pressure ? 3 : 1), base.rotations["Right Arm"][1], base.rotations["Right Arm"][2] - sway),
      "Left Arm": rotation(base.rotations["Left Arm"][0] - wave * (pressure ? 2 : 0.8), base.rotations["Left Arm"][1], base.rotations["Left Arm"][2] + sway),
    });
  };
  return [
    { n: 0, sample: phase(0) },
    { n: 0.25, sample: phase(0.25), curve: "smooth" },
    { n: 0.5, sample: phase(0.5), curve: "smooth" },
    { n: 0.75, sample: phase(0.75), curve: "smooth" },
    { n: 1, sample: phase(1), curve: "smooth" },
  ];
}

function blockPoints(direction: CombatDirection): PosePoint[] {
  const base = guardPose(direction);
  const sign = sideSign(direction) || 1;
  const high = has(direction, "high-block") || has(direction, "side-block");
  const bodyBlock = has(direction, "body-block");
  const cross = has(direction, "cross-block");
  const leg = has(direction, "leg-block");
  const one = has(direction, "one-arm") || has(direction, "side-block");
  const activeArm: Joint = direction.side === "left" ? "Left Arm" : "Right Arm";
  const otherArm: Joint = activeArm === "Left Arm" ? "Right Arm" : "Left Arm";
  const cover = override(base, {
    root: [0, has(direction, "collapse") ? -0.18 : -0.08, 0.025],
    Torso: rotation(high ? 12 : bodyBlock ? 20 : 9, -sign * (one ? 16 : 4), -sign * (one ? 9 : 2)),
    Head: rotation(-8, sign * 8, sign * 5),
    [activeArm]: rotation(high ? -126 : bodyBlock ? -28 : -94, sign * (cross ? 54 : 18), sign * 42),
    [otherArm]: rotation(one ? -66 : high ? -122 : -88, -sign * (cross ? 54 : 12), -sign * 38),
    "Right Leg": leg && direction.side === "right" ? rotation(-62, -12, -18) : rotation(-12, 0, -sign * 5),
    "Left Leg": leg && direction.side === "left" ? rotation(-62, 12, 18) : rotation(-12, 0, sign * 5),
  }, {
    [activeArm]: [sign * 0.11, high ? 0.12 : bodyBlock ? -0.06 : 0.06, -0.09],
    [otherArm]: [-sign * 0.085, high ? 0.105 : 0.045, -0.075],
    "Right Leg": leg && direction.side === "right" ? [0.075, 0.08, -0.05] : [0.02, 0, 0],
    "Left Leg": leg && direction.side === "left" ? [-0.075, 0.08, -0.05] : [-0.02, 0, 0],
  });
  const impact = override(cover, {
    root: [sign * -0.025, has(direction, "collapse") ? -0.25 : -0.11, 0.06],
    Torso: rotation(cover.rotations.Torso[0] + 7 * direction.force, cover.rotations.Torso[1] - sign * 7, cover.rotations.Torso[2] - sign * 5),
    Head: rotation(-12, sign * 12, sign * 8),
  });
  const settle = override(cover, {
    root: [sign * -0.012, has(direction, "collapse") ? -0.2 : -0.075, 0.03],
    Torso: rotation(cover.rotations.Torso[0] + 2, cover.rotations.Torso[1] - sign * 2, cover.rotations.Torso[2]),
  });
  return [
    { n: 0, sample: base },
    { n: 0.3, sample: cover, curve: "snap" },
    { n: 0.48, sample: impact, curve: "snap" },
    { n: 0.62, sample: settle, curve: "linear" },
    { n: has(direction, "impact-hold") ? 0.82 : 0.72, sample: settle, curve: "smooth" },
    { n: 1, sample: has(direction, "collapse") ? settle : base, curve: "smooth" },
  ];
}

function parryPoints(direction: CombatDirection): PosePoint[] {
  const base = guardPose(direction);
  const side = direction.side === "left" ? "left" : "right";
  const { striker: hand, sign } = mirrorArm(side);
  const hard = has(direction, "hard-parry");
  const down = has(direction, "down-parry");
  const scoop = has(direction, "scoop-parry");
  const cross = has(direction, "cross-parry");
  const double = has(direction, "double-parry");
  const retreat = has(direction, "retreat");
  const deflect = override(base, {
    root: [sign * -0.02, -0.04, retreat ? 0.08 : 0],
    Torso: rotation(5, sign * (hard ? 18 : cross ? 12 : 6), sign * 4),
    Head: rotation(-3, -sign * 5, -sign * 2),
    [hand]: rotation(down ? -25 : scoop ? -92 : -62, sign * (hard ? 58 : cross ? 48 : 32), sign * (hard ? 38 : 24)),
  }, {
    [hand]: [sign * (hard ? 0.14 : 0.095), down ? -0.055 : scoop ? 0.075 : 0.04, -0.09],
  });
  const overshoot = override(deflect, {
    Torso: rotation(4, sign * (hard ? 24 : 8), sign * 3),
    [hand]: rotation(down ? -12 : scoop ? -112 : -54, sign * (hard ? 72 : 40), sign * (hard ? 44 : 28)),
  }, {
    [hand]: [sign * (hard ? 0.16 : 0.11), down ? -0.07 : 0.06, -0.065],
  });
  const second = override(base, {
    root: [-sign * 0.015, -0.04, 0],
    Torso: rotation(5, -sign * 7, -sign * 3),
    [hand === "Left Arm" ? "Right Arm" : "Left Arm"]: rotation(-60, -sign * 36, -sign * 26),
  }, {
    [hand === "Left Arm" ? "Right Arm" : "Left Arm"]: [-sign * 0.1, 0.045, -0.085],
  });
  const points: PosePoint[] = [
    { n: 0, sample: base },
    { n: has(direction, "anime") ? 0.42 : 0.24, sample: base, curve: "smooth" },
    { n: 0.48, sample: deflect, curve: "snap" },
    { n: 0.58, sample: overshoot, curve: "linear" },
  ];
  if (double) {
    points.push({ n: 0.72, sample: second, curve: "snap" }, { n: 0.82, sample: second, curve: "linear" });
  }
  points.push({ n: 1, sample: has(direction, "imperfect") ? overshoot : base, curve: "smooth" });
  return points;
}

function dodgePoints(direction: CombatDirection): PosePoint[] {
  const base = guardPose(direction);
  const sign = sideSign(direction) || 1;
  const duck = has(direction, "duck");
  const weave = has(direction, "weave");
  const pull = has(direction, "pull");
  const back = has(direction, "backstep");
  const step = has(direction, "sidestep") || has(direction, "afterimage");
  const stumble = has(direction, "stumble");
  const evade = override(base, {
    root: [step || weave ? sign * mix(0.08, 0.22, direction.commitment) : 0, duck || weave ? -0.22 : 0.015, back ? 0.18 : pull ? 0.1 : 0],
    Torso: rotation(duck ? 22 : pull ? 14 : weave ? 18 : 7, sign * (step ? 16 : 9), sign * (weave ? 22 : 18)),
    Head: rotation(duck ? -12 : pull ? -18 : -5, -sign * 12, -sign * (weave ? 17 : 12)),
    "Right Arm": rotation(-62, -12, -20),
    "Left Arm": rotation(-62, 12, 20),
    "Right Leg": rotation(sign > 0 ? -24 : 18, 0, -sign * 8),
    "Left Leg": rotation(sign < 0 ? -24 : 18, 0, sign * 8),
  }, {
    "Right Arm": [0.06, 0.055, -0.045],
    "Left Arm": [-0.06, 0.055, -0.045],
    "Right Leg": [0.035, duck || weave ? 0.035 : 0, 0],
    "Left Leg": [-0.035, duck || weave ? 0.035 : 0, 0],
  });
  const low = weave ? override(evade, {
    root: [sign * 0.03, -0.27, 0.01],
    Torso: rotation(24, 0, 0),
    Head: rotation(-15, 0, 0),
  }) : evade;
  const exit = override(base, {
    root: [step ? sign * 0.15 : 0, stumble ? -0.14 : -0.03, back ? 0.12 : 0],
    Torso: rotation(stumble ? 17 : 5, -sign * 7, -sign * (stumble ? 11 : 3)),
    Head: rotation(-4, sign * 5, sign * 2),
  });
  return [
    { n: 0, sample: base },
    { n: has(direction, "anime") ? 0.38 : 0.18, sample: base, curve: "smooth" },
    { n: 0.46, sample: weave ? low : evade, curve: "snap" },
    ...(weave ? [{ n: 0.62, sample: evade, curve: "snap" as const }] : []),
    { n: 0.78, sample: exit, curve: "snap" },
    { n: 1, sample: stumble ? exit : base, curve: "smooth" },
  ];
}

function reactionPoints(direction: CombatDirection): PosePoint[] {
  const base = guardPose({ ...direction, guard: 0.25 });
  const sign = sideSign(direction) || 1;
  const bodyHit = has(direction, "body-hit");
  const lift = has(direction, "lift");
  const buckle = has(direction, "buckle");
  const spin = has(direction, "rotational-hit");
  const fall = has(direction, "knockdown");
  const resist = has(direction, "resist");
  const push = has(direction, "pushback");
  const anime = has(direction, "delayed-impact");
  const contact = override(base, {
    root: [0, -0.03, 0],
    Torso: rotation(bodyHit ? 10 : 2, -sign * 5, -sign * 3),
    Head: rotation(lift ? -6 : 3, sign * 8, sign * 5),
  });
  const recoil = override(contact, {
    root: [spin ? sign * 0.11 : 0, bodyHit ? -0.2 : lift ? 0.1 : buckle ? -0.16 : fall ? -0.18 : -0.06, (push || fall) ? 0.2 : 0.06],
    Torso: rotation(bodyHit ? 32 : lift ? -22 : fall ? -28 : 12, spin ? -sign * 92 : -sign * 24 * direction.force, -sign * (spin ? 22 : 14)),
    Head: rotation(lift ? -38 : bodyHit ? -8 : fall ? 26 : 15, spin ? sign * 65 : sign * 42 * direction.force, sign * 24),
    "Right Arm": rotation(bodyHit ? -42 : 34, -18, -28),
    "Left Arm": rotation(bodyHit ? -48 : 22, 18, 28),
    "Right Leg": rotation(buckle && direction.side === "right" ? 48 : fall ? 36 : -12, 0, -sign * 8),
    "Left Leg": rotation(buckle && direction.side === "left" ? 48 : fall ? -28 : 14, 0, sign * 8),
  }, {
    "Right Arm": [0.12, bodyHit ? -0.03 : 0.05, 0.025],
    "Left Arm": [-0.12, bodyHit ? -0.04 : 0.035, 0.035],
    "Right Leg": [buckle && direction.side === "right" ? 0.09 : 0.035, buckle ? 0.04 : 0, 0.025],
    "Left Leg": [buckle && direction.side === "left" ? -0.09 : -0.035, buckle ? 0.04 : 0, 0.025],
  });
  const catchPose = resist ? override(recoil, {
    root: [0, -0.08, 0.035],
    Torso: rotation(8, -sign * 15, -sign * 8),
  }) : fall ? override(recoil, {
    root: [sign * 0.12, -0.32, 0.32],
    Torso: rotation(-55, spin ? -sign * 126 : -sign * 38, -sign * 32),
  }) : override(base, {
    root: [sign * (spin ? 0.06 : 0.015), bodyHit ? -0.12 : -0.05, push ? 0.08 : 0],
    Torso: rotation(bodyHit ? 18 : 7, -sign * 10, -sign * 5),
    Head: rotation(lift ? -8 : 5, sign * 12, sign * 6),
  });
  return [
    { n: 0, sample: base },
    { n: anime ? 0.43 : 0.25, sample: contact, curve: anime ? "smooth" : "snap" },
    { n: anime ? 0.5 : 0.42, sample: recoil, curve: "snap" },
    { n: 0.66, sample: recoil, curve: "linear" },
    { n: 1, sample: catchPose, curve: fall ? "snap" : "smooth" },
  ];
}

function pointsFor(direction: CombatDirection): PosePoint[] {
  switch (direction.action) {
    case "stance": return stancePoints(direction);
    case "jab":
    case "cross":
    case "hook":
    case "uppercut": return handStrikePoints(direction);
    case "kick": return kickPoints(direction);
    case "block": return blockPoints(direction);
    case "parry": return parryPoints(direction);
    case "dodge": return dodgePoints(direction);
    case "hit-reaction": return reactionPoints(direction);
  }
}

function stylesFor(direction: CombatDirection): string[] {
  const styles = ["r6", "combat-melee", "dense-sampled", "human-review-required", "visual-direction", direction.action, ...direction.tags];
  if (["jab", "cross", "hook", "uppercut", "kick"].includes(direction.action)) {
    styles.push("combat-strike");
    if (direction.action === "kick") styles.push(direction.side === "left" ? "left-leg" : "right-leg");
    else styles.push(direction.side === "left" ? "left-hand" : "right-hand");
  }
  return [...new Set(styles)];
}

function draftFor(direction: CombatDirection): AnimationDraft {
  const fps = 30;
  const duration = direction.duration;
  const frameCount = Math.max(9, Math.round(duration * fps));
  const points = pointsFor(direction);
  const samples = Array.from({ length: frameCount + 1 }, (_, index) => ({
    time: index * duration / frameCount,
    sample: samplePoints(points, index / frameCount),
  }));
  const strike = ["jab", "cross", "hook", "uppercut", "kick"].includes(direction.action);
  return animationDraftSchema.parse({
    name: `Attempt_Combat_${direction.id}_${slug(direction.name)}`,
    rigId: "selection:1",
    duration,
    framesPerSecond: fps,
    looped: direction.action === "stance",
    priority: direction.action === "stance" ? "idle" : "action2",
    beats: strike
      ? [
          { id: "anticipation", label: "Readable load", startTime: 0, endTime: duration * 0.28, intention: `Prepare ${direction.name} through base and torso without an empty arm-only windup`, energy: direction.force * 0.6, leadingBodyPart: "Torso" },
          { id: "acceleration", label: "Acceleration", startTime: duration * 0.28, endTime: duration * 0.5, intention: "Concentrate spacing toward contact while the guard remains purposeful", energy: direction.force, leadingBodyPart: direction.action === "kick" ? `${direction.side} leg` : `${direction.side} arm` },
          { id: "impact", label: "Impact", startTime: duration * 0.5, endTime: duration * 0.62, intention: "Land a short explicit impact window with the real R6 striking limb", energy: direction.force, leadingBodyPart: direction.action === "kick" ? `${direction.side} leg` : `${direction.side} arm` },
          { id: "recovery", label: "Recovery", startTime: duration * 0.62, endTime: duration, intention: "Recover balance, guard and secondary parts on deliberately staggered timing", energy: direction.force * 0.5, leadingBodyPart: "Torso" },
        ]
      : [
          { id: "read", label: "Threat read", startTime: 0, endTime: duration * 0.28, intention: `Establish the cause and readiness of ${direction.name}`, energy: direction.force * 0.45, leadingBodyPart: "Head" },
          { id: "action", label: "Defensive or reactive action", startTime: duration * 0.28, endTime: duration * 0.68, intention: direction.thesis, energy: direction.force, leadingBodyPart: direction.action === "hit-reaction" ? "Torso" : "Head" },
          { id: "recovery", label: "Consequence", startTime: duration * 0.68, endTime: duration, intention: "Preserve balance cost and overlap instead of erasing the action", energy: direction.force * 0.5, leadingBodyPart: "Torso" },
        ],
    contacts: [],
    tracks: joints.map((joint) => ({
      joint,
      space: "parent",
      keys: samples.map(({ time, sample }) => ({
        time: Number(time.toFixed(6)),
        transform: {
          position: joint === "Torso"
            ? { x: sample.root[0], y: sample.root[1], z: sample.root[2] }
            : {
                x: sample.positions[joint][0],
                y: sample.positions[joint][1],
                z: sample.positions[joint][2],
              },
          rotation: quaternion(sample.rotations[joint]),
        },
        easing: { style: "linear", direction: "inOut" },
        weight: 1,
      })),
    })),
    metadata: {
      intent: `${direction.name}: ${direction.thesis}`,
      rigType: "R6",
      style: stylesFor(direction),
      version: 1,
    },
  });
}

function metric(report: QualityReport, name: string): number | undefined {
  return report.metrics.find((candidate) => candidate.name === name)?.score;
}
function rank(direction: CombatDirection): Candidate {
  const draft = draftFor(direction);
  const report = reviewDraft(draft);
  const fluidityNames = [
    "dense_temporal_sampling",
    "easing_velocity_continuity",
    "angular_velocity_spike_health",
    "overlap_timing_diversity",
  ];
  const fluidity = fluidityNames
    .map((name) => metric(report, name) ?? 0)
    .reduce((sum, value) => sum + value, 0) / fluidityNames.length;
  const commitment = metric(report, "combat_strike_commitment") ?? 1;
  const score = report.overallScore * 0.35 + fluidity * 0.4 + commitment * 0.25;
  return { direction, draft, report, score };
}

const candidates = combatDirections.map(rank);
const reviewQueue = actions.flatMap((action) => {
  const ranked = candidates
    .filter(({ direction }) => direction.action === action)
    .sort((left, right) => right.score - left.score);
  const first = ranked[0]!;
  const second = ranked.find(({ direction }) =>
    direction.side !== first.direction.side &&
    direction.tags.every((tag) => !first.direction.tags.includes(tag)),
  ) ?? ranked.find(({ direction }) =>
    direction.tags.every((tag) => !first.direction.tags.includes(tag)),
  ) ?? ranked[1]!;
  return [first, second];
});
reviewQueue.forEach((candidate, index) => {
  candidate.draft.name = `MD_REVIEW_COMBAT_R6_${String(index + 1).padStart(2, "0")}_${slug(candidate.direction.name)}`;
  candidate.draft.metadata.style.push("numeric-shortlist");
});

process.stdout.write(
  `GENERATED ${candidates.length}\n` +
  `DISTINCT_DIRECTIONS ${new Set(candidates.map(({ direction }) => direction.id)).size}\n` +
  `SHORTLISTED ${reviewQueue.length}\nAPPROVED 0\n` +
  `DISCARDED_FROM_REVIEW ${candidates.length - reviewQueue.length}\n`,
);
for (const candidate of reviewQueue) {
  process.stdout.write(
    `REVIEW ${candidate.draft.name} score=${candidate.score.toFixed(4)} action=${candidate.direction.action} thesis=${candidate.direction.name}\n`,
  );
}

const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const client = new Client({ name: "motion-director-r6-melee-directions", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/src/index.js"],
  cwd: process.cwd(),
  env: environment,
  stderr: "pipe",
});
const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
function resultText(result: unknown): string {
  const content = result && typeof result === "object" && "content" in result
    ? (result as { content?: unknown }).content : undefined;
  if (!Array.isArray(content)) return "";
  const block = content.find((item) =>
    item && typeof item === "object" && "type" in item && item.type === "text" &&
    "text" in item && typeof item.text === "string",
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
  const capabilities = await client.callTool({ name: "studio_animation_capabilities", arguments: {} });
  if (capabilities.isError) throw new Error(resultText(capabilities));

  for (const candidate of reviewQueue) {
    const validation = await client.callTool({ name: "validate_animation_draft", arguments: { draft: candidate.draft } });
    if (validation.isError) throw new Error(`${candidate.draft.name}: ${resultText(validation)}`);
    const staged = await client.callTool({
      name: "stage_animation_draft",
      arguments: { transactionName: `Melee human review - ${candidate.direction.name}`, draft: candidate.draft },
    });
    if (staged.isError) throw new Error(`${candidate.draft.name}: ${resultText(staged)}`);
    const transactionId = (JSON.parse(resultText(staged)) as { transactionId: string }).transactionId;
    const committed = await client.callTool({
      name: "commit_animation_draft",
      arguments: { transactionId, destinationName: candidate.draft.name },
    });
    if (committed.isError) throw new Error(`${candidate.draft.name}: ${resultText(committed)}`);
    process.stdout.write(`STAGED_FOR_HUMAN_REVIEW ${candidate.draft.name}\n`);
  }
  const attached = await client.callTool({
    name: "attach_committed_animations_to_selected_rig_animsaves",
    arguments: { namePrefix: "MD_REVIEW_COMBAT_R6_" },
  });
  if (attached.isError) throw new Error(resultText(attached));
  process.stdout.write(`REVIEW_QUEUE_ATTACHED\n${resultText(attached)}\n`);
} finally {
  await client.close();
}
