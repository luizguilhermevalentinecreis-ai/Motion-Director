import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { animationDraftSchema, type AnimationDraft } from "../src/domain.js";

type V3 = [number, number, number];
type Q = { x: number; y: number; z: number; w: number };
type TF = { p: V3; q: Q };
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type Phase = {
  n: number;
  name: string;
  intention: string;
  energy: number;
  leading: Joint;
  torsoPosition: V3;
  torsoEuler: V3;
  headEuler: V3;
  rightFist: V3;
  leftFist: V3;
  rightFoot: V3;
  leftFoot: V3;
  lockLimbJoints?: boolean;
  shoulderDrop?: number;
};
type Skill = {
  name: string;
  duration: number;
  intent: string;
  phases: Phase[];
  contacts: Array<Record<string, unknown>>;
};

const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (v: V3, n: number): V3 => [v[0] * n, v[1] * n, v[2] * n];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const magnitude = (v: V3) => Math.hypot(v[0], v[1], v[2]);
const unit = (v: V3): V3 => {
  const length = magnitude(v);
  assert.ok(length > 1e-6, "Cannot normalize a zero vector");
  return scale(v, 1 / length);
};
const qNormalize = (q: Q): Q => {
  const length = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
};
const qMultiply = (a: Q, b: Q): Q => qNormalize({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});
const qInverse = (q: Q): Q => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
function qEuler([xd, yd, zd]: V3): Q {
  const x = xd * Math.PI / 360, y = yd * Math.PI / 360, z = zd * Math.PI / 360;
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y);
  const cz = Math.cos(z), sz = Math.sin(z);
  return qNormalize({
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  });
}
function qRotate(q: Q, v: V3): V3 {
  const u: V3 = [q.x, q.y, q.z];
  const uv = cross(u, v);
  const uuv = cross(u, uv);
  return add(v, add(scale(uv, 2 * q.w), scale(uuv, 2)));
}
function qFromMatrix(
  r00: number, r01: number, r02: number,
  r10: number, r11: number, r12: number,
  r20: number, r21: number, r22: number,
): Q {
  const trace = r00 + r11 + r22;
  let x: number, y: number, z: number, w: number;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = 0.25 * s; x = (r21 - r12) / s; y = (r02 - r20) / s; z = (r10 - r01) / s;
  } else if (r00 > r11 && r00 > r22) {
    const s = Math.sqrt(1 + r00 - r11 - r22) * 2;
    w = (r21 - r12) / s; x = 0.25 * s; y = (r01 + r10) / s; z = (r02 + r20) / s;
  } else if (r11 > r22) {
    const s = Math.sqrt(1 + r11 - r00 - r22) * 2;
    w = (r02 - r20) / s; x = (r01 + r10) / s; y = 0.25 * s; z = (r12 + r21) / s;
  } else {
    const s = Math.sqrt(1 + r22 - r00 - r11) * 2;
    w = (r10 - r01) / s; x = (r02 + r20) / s; y = (r12 + r21) / s; z = 0.25 * s;
  }
  return qNormalize({ x, y, z, w });
}
const compose = (a: TF, b: TF): TF => ({
  p: add(a.p, qRotate(a.q, b.p)),
  q: qMultiply(a.q, b.q),
});
const inverse = (tf: TF): TF => {
  const q = qInverse(tf.q);
  return { p: qRotate(q, scale(tf.p, -1)), q };
};
const identity: TF = { p: [0, 0, 0], q: { x: 0, y: 0, z: 0, w: 1 } };
const matrixTF = (p: V3, rows: [number, number, number, number, number, number, number, number, number]): TF => ({
  p,
  q: qFromMatrix(...rows),
});

const rootBasis = matrixTF([0, 0, 0], [-1, 0, 0, 0, 0, 1, 0, 1, 0]);
const motorBasis: Record<Joint, { c0: TF; c1: TF; parent: "HumanoidRootPart" | "Torso" }> = {
  Torso: { c0: rootBasis, c1: rootBasis, parent: "HumanoidRootPart" },
  Head: {
    c0: matrixTF([0, 1, 0], [-1, 0, 0, 0, 0, 1, 0, 1, 0]),
    c1: matrixTF([0, -0.5, 0], [-1, 0, 0, 0, 0, 1, 0, 1, 0]),
    parent: "Torso",
  },
  "Right Arm": {
    c0: matrixTF([1, 0.5, 0], [0, 0, 1, 0, 1, 0, -1, 0, 0]),
    c1: matrixTF([-0.5, 0.5, 0], [0, 0, 1, 0, 1, 0, -1, 0, 0]),
    parent: "Torso",
  },
  "Left Arm": {
    c0: matrixTF([-1, 0.5, 0], [0, 0, -1, 0, 1, 0, 1, 0, 0]),
    c1: matrixTF([0.5, 0.5, 0], [0, 0, -1, 0, 1, 0, 1, 0, 0]),
    parent: "Torso",
  },
  "Right Leg": {
    c0: matrixTF([1, -1, 0], [0, 0, 1, 0, 1, 0, -1, 0, 0]),
    c1: matrixTF([0.5, 1, 0], [0, 0, 1, 0, 1, 0, -1, 0, 0]),
    parent: "Torso",
  },
  "Left Leg": {
    c0: matrixTF([-1, -1, 0], [0, 0, -1, 0, 1, 0, 1, 0, 0]),
    c1: matrixTF([-0.5, 1, 0], [0, 0, -1, 0, 1, 0, 1, 0, 0]),
    parent: "Torso",
  },
};

function qMapDirectionWithReference(
  localDirectionInput: V3,
  worldDirectionInput: V3,
  localReferenceInput: V3,
  worldReferenceInput: V3,
): Q {
  const localDirection = unit(localDirectionInput);
  let localReference = sub(
    localReferenceInput,
    scale(localDirection, dot(localReferenceInput, localDirection)),
  );
  if (magnitude(localReference) < 0.05) localReference = cross(localDirection, [1, 0, 0]);
  localReference = unit(localReference);
  const localThird = unit(cross(localDirection, localReference));

  const worldDirection = unit(worldDirectionInput);
  let worldReference = sub(
    worldReferenceInput,
    scale(worldDirection, dot(worldReferenceInput, worldDirection)),
  );
  if (magnitude(worldReference) < 0.05) worldReference = cross(worldDirection, [1, 0, 0]);
  worldReference = unit(worldReference);
  const worldThird = unit(cross(worldDirection, worldReference));

  const r00 = worldDirection[0] * localDirection[0] +
    worldReference[0] * localReference[0] + worldThird[0] * localThird[0];
  const r01 = worldDirection[0] * localDirection[1] +
    worldReference[0] * localReference[1] + worldThird[0] * localThird[1];
  const r02 = worldDirection[0] * localDirection[2] +
    worldReference[0] * localReference[2] + worldThird[0] * localThird[2];
  const r10 = worldDirection[1] * localDirection[0] +
    worldReference[1] * localReference[0] + worldThird[1] * localThird[0];
  const r11 = worldDirection[1] * localDirection[1] +
    worldReference[1] * localReference[1] + worldThird[1] * localThird[1];
  const r12 = worldDirection[1] * localDirection[2] +
    worldReference[1] * localReference[2] + worldThird[1] * localThird[2];
  const r20 = worldDirection[2] * localDirection[0] +
    worldReference[2] * localReference[0] + worldThird[2] * localThird[0];
  const r21 = worldDirection[2] * localDirection[1] +
    worldReference[2] * localReference[1] + worldThird[2] * localThird[1];
  const r22 = worldDirection[2] * localDirection[2] +
    worldReference[2] * localReference[2] + worldThird[2] * localThird[2];
  return qFromMatrix(r00, r01, r02, r10, r11, r12, r20, r21, r22);
}
function partFromEndpoint(
  parent: TF,
  jointLocal: V3,
  partJointLocal: V3,
  endpoint: V3,
  lockJoint = false,
): TF {
  const joint = compose(parent, { p: jointLocal, q: identity.q }).p;
  const direction = unit(sub(endpoint, joint));
  const localEndpoint: V3 = [0, -1, 0];
  const localJointToEndpoint = sub(localEndpoint, partJointLocal);
  const q = qMapDirectionWithReference(
    localJointToEndpoint,
    direction,
    [0, 0, 1],
    qRotate(parent.q, [0, 0, 1]),
  );
  return {
    p: lockJoint
      ? sub(joint, qRotate(q, partJointLocal))
      : sub(endpoint, qRotate(q, localEndpoint)),
    q,
  };
}
function motorTransform(parent: TF, part: TF, basis: { c0: TF; c1: TF }): TF {
  return compose(compose(compose(inverse(basis.c0), inverse(parent)), part), basis.c1);
}
function solvePhaseDetailed(phase: Phase): {
  world: Record<Joint, TF>;
  motors: Record<Joint, TF>;
} {
  const torso: TF = { p: phase.torsoPosition, q: qEuler(phase.torsoEuler) };
  const headQ = qMultiply(torso.q, qEuler(phase.headEuler));
  const neck = compose(torso, { p: [0, 1, 0], q: identity.q }).p;
  const head: TF = { p: add(neck, scale(qRotate(headQ, [0, 1, 0]), 0.5)), q: headQ };
  const world: Record<Joint, TF> = {
    Torso: torso,
    Head: head,
    "Right Arm": partFromEndpoint(torso, [1, 0.5 - (phase.shoulderDrop ?? 0), 0], [-0.5, 0.5, 0], phase.rightFist, phase.lockLimbJoints),
    "Left Arm": partFromEndpoint(torso, [-1, 0.5 - (phase.shoulderDrop ?? 0), 0], [0.5, 0.5, 0], phase.leftFist, phase.lockLimbJoints),
    "Right Leg": partFromEndpoint(torso, [1, -1, 0], [0.5, 1, 0], phase.rightFoot, phase.lockLimbJoints),
    "Left Leg": partFromEndpoint(torso, [-1, -1, 0], [-0.5, 1, 0], phase.leftFoot, phase.lockLimbJoints),
  };
  const motors = {} as Record<Joint, TF>;
  for (const joint of joints) {
    const basis = motorBasis[joint];
    const parent = basis.parent === "Torso" ? torso : identity;
    motors[joint] = motorTransform(parent, world[joint], basis);
  }
  return { world, motors };
}
function solvePhase(phase: Phase): Record<Joint, TF> {
  return solvePhaseDetailed(phase).motors;
}

const neutralSolve = solvePhase({
  n: 0,
  name: "neutral_basis_check",
  intention: "verify the standard R6 Motor6D basis",
  energy: 0,
  leading: "Torso",
  torsoPosition: [0, 0, 0],
  torsoEuler: [0, 0, 0],
  headEuler: [0, 0, 0],
  rightFist: [1.5, -1, 0],
  leftFist: [-1.5, -1, 0],
  rightFoot: [0.5, -3, 0],
  leftFoot: [-0.5, -3, 0],
});
for (const joint of joints) {
  const transform = neutralSolve[joint];
  assert.ok(
    magnitude(transform.p) < 1e-5,
    `${joint}: neutral Motor6D position basis is wrong: ${JSON.stringify(transform.p)}`,
  );
  assert.ok(Math.abs(Math.abs(transform.q.w) - 1) < 1e-5, `${joint}: neutral Motor6D rotation basis is wrong`);
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function qSlerp(a: Q, bInput: Q, t: number): Q {
  let b = bInput;
  let cosine = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  if (cosine < 0) {
    b = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
    cosine = -cosine;
  }
  if (cosine > 0.9995) {
    return qNormalize({
      x: mix(a.x, b.x, t), y: mix(a.y, b.y, t),
      z: mix(a.z, b.z, t), w: mix(a.w, b.w, t),
    });
  }
  const theta = Math.acos(clamp(cosine));
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;
  return qNormalize({
    x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb,
    z: a.z * wa + b.z * wb, w: a.w * wa + b.w * wb,
  });
}
function sample(solved: Array<{ n: number; transforms: Record<Joint, TF> }>, n: number): Record<Joint, TF> {
  let a = solved[0]!, b = solved[1]!;
  for (let i = 1; i < solved.length; i += 1) {
    b = solved[i]!;
    if (n <= b.n) {
      a = solved[i - 1]!;
      break;
    }
  }
  const t = smooth((n - a.n) / Math.max(1e-6, b.n - a.n));
  const result = {} as Record<Joint, TF>;
  for (const joint of joints) {
    const ta = a.transforms[joint], tb = b.transforms[joint];
    result[joint] = {
      p: [mix(ta.p[0], tb.p[0], t), mix(ta.p[1], tb.p[1], t), mix(ta.p[2], tb.p[2], t)],
      q: qSlerp(ta.q, tb.q, t),
    };
  }
  return result;
}

const threefoldBreak: Skill = {
  name: "MD_SOLVED_R6_01_ThreefoldBreak",
  duration: 1.80,
  intent: "A new three-hit R6 combo solved from actual fist endpoints so each rigid arm finishes hand-first instead of elbow-first",
  contacts: [
    { id: "right_brace", effector: "Right Leg", target: "ground", startTime: 0, endTime: 1.55, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.04 },
    { id: "left_brace", effector: "Left Leg", target: "ground", startTime: 0, endTime: 1.55, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.04 },
  ],
  phases: [
    { n: 0, name: "guard", intention: "compact guard with both fist endpoints visible", energy: 0.25, leading: "Torso",
      torsoPosition: [0, -0.08, 0], torsoEuler: [-4, 0, 0], headEuler: [2, 0, 0],
      rightFist: [0.95, 0.20, -1.25], leftFist: [-0.95, 0.20, -1.25], rightFoot: [0.55, -3, 0.12], leftFoot: [-0.55, -3, -0.12] },
    { n: 0.13, name: "right_load", intention: "right fist retracts while left fist owns the centerline", energy: 0.52, leading: "Torso",
      torsoPosition: [-0.08, -0.14, 0.10], torsoEuler: [-9, -27, -7], headEuler: [4, 17, 3],
      rightFist: [1.10, 0.58, 0.30], leftFist: [-0.22, 0.95, -0.72], rightFoot: [0.62, -3, 0.20], leftFoot: [-0.72, -3, -0.32] },
    { n: 0.22, name: "right_straight", intention: "right fist endpoint reaches the target before the shoulder silhouette", energy: 1, leading: "Right Arm",
      torsoPosition: [0.13, -0.06, -0.42], torsoEuler: [-6, 22, 7], headEuler: [2, -16, -4],
      rightFist: [0.20, 1.05, -3.05], leftFist: [-0.42, 0.88, -0.30], rightFoot: [0.58, -3, 0.18], leftFoot: [-0.78, -3, -0.40] },
    { n: 0.25, name: "right_hitstop", intention: "fist and torso hold a clean forward line", energy: 0.98, leading: "Right Arm",
      torsoPosition: [0.16, -0.07, -0.48], torsoEuler: [-8, 27, 9], headEuler: [3, -21, -5],
      rightFist: [0.16, 1.10, -3.22], leftFist: [-0.46, 0.86, -0.24], rightFoot: [0.58, -3, 0.18], leftFoot: [-0.80, -3, -0.42] },
    { n: 0.37, name: "left_switch", intention: "torso reverses before the left fist releases", energy: 0.66, leading: "Torso",
      torsoPosition: [0.02, -0.13, -0.12], torsoEuler: [-9, 23, 6], headEuler: [4, -11, -2],
      rightFist: [0.45, 0.88, -0.55], leftFist: [-1.08, 0.56, 0.28], rightFoot: [0.68, -3, 0.12], leftFoot: [-0.65, -3, -0.30] },
    { n: 0.46, name: "left_cross", intention: "left fist crosses through the target as the right hand recovers to guard", energy: 1, leading: "Left Arm",
      torsoPosition: [-0.15, -0.05, -0.46], torsoEuler: [-6, -25, -8], headEuler: [2, 18, 4],
      rightFist: [0.40, 0.90, -0.38], leftFist: [-0.18, 1.04, -3.12], rightFoot: [0.76, -3, -0.35], leftFoot: [-0.58, -3, 0.16] },
    { n: 0.49, name: "left_hitstop", intention: "second hand remains unmistakably at the end of the arm line", energy: 0.97, leading: "Left Arm",
      torsoPosition: [-0.18, -0.06, -0.52], torsoEuler: [-8, -31, -10], headEuler: [3, 23, 5],
      rightFist: [0.46, 0.88, -0.30], leftFist: [-0.14, 1.08, -3.28], rightFoot: [0.78, -3, -0.38], leftFoot: [-0.58, -3, 0.18] },
    { n: 0.63, name: "finisher_load", intention: "body compresses behind a final centerline strike", energy: 0.73, leading: "Torso",
      torsoPosition: [-0.06, -0.18, 0.08], torsoEuler: [-13, -34, -10], headEuler: [6, 20, 4],
      rightFist: [1.16, 0.48, 0.34], leftFist: [-0.28, 0.90, -0.64], rightFoot: [0.70, -3, 0.24], leftFoot: [-0.78, -3, -0.35] },
    { n: 0.72, name: "centerline_finisher", intention: "final fist reaches farther and slightly higher than the preceding hits", energy: 1, leading: "Right Arm",
      torsoPosition: [0.18, 0, -0.60], torsoEuler: [-10, 40, 13], headEuler: [4, -30, -8],
      rightFist: [0.02, 1.32, -3.62], leftFist: [-0.54, 0.80, -0.16], rightFoot: [0.58, -3, 0.22], leftFoot: [-0.88, -3, -0.46] },
    { n: 0.77, name: "finisher_hold", intention: "longest hit-stop preserves the hand-first silhouette", energy: 0.98, leading: "Right Arm",
      torsoPosition: [0.21, -0.02, -0.66], torsoEuler: [-12, 46, 15], headEuler: [5, -35, -9],
      rightFist: [-0.02, 1.36, -3.78], leftFist: [-0.58, 0.78, -0.10], rightFoot: [0.58, -3, 0.22], leftFoot: [-0.90, -3, -0.48] },
    { n: 0.88, name: "recoil", intention: "torso returns first while the finishing fist trails", energy: 0.52, leading: "Torso",
      torsoPosition: [0.08, -0.10, -0.28], torsoEuler: [-5, 16, 4], headEuler: [2, -8, -2],
      rightFist: [0.26, 1.02, -1.55], leftFist: [-0.48, 0.84, -0.48], rightFoot: [0.58, -3, 0.14], leftFoot: [-0.68, -3, -0.20] },
    { n: 1, name: "guard_return", intention: "recover to a readable guard rather than a dead neutral", energy: 0.25, leading: "Torso",
      torsoPosition: [0, -0.08, 0], torsoEuler: [-4, 0, 0], headEuler: [2, 0, 0],
      rightFist: [0.95, 0.20, -1.25], leftFist: [-0.95, 0.20, -1.25], rightFoot: [0.55, -3, 0.12], leftFoot: [-0.55, -3, -0.12] },
  ],
};

const skylineCrescent: Skill = {
  name: "MD_SOLVED_R6_02_SkylineCrescent",
  duration: 1.55,
  intent: "A new high R6 crescent kick solved from a chest-height foot endpoint, one planted support axis, pelvis lift and arm counterbalance",
  contacts: [
    { id: "right_pivot", effector: "Right Leg", target: "ground", startTime: 0, endTime: 1.10, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.04 },
    { id: "left_replant", effector: "Left Leg", target: "ground", startTime: 1.15, endTime: 1.40, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.05 },
  ],
  phases: [
    { n: 0, name: "kick_guard", intention: "compact guard over a stable right support", energy: 0.24, leading: "Torso",
      torsoPosition: [0.08, -0.06, 0.02], torsoEuler: [-3, -12, -5], headEuler: [2, 7, 2],
      rightFist: [1.30, -0.45, -0.32], leftFist: [-1.28, -0.50, -0.38], rightFoot: [0.62, -3, 0.08], leftFoot: [-0.72, -3, -0.22] },
    { n: 0.14, name: "pivot_set", intention: "weight moves over the right foot while the left hip becomes light", energy: 0.40, leading: "Right Leg",
      torsoPosition: [0.18, -0.13, 0.06], torsoEuler: [-7, -18, -10], headEuler: [3, 10, 4],
      rightFist: [1.35, -0.30, -0.15], leftFist: [-1.18, -0.38, -0.52], rightFoot: [0.56, -3, 0], leftFoot: [-0.82, -2.82, -0.22] },
    { n: 0.30, name: "high_chamber", intention: "left foot rises to waist height before the spin opens", energy: 0.68, leading: "Left Leg",
      torsoPosition: [0.26, -0.02, 0.02], torsoEuler: [-9, -28, -18], headEuler: [4, 16, 8],
      rightFist: [1.42, 0.28, 0.05], leftFist: [-1.12, -0.10, -0.48], rightFoot: [0.56, -3, 0], leftFoot: [-0.90, -0.05, -0.68] },
    { n: 0.43, name: "pelvis_release", intention: "pelvis rises and turns before the foot crosses the target line", energy: 0.84, leading: "Torso",
      torsoPosition: [0.34, 0.14, -0.14], torsoEuler: [-11, -38, -25], headEuler: [5, 21, 12],
      rightFist: [1.52, 0.46, 0.25], leftFist: [-1.00, -0.02, -0.28], rightFoot: [0.55, -3, 0], leftFoot: [-1.08, 0.62, -1.25] },
    { n: 0.52, name: "skyline_impact", intention: "left foot reaches chest height and finishes well beyond the torso", energy: 1, leading: "Left Leg",
      torsoPosition: [0.42, 0.20, -0.30], torsoEuler: [-14, -32, -32], headEuler: [7, 17, 15],
      rightFist: [1.66, 0.54, 0.40], leftFist: [-1.02, -0.08, -0.18], rightFoot: [0.55, -3, 0], leftFoot: [-1.30, 1.18, -2.02] },
    { n: 0.57, name: "skyline_hitstop", intention: "foot, head and arms hold the widest readable silhouette", energy: 0.98, leading: "Left Leg",
      torsoPosition: [0.46, 0.23, -0.35], torsoEuler: [-17, -38, -36], headEuler: [8, 21, 17],
      rightFist: [1.78, 0.58, 0.48], leftFist: [-1.10, -0.12, -0.14], rightFoot: [0.55, -3, 0], leftFoot: [-1.40, 1.26, -2.18] },
    { n: 0.69, name: "crescent_followthrough", intention: "raised leg continues around the body instead of dropping immediately", energy: 0.73, leading: "Torso",
      torsoPosition: [0.34, 0.08, -0.20], torsoEuler: [-10, -52, -26], headEuler: [5, 28, 12],
      rightFist: [1.46, 0.42, 0.30], leftFist: [-0.92, -0.02, -0.34], rightFoot: [0.55, -3, 0], leftFoot: [-1.62, 0.62, -0.72] },
    { n: 0.80, name: "leg_recovery", intention: "left foot folds back under the pelvis before replanting", energy: 0.54, leading: "Left Leg",
      torsoPosition: [0.22, -0.02, -0.10], torsoEuler: [-8, -28, -16], headEuler: [3, 15, 7],
      rightFist: [1.38, 0.12, -0.08], leftFist: [-1.08, -0.22, -0.42], rightFoot: [0.55, -3, 0], leftFoot: [-0.92, -0.38, -0.52] },
    { n: 0.90, name: "replant", intention: "left foot returns before shoulders fully square", energy: 0.40, leading: "Left Leg",
      torsoPosition: [0.12, -0.13, -0.03], torsoEuler: [-7, -14, -8], headEuler: [3, 8, 3],
      rightFist: [1.32, -0.22, -0.28], leftFist: [-1.18, -0.34, -0.48], rightFoot: [0.55, -3, 0], leftFoot: [-0.72, -3, -0.26] },
    { n: 1, name: "kick_guard_return", intention: "settle in guard with residual readiness", energy: 0.24, leading: "Torso",
      torsoPosition: [0.08, -0.06, 0.02], torsoEuler: [-3, -12, -5], headEuler: [2, 7, 2],
      rightFist: [1.30, -0.45, -0.32], leftFist: [-1.28, -0.50, -0.38], rightFoot: [0.62, -3, 0.08], leftFoot: [-0.72, -3, -0.22] },
  ],
};

const thunderCross: Skill = {
  name: "MD_TIER_R6_01_ThunderCross",
  duration: 1.15,
  intent: "A focused right cross study using KJ-scale hand reach, real straight-punch sequencing, asymmetric professional timing and an explicit anti-180 arm orientation lock",
  contacts: [
    { id: "lead_foot_base", effector: "Left Leg", target: "ground", startTime: 0, endTime: 0.92, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.025 },
    { id: "rear_foot_drive", effector: "Right Leg", target: "ground", startTime: 0, endTime: 0.63, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.035 },
  ],
  phases: [
    {
      n: 0, name: "cross_guard", intention: "forty-five-degree stance with hands ahead of the face and no backward elbow silhouette",
      energy: 0.24, leading: "Torso",
      torsoPosition: [0, -0.08, 0.03], torsoEuler: [-4, -11, -3], headEuler: [3, 6, 1],
      rightFist: [0.88, 0.38, -0.92], leftFist: [-0.58, 0.64, -0.98],
      rightFoot: [0.68, -3, 0.34], leftFoot: [-0.68, -3, -0.36],
    },
    {
      n: 0.18, name: "weight_settle", intention: "knees and hips settle while the target remains framed between the hands",
      energy: 0.34, leading: "Right Leg",
      torsoPosition: [-0.04, -0.15, 0.07], torsoEuler: [-7, -15, -5], headEuler: [4, 8, 2],
      rightFist: [0.94, 0.34, -0.76], leftFist: [-0.52, 0.66, -1.02],
      rightFoot: [0.70, -3, 0.38], leftFoot: [-0.70, -3, -0.38],
    },
    {
      n: 0.34, name: "rear_hip_load", intention: "rear hip winds up without pulling the rigid arm behind the torso",
      energy: 0.55, leading: "Torso",
      torsoPosition: [-0.09, -0.14, 0.10], torsoEuler: [-9, -28, -7], headEuler: [5, 15, 3],
      rightFist: [1.02, 0.30, -0.28], leftFist: [-0.42, 0.70, -1.05],
      rightFoot: [0.74, -3, 0.42], leftFoot: [-0.72, -3, -0.40],
    },
    {
      n: 0.405, name: "ground_drive", intention: "rear foot and hip begin unwinding while the right fist visibly lags",
      energy: 0.76, leading: "Right Leg",
      torsoPosition: [-0.02, -0.10, -0.08], torsoEuler: [-8, -5, -2], headEuler: [4, 6, 1],
      rightFist: [0.86, 0.42, -0.72], leftFist: [-0.40, 0.70, -1.02],
      rightFoot: [0.80, -3, 0.24], leftFoot: [-0.72, -3, -0.41],
    },
    {
      n: 0.455, name: "shoulder_release", intention: "chest passes the hips and the fist accelerates down one straight lane",
      energy: 0.91, leading: "Torso",
      torsoPosition: [0.08, -0.06, -0.30], torsoEuler: [-6, 15, 4], headEuler: [3, -10, -2],
      rightFist: [0.42, 0.76, -2.05], leftFist: [-0.43, 0.68, -0.78],
      rightFoot: [0.82, -3, 0.16], leftFoot: [-0.73, -3, -0.42],
    },
    {
      n: 0.49, name: "thunder_impact", intention: "hand endpoint lands first with shoulder, lead knee and lead foot sharing a clear plane",
      energy: 1, leading: "Right Arm",
      torsoPosition: [0.15, -0.04, -0.45], torsoEuler: [-5, 25, 7], headEuler: [3, -17, -4],
      rightFist: [0.10, 1.02, -3.30], leftFist: [-0.45, 0.66, -0.58],
      rightFoot: [0.82, -3, 0.12], leftFoot: [-0.74, -3, -0.43],
    },
    {
      n: 0.525, name: "impact_hold", intention: "two-frame hold keeps the straight hand-first silhouette readable",
      energy: 0.98, leading: "Right Arm",
      torsoPosition: [0.17, -0.05, -0.49], torsoEuler: [-6, 29, 8], headEuler: [4, -20, -5],
      rightFist: [0.06, 1.06, -3.42], leftFist: [-0.47, 0.64, -0.53],
      rightFoot: [0.82, -3, 0.12], leftFoot: [-0.74, -3, -0.43],
    },
    {
      n: 0.64, name: "hand_recoil", intention: "fist retracts on the same lane before the torso fully unwinds",
      energy: 0.58, leading: "Right Arm",
      torsoPosition: [0.10, -0.09, -0.28], torsoEuler: [-5, 17, 4], headEuler: [3, -10, -2],
      rightFist: [0.46, 0.76, -1.52], leftFist: [-0.50, 0.65, -0.75],
      rightFoot: [0.77, -3, 0.20], leftFoot: [-0.72, -3, -0.40],
    },
    {
      n: 0.79, name: "hip_recovery", intention: "hips square after the hand is already safe",
      energy: 0.38, leading: "Torso",
      torsoPosition: [0.02, -0.12, -0.06], torsoEuler: [-6, 2, 0], headEuler: [3, 0, 0],
      rightFist: [0.78, 0.46, -0.98], leftFist: [-0.58, 0.64, -0.96],
      rightFoot: [0.72, -3, 0.30], leftFoot: [-0.70, -3, -0.38],
    },
    {
      n: 1, name: "cross_guard_return", intention: "settle into the same forward guard without a dead neutral pose",
      energy: 0.24, leading: "Torso",
      torsoPosition: [0, -0.08, 0.03], torsoEuler: [-4, -11, -3], headEuler: [3, 6, 1],
      rightFist: [0.88, 0.38, -0.92], leftFist: [-0.58, 0.64, -0.98],
      rightFoot: [0.68, -3, 0.34], leftFoot: [-0.68, -3, -0.36],
    },
  ],
};

const vectorCollapsePart01: Skill = {
  name: "MD_KJV2_R6_P01_ReadFeintCompression",
  duration: 0.90,
  intent: "Vector Collapse part 1 rebuild: KJ-density layered posing with both hands visibly forward, a shoulder-led false entry, a braking overshoot and a staged full-body dash compression",
  contacts: [
    { id: "left_forefoot_anchor", effector: "Left Leg", target: "ground", startTime: 0, endTime: 0.90, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.025 },
    { id: "right_drive_anchor", effector: "Right Leg", target: "ground", startTime: 0, endTime: 0.90, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.035 },
  ],
  phases: [
    {
      n: 0,
      name: "signature_ready",
      intention: "an asymmetric KJ-scale silhouette: lead hand owns the center lane, reserve hand floats outside it and both hands sit unmistakably in front",
      energy: 0.20,
      leading: "Head",
      torsoPosition: [0.00, -0.08, -0.04],
      torsoEuler: [-4, -13, -2],
      headEuler: [2, 10, 1],
      rightFist: [0.68, 0.06, -1.42],
      leftFist: [-1.22, -0.34, -1.02],
      rightFoot: [0.74, -3, 0.34],
      leftFoot: [-0.68, -3, -0.38],
    },
    {
      n: 0.08,
      name: "eye_lock",
      intention: "only the head sharpens toward the target; the torso deliberately lags to create thought before motion",
      energy: 0.24,
      leading: "Head",
      torsoPosition: [0.00, -0.08, -0.04],
      torsoEuler: [-4, -13, -2],
      headEuler: [0, 18, 2],
      rightFist: [0.68, 0.06, -1.42],
      leftFist: [-1.22, -0.34, -1.02],
      rightFoot: [0.74, -3, 0.34],
      leftFoot: [-0.68, -3, -0.38],
    },
    {
      n: 0.17,
      name: "rear_weight_answer",
      intention: "weight settles into the rear foot after the gaze, while the forward hands preserve the target frame",
      energy: 0.29,
      leading: "Right Leg",
      torsoPosition: [-0.05, -0.14, -0.01],
      torsoEuler: [-7, -16, -4],
      headEuler: [2, 16, 2],
      rightFist: [0.72, 0.11, -1.38],
      leftFist: [-1.17, -0.25, -1.08],
      rightFoot: [0.77, -3, 0.38],
      leftFoot: [-0.69, -3, -0.39],
    },
    {
      n: 0.25,
      name: "lead_shoulder_float",
      intention: "the left shoulder rises before the hand moves, planting the first false cue without committing the hips",
      energy: 0.35,
      leading: "Left Arm",
      torsoPosition: [-0.07, -0.13, -0.05],
      torsoEuler: [-7, -20, -6],
      headEuler: [2, 17, 3],
      rightFist: [0.76, 0.16, -1.33],
      leftFist: [-1.05, 0.04, -1.22],
      rightFoot: [0.78, -3, 0.39],
      leftFoot: [-0.70, -3, -0.40],
    },
    {
      n: 0.32,
      name: "elbow_arc",
      intention: "the lead elbow opens diagonally and the wrist follows one beat later, defining an authored curved path",
      energy: 0.43,
      leading: "Left Arm",
      torsoPosition: [-0.09, -0.12, -0.10],
      torsoEuler: [-7, -23, -7],
      headEuler: [2, 16, 3],
      rightFist: [0.80, 0.19, -1.29],
      leftFist: [-0.82, 0.35, -1.50],
      rightFoot: [0.79, -3, 0.40],
      leftFoot: [-0.70, -3, -0.40],
    },
    {
      n: 0.38,
      name: "false_entry",
      intention: "the lead hand flashes forward and upward while the rear hand remains visibly in front as a counter-threat",
      energy: 0.58,
      leading: "Left Arm",
      torsoPosition: [-0.08, -0.11, -0.17],
      torsoEuler: [-8, -25, -8],
      headEuler: [3, 16, 3],
      rightFist: [0.78, 0.24, -1.36],
      leftFist: [-0.36, 0.74, -2.02],
      rightFoot: [0.79, -3, 0.39],
      leftFoot: [-0.71, -3, -0.41],
    },
    {
      n: 0.42,
      name: "feint_overshoot",
      intention: "a two-frame overshoot gives the false attack a sharp anime accent without turning it into a full strike",
      energy: 0.64,
      leading: "Left Arm",
      torsoPosition: [-0.07, -0.11, -0.20],
      torsoEuler: [-8, -27, -9],
      headEuler: [3, 17, 3],
      rightFist: [0.77, 0.25, -1.39],
      leftFist: [-0.28, 0.82, -2.16],
      rightFoot: [0.79, -3, 0.39],
      leftFoot: [-0.71, -3, -0.41],
    },
    {
      n: 0.48,
      name: "hand_brakes",
      intention: "the feinting hand starts retracting on its own lane while the shoulder remains extended for overlap",
      energy: 0.51,
      leading: "Left Arm",
      torsoPosition: [-0.06, -0.14, -0.16],
      torsoEuler: [-9, -23, -8],
      headEuler: [4, 13, 2],
      rightFist: [0.80, 0.27, -1.40],
      leftFist: [-0.46, 0.67, -1.72],
      rightFoot: [0.80, -3, 0.39],
      leftFoot: [-0.71, -3, -0.41],
    },
    {
      n: 0.55,
      name: "head_vanishes",
      intention: "the head drops out of the opponent's line before the hips descend, creating a predatory change of level",
      energy: 0.55,
      leading: "Head",
      torsoPosition: [-0.03, -0.19, -0.13],
      torsoEuler: [-12, -15, -5],
      headEuler: [8, 5, 0],
      rightFist: [0.87, 0.24, -1.37],
      leftFist: [-0.61, 0.53, -1.48],
      rightFoot: [0.80, -3, 0.38],
      leftFoot: [-0.72, -3, -0.42],
    },
    {
      n: 0.63,
      name: "hip_drop",
      intention: "the pelvis now follows the head downward; knees oppose each other so the compression has weight rather than a uniform squat",
      energy: 0.63,
      leading: "Torso",
      torsoPosition: [0.03, -0.31, -0.13],
      torsoEuler: [-16, -5, -1],
      headEuler: [10, -1, -1],
      rightFist: [0.98, 0.23, -1.32],
      leftFist: [-0.80, 0.43, -1.28],
      rightFoot: [0.82, -3, 0.39],
      leftFoot: [-0.74, -3, -0.44],
    },
    {
      n: 0.71,
      name: "elbow_gate",
      intention: "both elbows open laterally while hands stay forward, widening the silhouette without sending either arm behind the spine",
      energy: 0.70,
      leading: "Torso",
      torsoPosition: [0.08, -0.39, -0.16],
      torsoEuler: [-19, 4, 3],
      headEuler: [11, -7, -3],
      rightFist: [1.17, 0.27, -1.20],
      leftFist: [-1.04, 0.38, -1.20],
      rightFoot: [0.83, -3, 0.41],
      leftFoot: [-0.76, -3, -0.46],
    },
    {
      n: 0.80,
      name: "pelvis_twist_load",
      intention: "the pelvis twists into the rear leg after the chest is already low, storing diagonal energy in a second readable stage",
      energy: 0.76,
      leading: "Right Leg",
      torsoPosition: [0.13, -0.44, -0.20],
      torsoEuler: [-21, 13, 7],
      headEuler: [10, -12, -4],
      rightFist: [1.24, 0.30, -1.55],
      leftFist: [-1.10, 0.40, -1.18],
      rightFoot: [0.85, -3, 0.44],
      leftFoot: [-0.78, -3, -0.48],
    },
    {
      n: 0.90,
      name: "shoulder_countertwist",
      intention: "shoulders counter the loaded pelvis and hands separate vertically, sharpening the diagonal line of action before release",
      energy: 0.80,
      leading: "Torso",
      torsoPosition: [0.16, -0.46, -0.24],
      torsoEuler: [-22, 18, 9],
      headEuler: [10, -15, -5],
      rightFist: [1.28, 0.38, -1.62],
      leftFist: [-1.08, 0.24, -1.27],
      rightFoot: [0.86, -3, 0.45],
      leftFoot: [-0.79, -3, -0.49],
    },
    {
      n: 1,
      name: "dash_coil",
      intention: "poster-readable launch coil with a forward hand frame, rear-leg pressure and an asymmetrical diagonal silhouette ready to connect to part 2",
      energy: 0.84,
      leading: "Right Leg",
      torsoPosition: [0.18, -0.47, -0.27],
      torsoEuler: [-23, 21, 10],
      headEuler: [9, -17, -6],
      rightFist: [1.31, 0.44, -1.72],
      leftFist: [-1.02, 0.20, -1.38],
      rightFoot: [0.87, -3, 0.46],
      leftFoot: [-0.80, -3, -0.50],
    },
  ],
};

const sovereignWalkPart01: Skill = {
  name: "MD_CUTSCENE_R6_P01_SovereignWalk",
  duration: 2.80,
  intent: "Cutscene part 1: three deliberate supervillain steps with heel-led contacts, delayed torso weight, restrained arm drag and a dominant stop that prepares a Sukuna-inspired laugh performance",
  contacts: [
    { id: "left_opening_support", effector: "Left Leg", target: "ground", startTime: 0, endTime: 0.92, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.05 },
    { id: "right_middle_support", effector: "Right Leg", target: "ground", startTime: 0.86, endTime: 2.02, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.05 },
    { id: "left_second_support", effector: "Left Leg", target: "ground", startTime: 1.84, endTime: 2.80, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.05 },
  ],
  phases: [
    {
      n: 0,
      name: "ominous_contact",
      intention: "the villain enters already mid-stride, chin lowered and shoulders broad; the forward left heel claims the floor before the torso arrives",
      energy: 0.34, leading: "Left Leg",
      torsoPosition: [-0.07, -0.08, -0.03], torsoEuler: [-3, -7, -3], headEuler: [5, 5, 1],
      rightFist: [1.22, -0.66, -1.20], leftFist: [-1.30, -0.72, -0.38],
      rightFoot: [0.58, -3, 0.70], leftFoot: [-0.62, -3, -0.86],
    },
    {
      n: 0.055,
      name: "left_heel_claim",
      intention: "the body drops after the heel contact, creating a delayed mass response instead of a synchronized bounce",
      energy: 0.47, leading: "Torso",
      torsoPosition: [-0.13, -0.20, -0.08], torsoEuler: [-5, -10, -5], headEuler: [7, 7, 2],
      rightFist: [1.18, -0.61, -1.10], leftFist: [-1.34, -0.68, -0.34],
      rightFoot: [0.59, -3, 0.67], leftFoot: [-0.63, -3, -0.86],
    },
    {
      n: 0.12,
      name: "rear_toe_release",
      intention: "the right heel peels up only after weight is visibly over the planted left leg; arms remain heavy and late",
      energy: 0.42, leading: "Right Leg",
      torsoPosition: [-0.14, -0.15, -0.09], torsoEuler: [-4, -9, -4], headEuler: [6, 6, 2],
      rightFist: [1.17, -0.58, -0.98], leftFist: [-1.34, -0.66, -0.42],
      rightFoot: [0.59, -2.84, 0.58], leftFoot: [-0.63, -3, -0.55],
    },
    {
      n: 0.20,
      name: "right_leg_pass",
      intention: "the right foot passes low under the hips while the chest rises minimally, preserving a massive grounded scale",
      energy: 0.39, leading: "Right Leg",
      torsoPosition: [-0.06, -0.09, -0.07], torsoEuler: [-3, -2, -1], headEuler: [5, 2, 0],
      rightFist: [1.25, -0.61, -0.68], leftFist: [-1.28, -0.62, -0.72],
      rightFoot: [0.61, -2.55, -0.04], leftFoot: [-0.62, -3, 0.05],
    },
    {
      n: 0.285,
      name: "right_heel_reach",
      intention: "the right leg reaches from the hip and the opposite hand drifts forward on a later, wider arc",
      energy: 0.45, leading: "Right Leg",
      torsoPosition: [0.05, -0.06, -0.06], torsoEuler: [-3, 7, 3], headEuler: [5, -5, -1],
      rightFist: [1.30, -0.70, -0.38], leftFist: [-1.22, -0.57, -1.12],
      rightFoot: [0.64, -2.88, -0.92], leftFoot: [-0.60, -3, 0.66],
    },
    {
      n: 0.33,
      name: "right_impact",
      intention: "right heel plants, pelvis shifts over it and the torso compresses two frames after the foot for a heavy impact",
      energy: 0.58, leading: "Torso",
      torsoPosition: [0.14, -0.21, -0.11], torsoEuler: [-6, 11, 5], headEuler: [8, -7, -2],
      rightFist: [1.34, -0.66, -0.34], leftFist: [-1.17, -0.53, -1.17],
      rightFoot: [0.65, -3, -0.94], leftFoot: [-0.60, -3, 0.70],
    },
    {
      n: 0.40,
      name: "right_weight_settle",
      intention: "mass finishes crossing the right foot while the head absorbs less vertical motion than the torso",
      energy: 0.46, leading: "Right Leg",
      torsoPosition: [0.15, -0.14, -0.10], torsoEuler: [-4, 9, 4], headEuler: [5, -6, -2],
      rightFist: [1.33, -0.62, -0.42], leftFist: [-1.18, -0.55, -1.08],
      rightFoot: [0.65, -3, -0.62], leftFoot: [-0.59, -2.88, 0.62],
    },
    {
      n: 0.47,
      name: "left_toe_release",
      intention: "the left foot releases reluctantly as if the floor resists the character's weight",
      energy: 0.43, leading: "Left Leg",
      torsoPosition: [0.13, -0.13, -0.09], torsoEuler: [-4, 7, 3], headEuler: [5, -5, -1],
      rightFist: [1.30, -0.58, -0.54], leftFist: [-1.20, -0.58, -0.96],
      rightFoot: [0.65, -3, -0.36], leftFoot: [-0.59, -2.82, 0.54],
    },
    {
      n: 0.55,
      name: "left_leg_pass",
      intention: "the left foot passes low; hips lead the shoulders and the hands cross their neutral arcs on separate frames",
      energy: 0.40, leading: "Left Leg",
      torsoPosition: [0.04, -0.08, -0.07], torsoEuler: [-3, 0, 0], headEuler: [4, 1, 0],
      rightFist: [1.26, -0.60, -0.78], leftFist: [-1.26, -0.61, -0.70],
      rightFoot: [0.63, -3, 0.10], leftFoot: [-0.61, -2.55, -0.05],
    },
    {
      n: 0.635,
      name: "left_heel_reach",
      intention: "the left heel reaches decisively while the right arm arrives forward after the leg, creating controlled overlap",
      energy: 0.47, leading: "Left Leg",
      torsoPosition: [-0.06, -0.06, -0.06], torsoEuler: [-3, -7, -3], headEuler: [5, 5, 1],
      rightFist: [1.19, -0.56, -1.16], leftFist: [-1.32, -0.70, -0.38],
      rightFoot: [0.60, -3, 0.68], leftFoot: [-0.64, -2.88, -0.93],
    },
    {
      n: 0.68,
      name: "left_impact",
      intention: "left heel impact lands first, followed by a deeper hip drop and a subtle shoulder recoil",
      energy: 0.60, leading: "Torso",
      torsoPosition: [-0.15, -0.22, -0.12], torsoEuler: [-6, -12, -5], headEuler: [8, 8, 2],
      rightFist: [1.15, -0.52, -1.20], leftFist: [-1.35, -0.67, -0.33],
      rightFoot: [0.60, -3, 0.71], leftFoot: [-0.65, -3, -0.95],
    },
    {
      n: 0.755,
      name: "final_weight_gather",
      intention: "instead of repeating another full cycle, the body gathers into a shorter final step that begins the cutscene stop",
      energy: 0.49, leading: "Left Leg",
      torsoPosition: [-0.13, -0.14, -0.11], torsoEuler: [-4, -9, -4], headEuler: [6, 6, 2],
      rightFist: [1.17, -0.54, -1.08], leftFist: [-1.33, -0.63, -0.42],
      rightFoot: [0.59, -2.86, 0.61], leftFoot: [-0.65, -3, -0.64],
    },
    {
      n: 0.83,
      name: "final_right_pass",
      intention: "the last right step passes closer to the centerline, signaling that forward travel is ending",
      energy: 0.45, leading: "Right Leg",
      torsoPosition: [-0.04, -0.10, -0.09], torsoEuler: [-4, -2, -1], headEuler: [5, 2, 0],
      rightFist: [1.22, -0.57, -0.76], leftFist: [-1.28, -0.59, -0.70],
      rightFoot: [0.61, -2.58, -0.02], leftFoot: [-0.63, -3, 0.04],
    },
    {
      n: 0.895,
      name: "final_right_reach",
      intention: "right heel reaches a shorter distance and both arms begin losing their swing before the foot lands",
      energy: 0.50, leading: "Right Leg",
      torsoPosition: [0.05, -0.08, -0.10], torsoEuler: [-4, 5, 2], headEuler: [5, -3, -1],
      rightFist: [1.27, -0.62, -0.57], leftFist: [-1.23, -0.56, -0.90],
      rightFoot: [0.65, -2.88, -0.68], leftFoot: [-0.61, -3, 0.52],
    },
    {
      n: 0.93,
      name: "sovereign_stomp",
      intention: "the shortened right step plants like a verdict; torso and arms continue downward after contact to sell enormous mass",
      energy: 0.68, leading: "Torso",
      torsoPosition: [0.11, -0.24, -0.15], torsoEuler: [-7, 8, 4], headEuler: [9, -5, -2],
      rightFist: [1.30, -0.58, -0.52], leftFist: [-1.20, -0.54, -0.94],
      rightFoot: [0.66, -3, -0.70], leftFoot: [-0.62, -3, 0.50],
    },
    {
      n: 0.965,
      name: "shoulder_aftershock",
      intention: "feet are already still while shoulders and hands finish their downward aftershock on delayed frames",
      energy: 0.50, leading: "Torso",
      torsoPosition: [0.09, -0.17, -0.14], torsoEuler: [-5, 5, 2], headEuler: [7, -2, -1],
      rightFist: [1.28, -0.72, -0.60], leftFist: [-1.22, -0.68, -0.86],
      rightFoot: [0.66, -3, -0.70], leftFoot: [-0.62, -3, 0.50],
    },
    {
      n: 1,
      name: "silent_dominance",
      intention: "the body rises only slightly into a broad, quiet stop; chin remains lowered so the next part can reveal the grin and begin the laugh",
      energy: 0.38, leading: "Head",
      torsoPosition: [0.07, -0.12, -0.13], torsoEuler: [-4, 2, 1], headEuler: [5, 0, 0],
      rightFist: [1.25, -0.68, -0.70], leftFist: [-1.25, -0.68, -0.72],
      rightFoot: [0.66, -3, -0.70], leftFoot: [-0.62, -3, 0.50],
    },
  ],
};

// Keep the rigid R6 arms close to vertical during the walk. The authored hand
// paths were intentionally lowered after human review because higher endpoints
// tilt the 2-stud blocks and make their upper corners rise above the torso.
for (const phase of sovereignWalkPart01.phases) {
  phase.lockLimbJoints = true;
  phase.shoulderDrop = 0.18;
  phase.rightFist = [
    phase.rightFist[0],
    phase.rightFist[1] - 0.70,
    phase.rightFist[2],
  ];
  phase.leftFist = [
    phase.leftFist[0],
    phase.leftFist[1] - 0.70,
    phase.leftFist[2],
  ];
}

function transformPoint(transform: TF, point: V3): V3 {
  return add(transform.p, qRotate(transform.q, point));
}

function armBehindTorsoRatio(torso: TF, arm: TF): number {
  const torsoInverse = inverse(torso);
  let behind = 0;
  let samples = 0;
  for (const x of [-0.5, -0.25, 0, 0.25, 0.5]) {
    for (const y of [-1, -0.5, 0, 0.5, 1]) {
      for (const z of [-0.5, -0.25, 0, 0.25, 0.5]) {
        const worldPoint = transformPoint(arm, [x, y, z]);
        const torsoPoint = transformPoint(torsoInverse, worldPoint);
        if (torsoPoint[2] > 0.5) behind += 1;
        samples += 1;
      }
    }
  }
  return behind / samples;
}

function buildDraft(skill: Skill): AnimationDraft {
  assert.equal(skill.phases[0]?.n, 0);
  assert.equal(skill.phases.at(-1)?.n, 1);
  for (const phase of skill.phases) {
    const { world } = solvePhaseDetailed(phase);
    for (const joint of ["Right Arm", "Left Arm"] as const) {
      const behindRatio = armBehindTorsoRatio(world.Torso, world[joint]);
      const limit = phase.name.includes("compression") || phase.name.includes("coil") ? 0.45 : 0.35;
      const torsoInverse = inverse(world.Torso);
      const armCenter = transformPoint(torsoInverse, world[joint].p);
      const handPoint = transformPoint(
        torsoInverse,
        transformPoint(world[joint], [0, -1, 0]),
      );
      assert.ok(
        behindRatio <= limit,
        `${skill.name}/${phase.name}/${joint}: ${(behindRatio * 100).toFixed(1)}% of arm volume is behind torso (limit ${(limit * 100).toFixed(0)}%)`,
      );
      if (skill.name.includes("ReadFeintCompression")) {
        assert.ok(
          armCenter[2] < 0.12,
          `${skill.name}/${phase.name}/${joint}: arm center Z=${armCenter[2].toFixed(2)} is lateral/rear instead of forward`,
        );
        assert.ok(
          handPoint[2] < -0.55,
          `${skill.name}/${phase.name}/${joint}: hand Z=${handPoint[2].toFixed(2)} is not clearly in front of torso`,
        );
      } else {
        assert.ok(
          handPoint[2] < 0.20,
          `${skill.name}/${phase.name}/${joint}: relaxed hand Z=${handPoint[2].toFixed(2)} crossed behind the back plane`,
        );
      }
    }
  }
  const solved = skill.phases.map((phase) => ({ n: phase.n, transforms: solvePhase(phase) }));
  for (let i = 1; i < solved.length; i += 1) assert.ok(solved[i]!.n > solved[i - 1]!.n);
  for (const joint of ["Right Arm", "Left Arm"] as const) {
    for (let i = 1; i < solved.length; i += 1) {
      const a = solved[i - 1]!.transforms[joint].q;
      const b = solved[i]!.transforms[joint].q;
      const cosine = Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w));
      const delta = 2 * Math.acos(cosine) * 180 / Math.PI;
      assert.ok(
        delta < 135,
        `${skill.name}/${joint}/${skill.phases[i - 1]!.name}->${skill.phases[i]!.name}: ${delta.toFixed(1)} degree transition risks an axial flip`,
      );
    }
  }
  const fps = 60;
  const frameCount = Math.round(skill.duration * fps);
  return animationDraftSchema.parse({
    name: skill.name,
    rigId: "selection:1",
    duration: skill.duration,
    framesPerSecond: fps,
    looped: false,
    priority: "action",
    beats: skill.phases.slice(0, -1).map((phase, index) => ({
      id: phase.name,
      label: phase.name,
      startTime: phase.n * skill.duration,
      endTime: skill.phases[index + 1]!.n * skill.duration,
      intention: phase.intention,
      energy: phase.energy,
      leadingBodyPart: phase.leading,
    })),
    contacts: skill.contacts,
    tracks: joints.map((joint) => ({
      joint,
      space: "motor",
      keys: Array.from({ length: frameCount + 1 }, (_, index) => {
        const n = index / frameCount;
        const transform = sample(solved, n)[joint];
        return {
          time: Number((n * skill.duration).toFixed(6)),
          transform: {
            position: { x: transform.p[0], y: transform.p[1], z: transform.p[2] },
            rotation: transform.q,
          },
          easing: { style: "linear", direction: "in" },
          weight: 1,
        };
      }),
    })),
    metadata: {
      intent: skill.intent,
      rigType: "R6",
      style: [
        "r6", "anime-skill", "world-space-joint-solved", "endpoint-authored",
        "hand-first-strike", "support-axis", "impact-hold", "human-review-required",
        "r6-combat-displacement", "r6-anime-extreme-displacement",
      ],
      version: 1,
    },
  });
}

const drafts = [buildDraft(sovereignWalkPart01)];
const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const client = new Client({ name: "motion-director-world-solved-r6-combat", version: "0.2.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/src/index.js"],
  cwd: process.cwd(),
  env: environment,
  stderr: "pipe",
});
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function text(result: unknown): string {
  const content = result && typeof result === "object" && "content" in result
    ? (result as { content?: unknown }).content : undefined;
  const block = Array.isArray(content)
    ? content.find((item): item is { type: "text"; text: string } =>
        Boolean(item && typeof item === "object" && "type" in item &&
          item.type === "text" && "text" in item && typeof item.text === "string"))
    : undefined;
  return block?.text ?? "";
}
async function call(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(text(result));
  return JSON.parse(text(result)) as unknown;
}

try {
  await client.connect(transport);
  let connected = false;
  for (let i = 0; i < 120; i += 1) {
    const status = await call("studio_status", {}) as { connected: boolean };
    if (status.connected) {
      connected = true;
      break;
    }
    await sleep(500);
  }
  assert.ok(connected, "Motion Director did not connect to Studio");
  const results = [];
  for (const draft of drafts) {
    const validation = await call("validate_animation_draft", { draft });
    const staged = await call("stage_animation_draft", {
      transactionName: `World-solved R6 combat: ${draft.name}`,
      draft,
    }) as { transactionId: string };
    const committed = await call("commit_animation_draft", {
      transactionId: staged.transactionId,
      destinationName: draft.name,
    });
    results.push({ name: draft.name, validation, committed });
  }
  const attached = await call("attach_committed_animations_to_selected_rig_animsaves", {
    namePrefix: "MD_CUTSCENE_R6_P01_",
  });
  process.stdout.write(JSON.stringify({ results, attached }, null, 2));
} finally {
  await client.close();
}
