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
  allowTrailingArms?: boolean;
  stableLegSwing?: boolean;
  stableRightLegSwing?: boolean;
  stableLeftLegSwing?: boolean;
  stableArmSwing?: boolean;
  worldFacingLegs?: boolean;
  groundFeet?: boolean;
  armOutwardOffset?: number;
  lockArmJoints?: boolean;
  lockLegJoints?: boolean;
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
  twistReferenceLocal: V3 = [0, 0, 1],
  twistReferenceWorld?: V3,
  lockedEndpointY?: number,
): TF {
  const joint = compose(parent, { p: jointLocal, q: identity.q }).p;
  const localEndpoint: V3 = [0, -1, 0];
  const localJointToEndpoint = sub(localEndpoint, partJointLocal);
  let direction = unit(sub(endpoint, joint));
  if (lockedEndpointY !== undefined) {
    const limbLength = magnitude(localJointToEndpoint);
    const vertical = Math.max(-1, Math.min(1, (lockedEndpointY - joint[1]) / limbLength));
    let horizontal: V3 = [endpoint[0] - joint[0], 0, endpoint[2] - joint[2]];
    if (magnitude(horizontal) < 0.001) {
      const parentForward = qRotate(parent.q, [0, 0, -1]);
      horizontal = [parentForward[0], 0, parentForward[2]];
    }
    horizontal = unit(horizontal);
    const horizontalScale = Math.sqrt(Math.max(0, 1 - vertical * vertical));
    direction = [horizontal[0] * horizontalScale, vertical, horizontal[2] * horizontalScale];
  }
  const q = qMapDirectionWithReference(
    localJointToEndpoint,
    direction,
    twistReferenceLocal,
    twistReferenceWorld ?? qRotate(parent.q, twistReferenceLocal),
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
    "Right Arm": partFromEndpoint(torso, [1, 0.5 - (phase.shoulderDrop ?? 0), 0], [-0.5, 0.5, 0], phase.rightFist, phase.lockArmJoints ?? phase.lockLimbJoints, phase.stableArmSwing ? [1, 0, 0] : [0, 0, 1]),
    "Left Arm": partFromEndpoint(torso, [-1, 0.5 - (phase.shoulderDrop ?? 0), 0], [0.5, 0.5, 0], phase.leftFist, phase.lockArmJoints ?? phase.lockLimbJoints, phase.stableArmSwing ? [1, 0, 0] : [0, 0, 1]),
    "Right Leg": partFromEndpoint(torso, [1, -1, 0], [0.5, 1, 0], phase.rightFoot, phase.lockLegJoints ?? phase.lockLimbJoints, phase.stableLegSwing || phase.stableRightLegSwing ? [1, 0, 0] : [0, 0, 1], phase.worldFacingLegs ? [0, 0, 1] : undefined, phase.groundFeet ? phase.rightFoot[1] : undefined),
    "Left Leg": partFromEndpoint(torso, [-1, -1, 0], [-0.5, 1, 0], phase.leftFoot, phase.lockLegJoints ?? phase.lockLimbJoints, phase.stableLegSwing || phase.stableLeftLegSwing ? [1, 0, 0] : [0, 0, 1], phase.worldFacingLegs ? [0, 0, 1] : undefined, phase.groundFeet ? phase.leftFoot[1] : undefined),
  };
  const armOutwardOffset = phase.armOutwardOffset ?? 0;
  if (armOutwardOffset !== 0) {
    world["Right Arm"].p = add(world["Right Arm"].p, qRotate(torso.q, [armOutwardOffset, 0, 0]));
    world["Left Arm"].p = add(world["Left Arm"].p, qRotate(torso.q, [-armOutwardOffset, 0, 0]));
  }
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

const mediumChainFinisher: Skill = {
  name: "MD_R6_MediumChain_FinalBreaker_v1",
  duration: 2.35,
  intent:
    "Four hand-first medium punches with matched force and compact recovery, followed by a visibly heavier final straight driven by a longer coil, larger weight transfer, farther fist endpoint and longer hit stop",
  contacts: [
    {
      id: "right_support",
      effector: "Right Leg",
      target: "ground",
      startTime: 0,
      endTime: 2.18,
      positionWeight: 1,
      rotationWeight: 0,
      allowSlideMeters: 0.05,
    },
    {
      id: "left_support",
      effector: "Left Leg",
      target: "ground",
      startTime: 0,
      endTime: 2.18,
      positionWeight: 1,
      rotationWeight: 0,
      allowSlideMeters: 0.05,
    },
  ],
  phases: [
    {
      n: 0,
      name: "compact_guard",
      intention: "balanced staggered guard with both fists forward and visible",
      energy: 0.28,
      leading: "Torso",
      torsoPosition: [0, -0.10, 0],
      torsoEuler: [-5, -4, -1],
      headEuler: [3, 4, 1],
      rightFist: [0.88, 0.22, -1.28],
      leftFist: [-0.82, 0.35, -1.34],
      rightFoot: [0.62, -3, 0.20],
      leftFoot: [-0.68, -3, -0.22],
    },
    {
      n: 0.055,
      name: "jab_one_load",
      intention: "small right-side counter-rotation loads the left jab without pulling either elbow behind the torso",
      energy: 0.48,
      leading: "Torso",
      torsoPosition: [0.04, -0.13, 0.03],
      torsoEuler: [-7, 13, 3],
      headEuler: [4, -8, -2],
      rightFist: [0.48, 0.66, -0.82],
      leftFist: [-0.88, 0.48, -0.52],
      rightFoot: [0.62, -3, 0.20],
      leftFoot: [-0.70, -3, -0.22],
    },
    {
      n: 0.115,
      name: "jab_one_impact",
      intention: "left fist reaches first at medium force while the right fist protects the centerline",
      energy: 0.72,
      leading: "Left Arm",
      torsoPosition: [-0.08, -0.07, -0.28],
      torsoEuler: [-6, -18, -5],
      headEuler: [3, 12, 3],
      rightFist: [0.43, 0.78, -0.66],
      leftFist: [-0.16, 0.96, -2.78],
      rightFoot: [0.62, -3, 0.18],
      leftFoot: [-0.70, -3, -0.24],
    },
    {
      n: 0.132,
      name: "jab_one_hold",
      intention: "brief medium hit stop preserves the hand-first silhouette",
      energy: 0.70,
      leading: "Left Arm",
      torsoPosition: [-0.09, -0.07, -0.30],
      torsoEuler: [-6, -20, -6],
      headEuler: [3, 13, 3],
      rightFist: [0.42, 0.78, -0.64],
      leftFist: [-0.14, 0.98, -2.86],
      rightFoot: [0.62, -3, 0.18],
      leftFoot: [-0.70, -3, -0.24],
    },
    {
      n: 0.205,
      name: "straight_two_load",
      intention: "left fist begins recovery as the torso reverses to load the right straight",
      energy: 0.50,
      leading: "Torso",
      torsoPosition: [-0.02, -0.13, 0.01],
      torsoEuler: [-8, -15, -4],
      headEuler: [4, 8, 2],
      rightFist: [0.94, 0.50, -0.48],
      leftFist: [-0.40, 0.78, -0.84],
      rightFoot: [0.64, -3, 0.19],
      leftFoot: [-0.68, -3, -0.23],
    },
    {
      n: 0.265,
      name: "straight_two_impact",
      intention: "right fist lands with the same medium reach and body commitment as the first hit",
      energy: 0.72,
      leading: "Right Arm",
      torsoPosition: [0.09, -0.07, -0.29],
      torsoEuler: [-6, 19, 6],
      headEuler: [3, -13, -3],
      rightFist: [0.15, 0.98, -2.82],
      leftFist: [-0.45, 0.80, -0.66],
      rightFoot: [0.64, -3, 0.21],
      leftFoot: [-0.68, -3, -0.21],
    },
    {
      n: 0.282,
      name: "straight_two_hold",
      intention: "second medium hit stop matches the first",
      energy: 0.70,
      leading: "Right Arm",
      torsoPosition: [0.10, -0.07, -0.31],
      torsoEuler: [-6, 21, 6],
      headEuler: [3, -14, -3],
      rightFist: [0.13, 1.00, -2.90],
      leftFist: [-0.46, 0.80, -0.64],
      rightFoot: [0.64, -3, 0.21],
      leftFoot: [-0.68, -3, -0.21],
    },
    {
      n: 0.355,
      name: "cross_three_load",
      intention: "right hand recoils to guard while the left side reloads without a deep rear swing",
      energy: 0.50,
      leading: "Torso",
      torsoPosition: [0.03, -0.13, 0.02],
      torsoEuler: [-8, 15, 4],
      headEuler: [4, -8, -2],
      rightFist: [0.44, 0.78, -0.84],
      leftFist: [-0.95, 0.50, -0.48],
      rightFoot: [0.62, -3, 0.18],
      leftFoot: [-0.70, -3, -0.24],
    },
    {
      n: 0.415,
      name: "cross_three_impact",
      intention: "left fist strikes the same target band at matched medium force",
      energy: 0.72,
      leading: "Left Arm",
      torsoPosition: [-0.10, -0.07, -0.30],
      torsoEuler: [-6, -20, -6],
      headEuler: [3, 14, 3],
      rightFist: [0.46, 0.81, -0.64],
      leftFist: [-0.12, 1.00, -2.84],
      rightFoot: [0.62, -3, 0.17],
      leftFoot: [-0.71, -3, -0.25],
    },
    {
      n: 0.432,
      name: "cross_three_hold",
      intention: "third medium hit stop stays equal instead of escalating early",
      energy: 0.70,
      leading: "Left Arm",
      torsoPosition: [-0.11, -0.07, -0.32],
      torsoEuler: [-6, -22, -6],
      headEuler: [3, 15, 3],
      rightFist: [0.46, 0.81, -0.62],
      leftFist: [-0.10, 1.01, -2.92],
      rightFoot: [0.62, -3, 0.17],
      leftFoot: [-0.71, -3, -0.25],
    },
    {
      n: 0.505,
      name: "straight_four_load",
      intention: "the left hand recovers as the right side coils for the last medium strike",
      energy: 0.50,
      leading: "Torso",
      torsoPosition: [-0.02, -0.14, 0.02],
      torsoEuler: [-8, -16, -4],
      headEuler: [4, 9, 2],
      rightFist: [0.96, 0.48, -0.47],
      leftFist: [-0.42, 0.78, -0.84],
      rightFoot: [0.65, -3, 0.20],
      leftFoot: [-0.68, -3, -0.22],
    },
    {
      n: 0.565,
      name: "straight_four_impact",
      intention: "fourth strike matches the preceding medium impacts in reach, hold and torso travel",
      energy: 0.72,
      leading: "Right Arm",
      torsoPosition: [0.10, -0.07, -0.30],
      torsoEuler: [-6, 20, 6],
      headEuler: [3, -14, -3],
      rightFist: [0.14, 0.99, -2.84],
      leftFist: [-0.47, 0.81, -0.64],
      rightFoot: [0.65, -3, 0.21],
      leftFoot: [-0.68, -3, -0.21],
    },
    {
      n: 0.582,
      name: "straight_four_hold",
      intention: "final medium hit stop completes the even rhythm",
      energy: 0.70,
      leading: "Right Arm",
      torsoPosition: [0.11, -0.07, -0.32],
      torsoEuler: [-6, 22, 7],
      headEuler: [3, -15, -4],
      rightFist: [0.12, 1.01, -2.92],
      leftFist: [-0.47, 0.81, -0.62],
      rightFoot: [0.65, -3, 0.21],
      leftFoot: [-0.68, -3, -0.21],
    },
    {
      n: 0.675,
      name: "finisher_compression",
      intention: "rhythm breaks as the body sinks and coils for a clearly heavier final blow",
      energy: 0.66,
      leading: "Torso",
      torsoPosition: [-0.10, -0.24, 0.05],
      torsoEuler: [-15, -29, -8],
      headEuler: [7, 17, 4],
      rightFist: [1.02, 0.30, -0.34],
      leftFist: [-0.32, 0.78, -0.72],
      rightFoot: [0.68, -3, 0.25],
      leftFoot: [-0.75, -3, -0.30],
    },
    {
      n: 0.745,
      name: "finisher_drive",
      intention: "hips and torso launch first while the right fist trails for visible acceleration",
      energy: 0.86,
      leading: "Torso",
      torsoPosition: [0.04, -0.11, -0.30],
      torsoEuler: [-11, 8, 3],
      headEuler: [5, -4, -1],
      rightFist: [0.72, 0.74, -1.34],
      leftFist: [-0.45, 0.80, -0.62],
      rightFoot: [0.66, -3, 0.23],
      leftFoot: [-0.74, -3, -0.29],
    },
    {
      n: 0.805,
      name: "final_breaker_impact",
      intention: "right fist reaches farthest as root, torso and support line fully commit",
      energy: 1,
      leading: "Right Arm",
      torsoPosition: [0.21, 0.01, -0.66],
      torsoEuler: [-11, 43, 14],
      headEuler: [5, -31, -8],
      rightFist: [-0.01, 1.28, -3.66],
      leftFist: [-0.54, 0.72, -0.22],
      rightFoot: [0.62, -3, 0.22],
      leftFoot: [-0.82, -3, -0.39],
    },
    {
      n: 0.845,
      name: "final_breaker_hitstop",
      intention: "long final hit stop and slight overshoot make the force hierarchy unmistakable",
      energy: 0.98,
      leading: "Right Arm",
      torsoPosition: [0.24, -0.01, -0.72],
      torsoEuler: [-13, 48, 16],
      headEuler: [6, -35, -9],
      rightFist: [-0.05, 1.32, -3.82],
      leftFist: [-0.58, 0.70, -0.16],
      rightFoot: [0.62, -3, 0.22],
      leftFoot: [-0.84, -3, -0.41],
    },
    {
      n: 0.915,
      name: "finisher_recoil",
      intention: "torso begins recovery before the finishing fist, creating drag and weight",
      energy: 0.52,
      leading: "Torso",
      torsoPosition: [0.08, -0.12, -0.28],
      torsoEuler: [-7, 17, 5],
      headEuler: [3, -9, -2],
      rightFist: [0.30, 0.96, -1.50],
      leftFist: [-0.48, 0.80, -0.48],
      rightFoot: [0.63, -3, 0.20],
      leftFoot: [-0.72, -3, -0.27],
    },
    {
      n: 1,
      name: "guard_recovery",
      intention: "settle into an alert guard instead of collapsing to neutral",
      energy: 0.28,
      leading: "Torso",
      torsoPosition: [0, -0.10, 0],
      torsoEuler: [-5, -4, -1],
      headEuler: [3, 4, 1],
      rightFist: [0.88, 0.22, -1.28],
      leftFist: [-0.82, 0.35, -1.34],
      rightFoot: [0.62, -3, 0.20],
      leftFoot: [-0.68, -3, -0.22],
    },
  ],
};

const frenzyRunPhases: Phase[] = [
  {
    n: 0,
    name: "stillness_before_alarm",
    intention: "a short tense stillness makes the sudden launch read faster",
    energy: 0.20,
    leading: "Head",
    torsoPosition: [0, -0.08, 0],
    torsoEuler: [-5, -3, -1],
    headEuler: [3, 4, 1],
    rightFist: [0.90, 0.18, -1.10],
    leftFist: [-0.86, 0.26, -1.16],
    rightFoot: [0.62, -3, 0.18],
    leftFoot: [-0.68, -3, -0.20],
  },
  {
    n: 0.055,
    name: "panic_compression",
    intention: "hips drop and the whole line of action pitches forward before the first step",
    energy: 0.58,
    leading: "Torso",
    torsoPosition: [-0.03, -0.28, 0.10],
    torsoEuler: [-20, -12, -5],
    headEuler: [8, 8, 2],
    rightFist: [0.72, -0.12, -0.54],
    leftFist: [-0.64, 0.15, -1.02],
    rightFoot: [0.70, -3, 0.35],
    leftFoot: [-0.72, -2.72, -0.70],
  },
  {
    n: 0.105,
    name: "explosive_first_step",
    intention: "the first stride breaks the compression with a sharp forward body drive",
    energy: 0.84,
    leading: "Left Leg",
    torsoPosition: [0.05, -0.12, -0.27],
    torsoEuler: [-24, 8, 3],
    headEuler: [10, -5, -1],
    rightFist: [0.42, -0.04, -1.54],
    leftFist: [-0.74, -0.10, -1.02],
    rightFoot: [0.64, -3, 0.54],
    leftFoot: [-0.70, -2.64, -0.96],
  },
];

const frenzyStepTimes = [0.15, 0.21, 0.27, 0.33, 0.39, 0.45, 0.51, 0.57, 0.63, 0.69, 0.75];
for (let index = 0; index < frenzyStepTimes.length; index += 1) {
  const n = frenzyStepTimes[index]!;
  const rightLegForward = index % 2 === 0;
  const lateral = rightLegForward ? 0.055 : -0.055;
  const compression = index % 3 === 1 ? -0.22 : -0.13;
  const stride = 0.82 + Math.min(index, 6) * 0.035;
  const torsoTwist = rightLegForward ? -8 : 8;
  frenzyRunPhases.push({
    n,
    name: `frenzy_stride_${String(index + 1).padStart(2, "0")}`,
    intention:
      "rapid alternating sprint stride with low recovery, opposed arm drive and increasing urgency",
    energy: Math.min(0.96, 0.78 + index * 0.018),
    leading: rightLegForward ? "Right Leg" : "Left Leg",
    torsoPosition: [lateral, compression, -0.24 - Math.min(index, 5) * 0.015],
    torsoEuler: [-24 - Math.min(index, 4), torsoTwist, rightLegForward ? -4 : 4],
    headEuler: [10, -torsoTwist * 0.45, rightLegForward ? 1 : -1],
    rightFist: rightLegForward
      ? [0.92, -0.28, -0.18]
      : [0.38, -0.08, -1.52],
    leftFist: rightLegForward
      ? [-0.40, -0.06, -1.52]
      : [-0.94, -0.28, -0.18],
    rightFoot: rightLegForward
      ? [0.70, -2.62, -stride]
      : [0.64, -3, 0.58],
    leftFoot: rightLegForward
      ? [-0.66, -3, 0.58]
      : [-0.72, -2.62, -stride],
  });
}

frenzyRunPhases.push(
  {
    n: 0.795,
    name: "attack_stride",
    intention: "the normal sprint stride becomes the attack stride without braking",
    energy: 0.94,
    leading: "Left Leg",
    torsoPosition: [-0.08, -0.18, -0.38],
    torsoEuler: [-27, -10, -4],
    headEuler: [11, 6, 2],
    rightFist: [0.55, -0.02, -1.42],
    leftFist: [-0.72, -0.18, -0.90],
    rightFoot: [0.66, -3, 0.68],
    leftFoot: [-0.72, -2.62, -1.02],
  },
  {
    n: 0.835,
    name: "rear_leg_drive",
    intention: "the left foot lands ahead while the trailing right leg keeps driving the whole body through the punch",
    energy: 0.96,
    leading: "Right Leg",
    torsoPosition: [-0.02, -0.12, -0.60],
    torsoEuler: [-25, -18, -6],
    headEuler: [10, 11, 3],
    rightFist: [0.40, 0.35, -1.65],
    leftFist: [-0.42, 0.55, -1.10],
    rightFoot: [0.68, -2.84, 0.88],
    leftFoot: [-0.75, -3, -0.82],
  },
  {
    n: 0.875,
    name: "body_leads_fist",
    intention: "the body continues sprinting forward while the fist accelerates through the active stride",
    energy: 0.98,
    leading: "Torso",
    torsoPosition: [0.10, -0.05, -0.86],
    torsoEuler: [-21, 15, 5],
    headEuler: [8, -9, -2],
    rightFist: [0.25, 0.75, -2.30],
    leftFist: [-0.48, 0.68, -1.25],
    rightFoot: [0.72, -2.68, 1.00],
    leftFoot: [-0.76, -3, -0.86],
  },
  {
    n: 0.905,
    name: "runaway_punch_impact",
    intention: "the fist impacts while the rear leg is still extended and the body is still crossing the planted lead foot",
    energy: 1,
    leading: "Right Arm",
    torsoPosition: [0.32, 0, -1.18],
    torsoEuler: [-18, 48, 15],
    headEuler: [6, -34, -9],
    rightFist: [-0.05, 1.25, -4.10],
    leftFist: [-0.62, 0.65, -1.15],
    rightFoot: [0.74, -2.55, 1.10],
    leftFoot: [-0.78, -3, -0.90],
  },
  {
    n: 0.922,
    name: "runaway_punch_hitstop",
    intention: "a very short impact accent preserves force without stopping the forward run",
    energy: 0.98,
    leading: "Right Arm",
    torsoPosition: [0.37, -0.01, -1.28],
    torsoEuler: [-19, 52, 17],
    headEuler: [7, -38, -10],
    rightFist: [-0.10, 1.30, -4.24],
    leftFist: [-0.65, 0.64, -1.10],
    rightFoot: [0.74, -2.48, 0.82],
    leftFoot: [-0.80, -3, -0.88],
  },
  {
    n: 0.96,
    name: "running_followthrough",
    intention: "the body passes through the hit and the trailing leg swings forward instead of settling into a stationary recoil",
    energy: 0.82,
    leading: "Torso",
    torsoPosition: [0.40, -0.08, -1.38],
    torsoEuler: [-22, 28, 8],
    headEuler: [8, -17, -4],
    rightFist: [-0.08, 1.05, -3.40],
    leftFist: [-0.56, 0.54, -1.12],
    rightFoot: [0.72, -2.58, -0.42],
    leftFoot: [-0.72, -3, 0.42],
  },
  {
    n: 1,
    name: "run_continues",
    intention: "the punch arm drags back as the next running stride begins",
    energy: 0.72,
    leading: "Right Leg",
    torsoPosition: [0.48, -0.15, -1.55],
    torsoEuler: [-25, 8, 3],
    headEuler: [10, -5, -1],
    rightFist: [0.42, 0.20, -2.05],
    leftFist: [-0.60, 0.44, -1.75],
    rightFoot: [0.72, -3, -0.72],
    leftFoot: [-0.68, -2.62, 0.66],
  },
);

const frenzyRunPunch: Skill = {
  name: "MD_R6_FrenzyRun_RunawayPunch_v1",
  duration: 3.90,
  intent:
    "An original frantic accelerating R6 sprint inspired by the escalating run energy of 20 20 20 dropkick, replacing the airborne kick with a planted hand-first momentum punch",
  contacts: [
    {
      id: "attack_left_contact",
      effector: "Left Leg",
      target: "ground",
      startTime: 3.24,
      endTime: 3.67,
      positionWeight: 1,
      rotationWeight: 0,
      allowSlideMeters: 0.06,
    },
    {
      id: "followthrough_right_contact",
      effector: "Right Leg",
      target: "ground",
      startTime: 3.72,
      endTime: 3.90,
      positionWeight: 1,
      rotationWeight: 0,
      allowSlideMeters: 0.06,
    },
  ],
  phases: frenzyRunPhases,
};

const carryRunPhases: Phase[] = [
  {
    n: 0,
    name: "attack_stride_unbroken",
    intention: "the sprint stride remains fully active as the punch begins",
    energy: 0.97,
    leading: "Left Leg",
    torsoPosition: [-0.08, -0.18, -0.38],
    torsoEuler: [-27, -10, -4],
    headEuler: [11, 6, 2],
    rightFist: [0.48, 0.05, -1.62],
    leftFist: [-0.58, 0.40, -1.05],
    rightFoot: [0.66, -3, 0.70],
    leftFoot: [-0.72, -2.62, -1.05],
  },
  {
    n: 0.07,
    name: "running_punch_acceleration",
    intention: "the rear leg drives while the torso and fist accelerate through the active stride",
    energy: 0.99,
    leading: "Right Leg",
    torsoPosition: [0.05, -0.08, -0.68],
    torsoEuler: [-24, 18, 6],
    headEuler: [9, -11, -3],
    rightFist: [0.18, 0.72, -2.72],
    leftFist: [-0.50, 0.62, -1.18],
    rightFoot: [0.72, -2.74, 0.98],
    leftFoot: [-0.76, -3, -0.88],
  },
  {
    n: 0.12,
    name: "running_punch_knockdown",
    intention: "the fist lands hand-first while the body is still running across the lead foot",
    energy: 1,
    leading: "Right Arm",
    torsoPosition: [0.28, -0.02, -0.98],
    torsoEuler: [-20, 47, 15],
    headEuler: [7, -34, -9],
    rightFist: [-0.06, 1.12, -4.18],
    leftFist: [-0.62, 0.62, -1.26],
    rightFoot: [0.76, -2.54, 1.08],
    leftFoot: [-0.80, -3, -0.92],
  },
  {
    n: 0.16,
    name: "impact_becomes_push",
    intention: "the striking arm stays engaged and converts the knockdown into a continuous ground-driving push",
    energy: 0.98,
    leading: "Torso",
    torsoPosition: [0.34, -0.12, -1.15],
    torsoEuler: [-27, 30, 9],
    headEuler: [10, -20, -5],
    rightFist: [-0.08, 0.72, -4.30],
    leftFist: [-0.58, 0.48, -1.34],
    rightFoot: [0.72, -2.62, 0.55],
    leftFoot: [-0.74, -3, -0.62],
  },
];

const carryStrideTimes = [0.24, 0.32, 0.40, 0.48, 0.56, 0.64, 0.72, 0.80, 0.88, 0.96, 1];
for (let index = 0; index < carryStrideTimes.length; index += 1) {
  const n = carryStrideTimes[index]!;
  const progress = (n - 0.16) / 0.84;
  const rightForward = index % 2 === 0;
  const baseZ = -1.15 - progress * 2.45;
  const sway = rightForward ? 0.09 : -0.09;
  const compression = index % 2 === 0 ? -0.20 : -0.28;
  const stride = 0.78 + Math.min(index, 5) * 0.025;
  carryRunPhases.push({
    n,
    name: `ground_carry_stride_${String(index + 1).padStart(2, "0")}`,
    intention:
      "continue sprinting through the grounded target with the right arm engaged, alternating support and uninterrupted forward drive",
    energy: Math.max(0.88, 0.97 - index * 0.007),
    leading: rightForward ? "Right Leg" : "Left Leg",
    torsoPosition: [0.34 + sway, compression, baseZ],
    torsoEuler: [-29, rightForward ? 22 : 12, rightForward ? 7 : 3],
    headEuler: [11, rightForward ? -13 : -7, rightForward ? -3 : -1],
    rightFist: [
      -0.08 + sway * 0.35,
      0.58 + (index % 3 === 1 ? -0.08 : 0.04),
      baseZ - 3.10,
    ],
    leftFist: rightForward
      ? [-0.44, 0.25, baseZ - 1.22]
      : [-0.62, 0.48, baseZ - 1.45],
    rightFoot: rightForward
      ? [0.72, -2.64, baseZ - stride]
      : [0.68, -3, baseZ + 0.62],
    leftFoot: rightForward
      ? [-0.70, -3, baseZ + 0.62]
      : [-0.74, -2.64, baseZ - stride],
  });
}

const frenzyRunGroundCarryPunch: Skill = {
  name: "MD_R6_FrenzyRun_RunawayPunch_v1",
  duration: 2.40,
  intent:
    "A running punch that knocks the target down and immediately becomes a continuous ground-driving carry while the attacker keeps sprinting through multiple alternating strides",
  contacts: [],
  phases: carryRunPhases,
};

const carriedVictimPhases: Phase[] = [
  {
    n: 0,
    name: "target_alive_neutral",
    intention: "stand naturally before the attacker reaches striking range",
    energy: 0.18,
    leading: "Torso",
    torsoPosition: [0, -0.03, 0],
    torsoEuler: [-2, 0, 0],
    headEuler: [1, 0, 0],
    rightFist: [1.42, -0.86, -0.08],
    leftFist: [-1.42, -0.86, -0.08],
    rightFoot: [0.52, -3, 0.08],
    leftFoot: [-0.52, -3, -0.08],
  },
  {
    n: 0.28,
    name: "target_idle_offset",
    intention: "retain a living asymmetry without anticipating the attack too early",
    energy: 0.2,
    leading: "Head",
    torsoPosition: [-0.02, -0.05, 0.01],
    torsoEuler: [-3, -2, -1],
    headEuler: [2, 3, 1],
    rightFist: [1.40, -0.82, -0.10],
    leftFist: [-1.43, -0.91, -0.02],
    rightFoot: [0.52, -3, 0.08],
    leftFoot: [-0.52, -3, -0.08],
  },
  {
    n: 0.56,
    name: "target_idle_counter",
    intention: "subtle breathing and weight shift keep the target readable before contact",
    energy: 0.22,
    leading: "Torso",
    torsoPosition: [0.02, -0.06, 0],
    torsoEuler: [-3, 2, 1],
    headEuler: [1, -3, -1],
    rightFist: [1.43, -0.90, -0.02],
    leftFist: [-1.40, -0.84, -0.10],
    rightFoot: [0.54, -3, 0.06],
    leftFoot: [-0.50, -3, -0.10],
  },
  {
    n: 0.65,
    name: "late_visual_pickup",
    intention: "notice the incoming runner too late and begin opening the silhouette",
    energy: 0.48,
    leading: "Head",
    torsoPosition: [-0.04, -0.09, 0.02],
    torsoEuler: [-6, -7, -3],
    headEuler: [-6, 13, 4],
    rightFist: [1.18, -0.34, -0.66],
    leftFist: [-1.12, -0.42, -0.58],
    rightFoot: [0.54, -3, 0.10],
    leftFoot: [-0.56, -3, -0.14],
  },
  {
    n: 0.684,
    name: "failed_brace",
    intention: "compress instinctively but leave the chest exposed because the reaction is late",
    energy: 0.72,
    leading: "Torso",
    torsoPosition: [0.03, -0.16, 0.10],
    torsoEuler: [-10, 8, 4],
    headEuler: [-7, -10, -3],
    rightFist: [0.72, 0.18, -1.03],
    leftFist: [-0.78, 0.10, -0.90],
    rightFoot: [0.60, -3, 0.16],
    leftFoot: [-0.62, -3, -0.20],
  },
  {
    n: 0.7004,
    name: "running_punch_contact",
    intention: "the chest receives the running punch before the limbs can catch up",
    energy: 1,
    leading: "Torso",
    torsoPosition: [0.10, -0.13, 0.42],
    torsoEuler: [12, -7, -6],
    headEuler: [20, 11, 7],
    rightFist: [1.08, -0.12, 0.10],
    leftFist: [-1.18, -0.22, 0.02],
    rightFoot: [0.60, -2.93, 0.18],
    leftFoot: [-0.64, -3, -0.18],
  },
  {
    n: 0.712,
    name: "impact_hitstop",
    intention: "hold the compressed chest for a few frames while head and arms begin their delayed whip",
    energy: 1,
    leading: "Head",
    torsoPosition: [0.14, -0.18, 0.56],
    torsoEuler: [19, -10, -8],
    headEuler: [26, 16, 10],
    rightFist: [1.24, -0.28, 0.34],
    leftFist: [-1.34, -0.34, 0.22],
    rightFoot: [0.64, -2.82, 0.20],
    leftFoot: [-0.66, -3, -0.18],
  },
  {
    n: 0.732,
    name: "support_breaks",
    intention: "hips are driven backward and upward as both feet lose stable support",
    energy: 0.96,
    leading: "Torso",
    torsoPosition: [-0.08, -0.62, 0.88],
    torsoEuler: [47, -13, -10],
    headEuler: [21, 13, 9],
    rightFist: [1.48, -0.48, 0.82],
    leftFist: [-1.58, -0.54, 0.64],
    rightFoot: [0.78, -2.70, -0.10],
    leftFoot: [-0.72, -2.82, -0.42],
    allowTrailingArms: true,
  },
  {
    n: 0.754,
    name: "back_hits_ground",
    intention: "the torso lands broadside first while the head, hands and feet remain offset by inertia",
    energy: 0.9,
    leading: "Torso",
    torsoPosition: [0.02, -1.38, 1.05],
    torsoEuler: [82, -4, -5],
    headEuler: [13, 9, 6],
    rightFist: [1.36, -1.28, 1.44],
    leftFist: [-1.52, -1.20, 1.20],
    rightFoot: [0.74, -1.72, -0.78],
    leftFoot: [-0.66, -1.56, -1.04],
    allowTrailingArms: true,
  },
  {
    n: 0.770,
    name: "ground_impact_rebound",
    intention: "a short rebound keeps the knockdown from feeling soft or weightless",
    energy: 0.88,
    leading: "Head",
    torsoPosition: [-0.04, -1.25, 1.02],
    torsoEuler: [75, 5, 4],
    headEuler: [-8, -8, -5],
    rightFist: [1.54, -1.06, 1.58],
    leftFist: [-1.34, -1.10, 1.34],
    rightFoot: [0.66, -1.48, -1.00],
    leftFoot: [-0.74, -1.70, -0.72],
    allowTrailingArms: true,
  },
  {
    n: 0.800,
    name: "drag_stride_01",
    intention: "settle into the push contact while the limbs trail behind the accelerating body",
    energy: 0.84,
    leading: "Torso",
    torsoPosition: [0.08, -1.42, 1.12],
    torsoEuler: [83, 7, 6],
    headEuler: [9, -6, -4],
    rightFist: [1.44, -1.38, 1.62],
    leftFist: [-1.34, -1.24, 1.18],
    rightFoot: [0.76, -1.70, -0.62],
    leftFoot: [-0.68, -1.44, -1.06],
    allowTrailingArms: true,
  },
  {
    n: 0.835,
    name: "drag_stride_02",
    intention: "the opposite hip and leg skip against the ground with delayed arm drag",
    energy: 0.82,
    leading: "Left Leg",
    torsoPosition: [-0.08, -1.34, 1.08],
    torsoEuler: [78, -8, -6],
    headEuler: [-6, 7, 4],
    rightFist: [1.30, -1.18, 1.16],
    leftFist: [-1.50, -1.34, 1.58],
    rightFoot: [0.68, -1.42, -1.08],
    leftFoot: [-0.78, -1.72, -0.60],
    allowTrailingArms: true,
  },
  {
    n: 0.870,
    name: "drag_stride_03",
    intention: "a harder ground pulse travels from torso into head and loose extremities",
    energy: 0.83,
    leading: "Torso",
    torsoPosition: [0.10, -1.44, 1.14],
    torsoEuler: [84, 9, 7],
    headEuler: [10, -8, -5],
    rightFist: [1.52, -1.36, 1.66],
    leftFist: [-1.30, -1.18, 1.22],
    rightFoot: [0.78, -1.74, -0.58],
    leftFoot: [-0.66, -1.46, -1.10],
    allowTrailingArms: true,
  },
  {
    n: 0.905,
    name: "drag_stride_04",
    intention: "alternate the grounded skip without allowing the victim to regain structure",
    energy: 0.8,
    leading: "Right Leg",
    torsoPosition: [-0.09, -1.35, 1.08],
    torsoEuler: [78, -9, -7],
    headEuler: [-7, 8, 5],
    rightFist: [1.26, -1.16, 1.20],
    leftFist: [-1.54, -1.36, 1.62],
    rightFoot: [0.66, -1.44, -1.12],
    leftFoot: [-0.80, -1.73, -0.56],
    allowTrailingArms: true,
  },
  {
    n: 0.940,
    name: "drag_stride_05",
    intention: "maintain the chest contact and heavy floor rhythm through another attacker stride",
    energy: 0.79,
    leading: "Torso",
    torsoPosition: [0.08, -1.43, 1.13],
    torsoEuler: [83, 8, 6],
    headEuler: [9, -7, -4],
    rightFist: [1.48, -1.34, 1.64],
    leftFist: [-1.32, -1.20, 1.20],
    rightFoot: [0.76, -1.72, -0.60],
    leftFoot: [-0.68, -1.45, -1.08],
    allowTrailingArms: true,
  },
  {
    n: 0.972,
    name: "drag_stride_06",
    intention: "the loose body follows one more alternating skip with no recovery",
    energy: 0.77,
    leading: "Left Leg",
    torsoPosition: [-0.07, -1.36, 1.09],
    torsoEuler: [79, -7, -6],
    headEuler: [-6, 7, 4],
    rightFist: [1.28, -1.18, 1.18],
    leftFist: [-1.50, -1.34, 1.58],
    rightFoot: [0.68, -1.44, -1.08],
    leftFoot: [-0.78, -1.72, -0.60],
    allowTrailingArms: true,
  },
  {
    n: 1,
    name: "carried_motion_continues",
    intention: "end mid-drag so the synchronized pair can continue forward without a victim recovery",
    energy: 0.78,
    leading: "Torso",
    torsoPosition: [0.08, -1.43, 1.13],
    torsoEuler: [83, 8, 6],
    headEuler: [9, -7, -4],
    rightFist: [1.48, -1.34, 1.64],
    leftFist: [-1.32, -1.20, 1.20],
    rightFoot: [0.76, -1.72, -0.60],
    leftFoot: [-0.68, -1.45, -1.08],
    allowTrailingArms: true,
  },
];

const carriedVictim: Skill = {
  name: "MD_R6_FrenzyRun_CarriedVictim_v1",
  duration: 7.05,
  intent:
    "A synchronized R6 victim performance for the runaway punch: late brace, chest impact, support collapse, heavy back landing and continuing ground carry with staggered limb drag",
  contacts: [],
  phases: carriedVictimPhases,
};

const sukunaVillainLaugh: Skill = {
  name: "MD_R6_Villain_InsaneLaugh_v1",
  duration: 5.40,
  intent:
    "An original R6 supervillain performance inspired by Sukuna-like contempt: predatory stillness, a restrained smirk, escalating chest-led laughter, an uncontrolled backward cackle and a threatening living settle",
  contacts: [],
  phases: [
    {
      n: 0,
      name: "predatory_stillness",
      intention: "stand completely comfortable, as if everyone nearby is beneath notice",
      energy: 0.18,
      leading: "Head",
      torsoPosition: [0.02, -0.06, 0],
      torsoEuler: [-3, -7, -2],
      headEuler: [7, 10, 3],
      rightFist: [1.34, -0.78, -0.18],
      leftFist: [-1.42, -0.91, -0.08],
      rightFoot: [0.54, -3, 0.11],
      leftFoot: [-0.56, -3, -0.13],
      lockLimbJoints: true,
    },
    {
      n: 0.10,
      name: "silent_inhale",
      intention: "draw in a quiet breath while one shoulder rises before the expression breaks",
      energy: 0.27,
      leading: "Torso",
      torsoPosition: [-0.02, -0.02, -0.03],
      torsoEuler: [-1, -10, -3],
      headEuler: [4, 13, 4],
      rightFist: [1.27, -0.64, -0.28],
      leftFist: [-1.42, -0.90, -0.10],
      rightFoot: [0.54, -3, 0.11],
      leftFoot: [-0.56, -3, -0.13],
      lockLimbJoints: true,
      shoulderDrop: -0.04,
    },
    {
      n: 0.19,
      name: "smirk_forms",
      intention: "tilt the head toward the victim as amusement becomes visible",
      energy: 0.38,
      leading: "Head",
      torsoPosition: [0.04, -0.07, -0.02],
      torsoEuler: [-4, 8, 3],
      headEuler: [9, -15, -7],
      rightFist: [0.70, 0.34, -0.86],
      leftFist: [-1.35, -0.80, -0.18],
      rightFoot: [0.55, -3, 0.12],
      leftFoot: [-0.57, -3, -0.14],
      lockLimbJoints: true,
    },
    {
      n: 0.27,
      name: "first_chuckle",
      intention: "let the first laugh escape through one compact chest contraction",
      energy: 0.52,
      leading: "Torso",
      torsoPosition: [-0.06, -0.16, -0.10],
      torsoEuler: [-12, -6, -4],
      headEuler: [-3, 8, 5],
      rightFist: [0.50, -0.08, -1.00],
      leftFist: [-0.62, -0.18, -0.92],
      rightFoot: [0.57, -3, 0.14],
      leftFoot: [-0.59, -3, -0.16],
      lockLimbJoints: true,
    },
    {
      n: 0.335,
      name: "chuckle_rebound",
      intention: "rebound from the chest while the head and arms arrive a fraction late",
      energy: 0.58,
      leading: "Head",
      torsoPosition: [0.04, -0.05, 0.01],
      torsoEuler: [4, 10, 5],
      headEuler: [12, -12, -7],
      rightFist: [0.66, 0.14, -0.90],
      leftFist: [-0.76, -0.05, -0.82],
      rightFoot: [0.56, -3, 0.13],
      leftFoot: [-0.58, -3, -0.15],
      lockLimbJoints: true,
    },
    {
      n: 0.40,
      name: "restraint_breaks",
      intention: "fold sharply over the laughter as control begins to disappear",
      energy: 0.76,
      leading: "Torso",
      torsoPosition: [-0.10, -0.28, -0.18],
      torsoEuler: [-25, -14, -8],
      headEuler: [-12, 15, 9],
      rightFist: [0.46, -0.36, -0.96],
      leftFist: [-0.52, -0.42, -0.90],
      rightFoot: [0.61, -3, 0.17],
      leftFoot: [-0.63, -3, -0.19],
      lockLimbJoints: true,
    },
    {
      n: 0.435,
      name: "chest_opens_before_arms",
      intention: "start the upward chest snap while both heavy arms are still being pulled out of the fold",
      energy: 0.86,
      leading: "Torso",
      torsoPosition: [-0.01, -0.11, -0.02],
      torsoEuler: [-2, 2, 1],
      headEuler: [5, -3, -2],
      rightFist: [1.42, -0.18, -0.74],
      leftFist: [-1.38, -0.10, -0.70],
      rightFoot: [0.60, -3, 0.16],
      leftFoot: [-0.62, -3, -0.18],
      lockLimbJoints: true,
    },
    {
      n: 0.47,
      name: "laugh_explodes_open",
      intention: "snap the chest upward and throw both arms open as the laugh becomes dominant",
      energy: 0.96,
      leading: "Torso",
      torsoPosition: [0.08, 0.02, 0.10],
      torsoEuler: [18, 12, 7],
      headEuler: [24, -9, -6],
      rightFist: [2.16, 0.10, -0.48],
      leftFist: [-2.08, 0.28, -0.42],
      rightFoot: [0.58, -3, 0.14],
      leftFoot: [-0.60, -3, -0.16],
      lockLimbJoints: true,
    },
    {
      n: 0.535,
      name: "cackle_pulse_01",
      intention: "drive another laugh from the abdomen while the open arms continue drifting",
      energy: 0.90,
      leading: "Torso",
      torsoPosition: [-0.07, -0.22, -0.11],
      torsoEuler: [-17, -11, -7],
      headEuler: [-10, 13, 8],
      rightFist: [2.02, -0.06, -0.58],
      leftFist: [-2.18, 0.06, -0.46],
      rightFoot: [0.62, -3, 0.17],
      leftFoot: [-0.64, -3, -0.19],
      lockLimbJoints: true,
    },
    {
      n: 0.595,
      name: "cackle_rebound_01",
      intention: "reopen the chest faster than the head can follow, producing visible overlap",
      energy: 0.95,
      leading: "Head",
      torsoPosition: [0.08, 0.01, 0.08],
      torsoEuler: [15, 14, 8],
      headEuler: [25, -16, -10],
      rightFist: [2.25, 0.22, -0.38],
      leftFist: [-2.02, 0.34, -0.52],
      rightFoot: [0.58, -3, 0.13],
      leftFoot: [-0.60, -3, -0.15],
      lockLimbJoints: true,
    },
    {
      n: 0.655,
      name: "cackle_pulse_02",
      intention: "collapse farther forward with asymmetry so the rhythm does not become mechanical",
      energy: 0.94,
      leading: "Torso",
      torsoPosition: [0.11, -0.31, -0.17],
      torsoEuler: [-29, 17, 10],
      headEuler: [-16, -19, -12],
      rightFist: [1.84, -0.26, -0.72],
      leftFist: [-2.12, -0.02, -0.48],
      rightFoot: [0.64, -3, 0.19],
      leftFoot: [-0.66, -3, -0.21],
      lockLimbJoints: true,
    },
    {
      n: 0.715,
      name: "cackle_rebound_02",
      intention: "whip upward into a broader silhouette while the hands lag below the shoulders",
      energy: 0.98,
      leading: "Head",
      torsoPosition: [-0.07, 0.04, 0.13],
      torsoEuler: [23, -13, -8],
      headEuler: [29, 15, 9],
      rightFist: [2.10, 0.02, -0.62],
      leftFist: [-2.28, 0.20, -0.34],
      rightFoot: [0.59, -3, 0.14],
      leftFoot: [-0.61, -3, -0.16],
      lockLimbJoints: true,
    },
    {
      n: 0.775,
      name: "deepest_laugh_fold",
      intention: "double over at the waist as if the villain can no longer contain the joke",
      energy: 1,
      leading: "Torso",
      torsoPosition: [-0.05, -0.38, -0.24],
      torsoEuler: [-36, -8, -6],
      headEuler: [-19, 10, 7],
      rightFist: [0.74, -0.64, -1.00],
      leftFist: [-0.84, -0.68, -0.92],
      rightFoot: [0.67, -3, 0.22],
      leftFoot: [-0.69, -3, -0.24],
      lockLimbJoints: true,
    },
    {
      n: 0.807,
      name: "final_cackle_launch",
      intention: "reverse the torso first while the folded arms remain low for the final delayed release",
      energy: 0.98,
      leading: "Torso",
      torsoPosition: [-0.01, -0.14, -0.04],
      torsoEuler: [-5, -2, -1],
      headEuler: [7, 4, 3],
      rightFist: [1.46, -0.22, -0.68],
      leftFist: [-1.50, -0.20, -0.64],
      rightFoot: [0.62, -3, 0.17],
      leftFoot: [-0.64, -3, -0.19],
      lockLimbJoints: true,
    },
    {
      n: 0.84,
      name: "final_headback_cackle",
      intention: "explode into the largest backward arch and expose the full chest in absolute confidence",
      energy: 1,
      leading: "Head",
      torsoPosition: [0.03, 0.08, 0.18],
      torsoEuler: [31, 5, 4],
      headEuler: [34, -6, -4],
      rightFist: [2.26, 0.46, -0.30],
      leftFist: [-2.26, 0.40, -0.34],
      rightFoot: [0.57, -3, 0.12],
      leftFoot: [-0.59, -3, -0.14],
      lockLimbJoints: true,
    },
    {
      n: 0.895,
      name: "final_cackle_overshoot",
      intention: "let head and arms overshoot after the torso has already begun returning",
      energy: 0.89,
      leading: "Head",
      torsoPosition: [-0.03, -0.05, 0.05],
      torsoEuler: [8, -8, -5],
      headEuler: [24, 12, 8],
      rightFist: [2.14, 0.25, -0.42],
      leftFist: [-2.20, 0.30, -0.38],
      rightFoot: [0.58, -3, 0.13],
      leftFoot: [-0.60, -3, -0.15],
      lockLimbJoints: true,
    },
    {
      n: 0.945,
      name: "breathless_shake",
      intention: "retain small involuntary laughter pulses while the arms begin to lower",
      energy: 0.58,
      leading: "Torso",
      torsoPosition: [0.04, -0.12, -0.05],
      torsoEuler: [-9, 7, 4],
      headEuler: [5, -10, -6],
      rightFist: [1.58, -0.42, -0.44],
      leftFist: [-1.70, -0.38, -0.34],
      rightFoot: [0.57, -3, 0.12],
      leftFoot: [-0.59, -3, -0.14],
      lockLimbJoints: true,
    },
    {
      n: 1,
      name: "predatory_living_settle",
      intention: "finish with a lowered head, open silhouette and the promise that the laughter may restart",
      energy: 0.36,
      leading: "Head",
      torsoPosition: [-0.02, -0.08, -0.01],
      torsoEuler: [-4, -9, -3],
      headEuler: [11, 14, 7],
      rightFist: [1.40, -0.72, -0.22],
      leftFist: [-1.54, -0.78, -0.16],
      rightFoot: [0.55, -3, 0.11],
      leftFoot: [-0.57, -3, -0.13],
      lockLimbJoints: true,
    },
  ],
};

const sukunaVillainLaughReferenceInformed: Skill = {
  name: "MD_R6_Villain_InsaneLaugh_v1",
  duration: 7.60,
  intent:
    "A reference-informed but original R6 villain laugh built from controlled excess: a permanently crooked axis, irregular holds, left-leg weight commitment, torso-led explosive reversals, independent arms and delayed head overlap",
  contacts: [],
  phases: [
    {
      n: 0, name: "crooked_predatory_stillness",
      intention: "begin already asymmetrical and completely unafraid",
      energy: 0.18, leading: "Head",
      torsoPosition: [0.06, -0.18, 0.05], torsoEuler: [-7, -31, 5], headEuler: [10, 24, -6],
      rightFist: [1.18, -0.52, -0.62], leftFist: [-1.32, -0.78, -0.42],
      rightFoot: [0.68, -2.92, 0.28], leftFoot: [-0.62, -3, -0.22], lockLimbJoints: true,
    },
    {
      n: 0.11, name: "held_inhale",
      intention: "barely lift the chest while refusing to surrender the crooked silhouette",
      energy: 0.24, leading: "Torso",
      torsoPosition: [0.05, -0.13, 0.03], torsoEuler: [-3, -34, 4], headEuler: [7, 27, -7],
      rightFist: [1.14, -0.43, -0.66], leftFist: [-1.34, -0.74, -0.44],
      rightFoot: [0.68, -2.92, 0.28], leftFoot: [-0.62, -3, -0.22], lockLimbJoints: true,
    },
    {
      n: 0.22, name: "smirk_claims_the_space",
      intention: "turn the eyes toward the victim before the rest of the body acknowledges the joke",
      energy: 0.36, leading: "Head",
      torsoPosition: [0.08, -0.20, 0.06], torsoEuler: [-8, -38, 7], headEuler: [13, 31, -10],
      rightFist: [0.52, 0.34, -0.94], leftFist: [-1.30, -0.70, -0.48],
      rightFoot: [0.69, -2.90, 0.30], leftFoot: [-0.63, -3, -0.24], lockLimbJoints: true,
    },
    {
      n: 0.30, name: "first_suppressed_tremor",
      intention: "let a tiny involuntary laugh shake the abdomen without opening the silhouette",
      energy: 0.44, leading: "Torso",
      torsoPosition: [0.09, -0.27, -0.02], torsoEuler: [-13, -40, 8], headEuler: [5, 30, -9],
      rightFist: [0.50, 0.10, -0.98], leftFist: [-1.24, -0.58, -0.52],
      rightFoot: [0.72, -2.82, 0.34], leftFoot: [-0.65, -3, -0.27], lockLimbJoints: true,
    },
    {
      n: 0.33, name: "first_tremor_release",
      intention: "release only part of the contraction while the smile keeps growing",
      energy: 0.47, leading: "Torso",
      torsoPosition: [0.05, -0.20, 0.05], torsoEuler: [-5, -36, 5], headEuler: [10, 27, -8],
      rightFist: [0.58, 0.14, -0.92], leftFist: [-1.28, -0.54, -0.50],
      rightFoot: [0.69, -2.90, 0.30], leftFoot: [-0.63, -3, -0.24], lockLimbJoints: true,
    },
    {
      n: 0.36, name: "second_suppressed_tremor",
      intention: "repeat the abdominal shake slightly deeper and let one shoulder answer",
      energy: 0.51, leading: "Torso",
      torsoPosition: [0.11, -0.31, -0.04], torsoEuler: [-17, -43, 10], headEuler: [3, 31, -10],
      rightFist: [0.52, 0.02, -0.98], leftFist: [-1.34, -0.48, -0.54],
      rightFoot: [0.73, -2.80, 0.35], leftFoot: [-0.65, -3, -0.28], lockLimbJoints: true,
    },
    {
      n: 0.39, name: "second_tremor_release",
      intention: "rebound with the chest still mostly closed so the escalation remains restrained",
      energy: 0.54, leading: "Head",
      torsoPosition: [0.04, -0.22, 0.05], torsoEuler: [-7, -37, 6], headEuler: [13, 25, -8],
      rightFist: [0.62, 0.10, -0.90], leftFist: [-1.38, -0.44, -0.52],
      rightFoot: [0.70, -2.88, 0.31], leftFoot: [-0.64, -3, -0.25], lockLimbJoints: true,
    },
    {
      n: 0.43, name: "crooked_readable_hold",
      intention: "hold the crooked smile while a residual torso shake refuses to disappear",
      energy: 0.49, leading: "Head",
      torsoPosition: [0.06, -0.25, 0.02], torsoEuler: [-10, -40, 7], headEuler: [15, 25, -8],
      rightFist: [0.60, 0.06, -0.92], leftFist: [-1.40, -0.43, -0.52],
      rightFoot: [0.69, -2.90, 0.30], leftFoot: [-0.63, -3, -0.24], lockLimbJoints: true,
    },
    {
      n: 0.50, name: "second_deeper_bark",
      intention: "drop lower and harder onto the left support leg as the laugh returns",
      energy: 0.72, leading: "Torso",
      torsoPosition: [0.14, -0.46, -0.10], torsoEuler: [-27, -47, 13], headEuler: [-7, 32, -11],
      rightFist: [0.42, -0.38, -1.02], leftFist: [-0.64, -0.48, -0.84],
      rightFoot: [0.76, -2.68, 0.38], leftFoot: [-0.66, -3, -0.30], lockLimbJoints: true,
    },
    {
      n: 0.518, name: "second_rebound_head_lags",
      intention: "reverse the chest violently while the head is still completing the downward laugh",
      energy: 0.79, leading: "Torso",
      torsoPosition: [0.04, -0.24, 0.08], torsoEuler: [3, -40, 6], headEuler: [-1, 29, -9],
      rightFist: [0.76, -0.02, -0.86], leftFist: [-0.98, -0.16, -0.72],
      rightFoot: [0.70, -2.88, 0.31], leftFoot: [-0.64, -3, -0.25], lockLimbJoints: true,
    },
    {
      n: 0.56, name: "head_finishes_after_torso",
      intention: "hold the chest while the head finally whips upward into the laugh",
      energy: 0.72, leading: "Head",
      torsoPosition: [0.04, -0.24, 0.08], torsoEuler: [3, -40, 6], headEuler: [22, 22, -7],
      rightFist: [0.82, 0.04, -0.82], leftFist: [-1.04, -0.10, -0.68],
      rightFoot: [0.70, -2.88, 0.31], leftFoot: [-0.64, -3, -0.25], lockLimbJoints: true,
    },
    {
      n: 0.63, name: "left_arm_peels_open",
      intention: "allow the left arm to open first while the right remains tight across the body",
      energy: 0.80, leading: "Left Arm",
      torsoPosition: [0.05, -0.25, 0.06], torsoEuler: [2, -45, 8], headEuler: [23, 23, -8],
      rightFist: [0.58, -0.12, -0.96], leftFist: [-1.62, -0.08, -0.60],
      rightFoot: [0.73, -2.78, 0.35], leftFoot: [-0.65, -3, -0.28], lockLimbJoints: true,
    },
    {
      n: 0.67, name: "left_supported_collapse",
      intention: "collapse diagonally over the planted left leg with the opened arm dragging behind",
      energy: 0.94, leading: "Torso",
      torsoPosition: [0.17, -0.62, -0.15], torsoEuler: [-40, -51, 18], headEuler: [-18, 30, -12],
      rightFist: [0.38, -0.54, -1.02], leftFist: [-1.92, -0.18, -0.58],
      rightFoot: [0.82, -2.58, 0.44], leftFoot: [-0.68, -3, -0.33], lockLimbJoints: true,
    },
    {
      n: 0.686, name: "torso_reversal_arms_drag",
      intention: "fire the torso upward while both arms remain visibly behind the reversal",
      energy: 0.98, leading: "Torso",
      torsoPosition: [0.03, -0.24, 0.13], torsoEuler: [19, -43, 6], headEuler: [-4, 28, -10],
      rightFist: [1.16, -0.14, -0.70], leftFist: [-2.08, -0.02, -0.48],
      rightFoot: [0.74, -2.78, 0.36], leftFoot: [-0.66, -3, -0.29], lockLimbJoints: true,
    },
    {
      n: 0.716, name: "crossbody_cackle",
      intention: "fold again with the right arm cutting across the center and the left remaining wide",
      energy: 0.97, leading: "Right Arm",
      torsoPosition: [0.13, -0.58, -0.14], torsoEuler: [-36, -49, 16], headEuler: [-15, 31, -11],
      rightFist: [0.22, -0.22, -1.18], leftFist: [-1.70, -0.24, -0.68],
      rightFoot: [0.80, -2.61, 0.42], leftFoot: [-0.68, -3, -0.32], lockLimbJoints: true,
    },
    {
      n: 0.742, name: "asymmetric_cackle_flare",
      intention: "burst open with the right hand higher and farther while the left stays lower and heavier",
      energy: 1, leading: "Torso",
      torsoPosition: [0.00, -0.18, 0.16], torsoEuler: [25, -40, 4], headEuler: [4, 25, -9],
      rightFist: [2.24, 0.44, -0.30], leftFist: [-1.72, -0.08, -0.62],
      rightFoot: [0.73, -2.80, 0.35], leftFoot: [-0.65, -3, -0.28], lockLimbJoints: true,
    },
    {
      n: 0.79, name: "deepest_one_leg_compression",
      intention: "sink to the lowest point with nearly all visible weight on the left leg",
      energy: 1, leading: "Left Leg",
      torsoPosition: [0.19, -0.72, -0.18], torsoEuler: [-46, -52, 21], headEuler: [-21, 34, -13],
      rightFist: [0.54, -0.68, -0.96], leftFist: [-1.38, -0.38, -0.72],
      rightFoot: [0.86, -2.48, 0.48], leftFoot: [-0.70, -3, -0.36], lockLimbJoints: true,
    },
    {
      n: 0.807, name: "final_cackle_launch_breakdown",
      intention: "reverse the torso first while the compressed arms remain low for one more beat",
      energy: 0.99, leading: "Torso",
      torsoPosition: [0.06, -0.33, 0.04], torsoEuler: [-4, -46, 9], headEuler: [-8, 31, -11],
      rightFist: [1.34, -0.20, -0.68], leftFist: [-1.58, -0.22, -0.62],
      rightFoot: [0.77, -2.70, 0.39], leftFoot: [-0.67, -3, -0.31], lockLimbJoints: true,
    },
    {
      n: 0.824, name: "insane_headback_apex",
      intention: "reach the largest cackle with a violent chest arch and the head arriving last",
      energy: 1, leading: "Head",
      torsoPosition: [-0.02, -0.11, 0.22], torsoEuler: [34, -36, 2], headEuler: [38, 19, -7],
      rightFist: [2.18, 0.62, -0.22], leftFist: [-2.34, 0.20, -0.34],
      rightFoot: [0.72, -2.82, 0.34], leftFoot: [-0.65, -3, -0.28], lockLimbJoints: true,
    },
    {
      n: 0.87, name: "apex_hold_with_arm_drift",
      intention: "hold the heroic silhouette while only the arms continue drifting through inertia",
      energy: 0.96, leading: "Right Arm",
      torsoPosition: [-0.02, -0.11, 0.22], torsoEuler: [34, -36, 2], headEuler: [38, 19, -7],
      rightFist: [2.30, 0.70, -0.18], leftFist: [-2.26, 0.10, -0.40],
      rightFoot: [0.72, -2.82, 0.34], leftFoot: [-0.65, -3, -0.28], lockLimbJoints: true,
    },
    {
      n: 0.915, name: "head_and_arms_overshoot",
      intention: "start settling the chest while the head and unequal arms remain caught in the cackle",
      energy: 0.78, leading: "Head",
      torsoPosition: [0.03, -0.26, 0.10], torsoEuler: [8, -42, 7], headEuler: [29, 24, -9],
      rightFist: [2.02, 0.36, -0.34], leftFist: [-2.12, -0.04, -0.48],
      rightFoot: [0.74, -2.76, 0.36], leftFoot: [-0.66, -3, -0.29], lockLimbJoints: true,
    },
    {
      n: 0.96, name: "breathless_aftershock",
      intention: "let one final compact laugh shake the torso after the main explosion",
      energy: 0.58, leading: "Torso",
      torsoPosition: [0.10, -0.39, -0.02], torsoEuler: [-18, -47, 13], headEuler: [8, 29, -11],
      rightFist: [1.48, -0.28, -0.58], leftFist: [-1.72, -0.30, -0.56],
      rightFoot: [0.78, -2.68, 0.40], leftFoot: [-0.67, -3, -0.31], lockLimbJoints: true,
    },
    {
      n: 1, name: "crooked_threatening_settle",
      intention: "finish lower and more dangerous than the opening pose, still amused and ready to erupt again",
      energy: 0.34, leading: "Head",
      torsoPosition: [0.08, -0.24, 0.05], torsoEuler: [-9, -39, 8], headEuler: [15, 28, -10],
      rightFist: [1.24, -0.54, -0.62], leftFist: [-1.48, -0.70, -0.46],
      rightFoot: [0.72, -2.82, 0.34], leftFoot: [-0.65, -3, -0.28], lockLimbJoints: true,
    },
  ],
};

const predatoryMeleePose: Skill = {
  name: "MD_R6_PredatoryMeleeIdle_v7_ClosedRearGuard",
  duration: 1.6,
  intent:
    "A topology-aware R6 combat idle that preserves the professional posing intent without forcing rigid legs into a seated slide: moderate forward torso lean, compact pelvis height, rear-right weight bias, firm lead leg, restrained shoulder-to-hip opposition, head alignment and an asymmetric chest-height guard with controlled arm overlap",
  contacts: [
    { id: "rear_right_ground", effector: "Right Leg", target: "ground", startTime: 0, endTime: 1.6, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.015 },
    { id: "front_left_ground", effector: "Left Leg", target: "ground", startTime: 0, endTime: 1.6, positionWeight: 0.35, rotationWeight: 0, allowSlideMeters: 0.015 },
  ],
  phases: [
    {
      n: 0,
      name: "grounded_weight_settle",
      intention: "place the pelvis low between two staggered feet and let gravity travel visibly through both legs",
      energy: 0.52,
      leading: "Head",
      torsoPosition: [0.14, -0.50, 0.06],
      torsoEuler: [-14, -18, 5],
      headEuler: [3, 13, -3],
      rightFist: [1.06, -0.04, -1.32],
      leftFist: [-0.88, 0.08, -1.52],
      rightFoot: [0.60, -3, 0.48],
      leftFoot: [-0.72, -3, -0.56],
      lockLimbJoints: true,
      lockArmJoints: true,
      lockLegJoints: false,
      shoulderDrop: 0.10,
      worldFacingLegs: true,
      armOutwardOffset: 0.10,
    },
    {
      n: 0.26,
      name: "restrained_inhale",
      intention: "let the chest rise a few centimeters while both feet and the pelvis projection remain inside the support base",
      energy: 0.50,
      leading: "Head",
      torsoPosition: [0.13, -0.47, 0.05],
      torsoEuler: [-13, -17, 4.5],
      headEuler: [3, 12, -2.5],
      rightFist: [1.05, -0.02, -1.31],
      leftFist: [-0.87, 0.10, -1.51],
      rightFoot: [0.60, -3, 0.48],
      leftFoot: [-0.72, -3, -0.56],
      lockLimbJoints: true,
      lockArmJoints: true,
      lockLegJoints: false,
      shoulderDrop: 0.09,
      worldFacingLegs: true,
      armOutwardOffset: 0.10,
    },
    {
      n: 0.52,
      name: "heavy_exhale_compression",
      intention: "sink the pelvis and shoulders into gravity without widening, skating or rotating the entire body as one unit",
      energy: 0.54,
      leading: "Torso",
      torsoPosition: [0.16, -0.53, 0.07],
      torsoEuler: [-16, -19, 6],
      headEuler: [4, 14, -3.5],
      rightFist: [1.08, -0.06, -1.34],
      leftFist: [-0.90, 0.06, -1.54],
      rightFoot: [0.60, -3, 0.48],
      leftFoot: [-0.72, -3, -0.56],
      lockLimbJoints: true,
      lockArmJoints: true,
      lockLegJoints: false,
      shoulderDrop: 0.12,
      worldFacingLegs: true,
      armOutwardOffset: 0.11,
    },
    {
      n: 0.77,
      name: "target_locked_rebound",
      intention: "recover only part of the compression while the head and hands stay focused ahead",
      energy: 0.51,
      leading: "Head",
      torsoPosition: [0.14, -0.49, 0.06],
      torsoEuler: [-13.5, -17.5, 4.8],
      headEuler: [3, 12.5, -2.8],
      rightFist: [1.05, -0.03, -1.32],
      leftFist: [-0.88, 0.09, -1.52],
      rightFoot: [0.60, -3, 0.48],
      leftFoot: [-0.72, -3, -0.56],
      lockLimbJoints: true,
      lockArmJoints: true,
      lockLegJoints: false,
      shoulderDrop: 0.10,
      worldFacingLegs: true,
      armOutwardOffset: 0.10,
    },
    {
      n: 1,
      name: "grounded_loop_close",
      intention: "close exactly on the weighted opening pose so the contact and center of mass never pop",
      energy: 0.52,
      leading: "Head",
      torsoPosition: [0.14, -0.50, 0.06],
      torsoEuler: [-14, -18, 5],
      headEuler: [3, 13, -3],
      rightFist: [1.06, -0.04, -1.32],
      leftFist: [-0.88, 0.08, -1.52],
      rightFoot: [0.60, -3, 0.48],
      leftFoot: [-0.72, -3, -0.56],
      lockLimbJoints: true,
      lockArmJoints: true,
      lockLegJoints: false,
      shoulderDrop: 0.10,
      worldFacingLegs: true,
      armOutwardOffset: 0.10,
    },
  ],
};

const predatoryRearStraight: Skill = {
  name: "MD_R6_PredatoryRearStraight_v1",
  duration: 1.05,
  intent:
    "A single exaggerated but mechanically coherent R6 rear-right straight launched from the predatory melee idle: planted rear drive, visible weight transfer, torso-led release, hand-first contact, hit stop, overshoot and guarded recovery",
  contacts: [
    { id: "rear_right_drive", effector: "Right Leg", target: "ground", startTime: 0, endTime: 0.60, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.03 },
    { id: "front_left_receive", effector: "Left Leg", target: "ground", startTime: 0.34, endTime: 0.78, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.04 },
  ],
  phases: [
    {
      n: 0, name: "predatory_idle_match",
      intention: "begin on the exact approved melee silhouette",
      energy: 0.44, leading: "Head",
      torsoPosition: [0.16, -0.42, -0.10], torsoEuler: [-19, -38, 14], headEuler: [12, 34, -10],
      rightFist: [0.28, 0.76, -1.38], leftFist: [-0.58, -0.08, -2.02],
      rightFoot: [0.68, -3, 0.82], leftFoot: [-0.84, -2.82, -0.72], lockLimbJoints: true,
    },
    {
      n: 0.13, name: "target_read_hold",
      intention: "hold still long enough to disguise the release and lock the gaze",
      energy: 0.46, leading: "Head",
      torsoPosition: [0.16, -0.42, -0.10], torsoEuler: [-19, -38, 14], headEuler: [12, 34, -10],
      rightFist: [0.28, 0.76, -1.38], leftFist: [-0.58, -0.08, -2.02],
      rightFoot: [0.68, -3, 0.82], leftFoot: [-0.84, -2.82, -0.72], lockLimbJoints: true,
    },
    {
      n: 0.25, name: "rear_side_compression",
      intention: "compress over the rear right leg without hiding the striking arm behind the torso",
      energy: 0.68, leading: "Right Leg",
      torsoPosition: [0.22, -0.52, -0.02], torsoEuler: [-24, -53, 18], headEuler: [10, 43, -13],
      rightFist: [0.18, 0.58, -1.28], leftFist: [-0.52, 0.08, -1.92],
      rightFoot: [0.70, -3, 0.86], leftFoot: [-0.86, -2.74, -0.76], lockLimbJoints: true,
    },
    {
      n: 0.34, name: "rear_foot_drives_release",
      intention: "start the torso reversal from the planted rear foot while the fist remains fractionally delayed",
      energy: 0.86, leading: "Torso",
      torsoPosition: [0.09, -0.39, -0.20], torsoEuler: [-16, -24, 9], headEuler: [8, 19, -7],
      rightFist: [0.34, 0.72, -1.72], leftFist: [-0.50, 0.30, -1.62],
      rightFoot: [0.69, -3, 0.84], leftFoot: [-0.84, -2.90, -0.80], lockLimbJoints: true,
    },
    {
      n: 0.42, name: "hand_first_impact",
      intention: "transfer onto the forward left leg and let the right fist reach the target before the shoulder line",
      energy: 1, leading: "Right Arm",
      torsoPosition: [-0.10, -0.25, -0.48], torsoEuler: [-8, 20, -5], headEuler: [5, -15, 4],
      rightFist: [0.12, 1.00, -3.36], leftFist: [-0.54, 0.66, -1.18],
      rightFoot: [0.68, -3, 0.82], leftFoot: [-0.82, -3, -0.86], lockLimbJoints: true,
    },
    {
      n: 0.455, name: "impact_hitstop",
      intention: "freeze the extended line for a readable anime impact without relaxing the rear support",
      energy: 1, leading: "Right Arm",
      torsoPosition: [-0.12, -0.26, -0.55], torsoEuler: [-10, 25, -7], headEuler: [6, -19, 5],
      rightFist: [0.08, 1.04, -3.52], leftFist: [-0.56, 0.68, -1.14],
      rightFoot: [0.68, -3, 0.82], leftFoot: [-0.82, -3, -0.86], lockLimbJoints: true,
    },
    {
      n: 0.56, name: "connected_followthrough",
      intention: "allow a short torso overshoot while the fist remains connected to the impact line",
      energy: 0.84, leading: "Torso",
      torsoPosition: [-0.13, -0.29, -0.60], torsoEuler: [-13, 30, -9], headEuler: [7, -22, 6],
      rightFist: [0.06, 0.98, -3.42], leftFist: [-0.58, 0.62, -1.18],
      rightFoot: [0.68, -3, 0.82], leftFoot: [-0.82, -3, -0.84], lockLimbJoints: true,
    },
    {
      n: 0.68, name: "torso_recovers_fist_drags",
      intention: "recover the torso first and let the extended fist trail behind",
      energy: 0.62, leading: "Torso",
      torsoPosition: [-0.04, -0.34, -0.30], torsoEuler: [-14, -7, 3], headEuler: [9, 5, -2],
      rightFist: [0.18, 0.86, -2.18], leftFist: [-0.56, 0.38, -1.48],
      rightFoot: [0.68, -3, 0.82], leftFoot: [-0.83, -2.94, -0.80], lockLimbJoints: true,
    },
    {
      n: 0.82, name: "guard_rebuilds_over_rear_support",
      intention: "return the right hand to threat range while the weight travels back to the rear support",
      energy: 0.48, leading: "Right Leg",
      torsoPosition: [0.10, -0.40, -0.15], torsoEuler: [-18, -29, 10], headEuler: [11, 25, -8],
      rightFist: [0.24, 0.78, -1.54], leftFist: [-0.58, 0.08, -1.92],
      rightFoot: [0.68, -3, 0.82], leftFoot: [-0.84, -2.86, -0.74], lockLimbJoints: true,
    },
    {
      n: 1, name: "predatory_idle_return",
      intention: "close exactly on the melee idle so the strike can chain cleanly",
      energy: 0.44, leading: "Head",
      torsoPosition: [0.16, -0.42, -0.10], torsoEuler: [-19, -38, 14], headEuler: [12, 34, -10],
      rightFist: [0.28, 0.76, -1.38], leftFist: [-0.58, -0.08, -2.02],
      rightFoot: [0.68, -3, 0.82], leftFoot: [-0.84, -2.82, -0.72], lockLimbJoints: true,
    },
  ],
};

const skullBreakerImpactFrame: Skill = {
  name: "MD_R6_SkullBreaker_ImpactFrame_v1",
  duration: 1.2,
  intent:
    "A deceptively simple fatal R6 rear straight: cold target read, compressed rear support, hip-led release, fist-last acceleration, a single extreme skull-height impact frame, two-frame hit stop, connected penetration and guarded recovery",
  contacts: [
    { id: "rear_right_coil", effector: "Right Leg", target: "ground", startTime: 0, endTime: 0.64, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.018 },
    { id: "front_left_receive", effector: "Left Leg", target: "ground", startTime: 0.36, endTime: 0.88, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.024 },
  ],
  phases: [
    {
      n: 0, name: "cold_kill_guard", intention: "begin quiet and grounded so the final violence has maximum contrast", energy: 0.28, leading: "Head",
      torsoPosition: [0.12, -0.38, -0.08], torsoEuler: [-16, -30, 10], headEuler: [9, 27, -7],
      rightFist: [0.36, 0.62, -1.42], leftFist: [-0.54, 0.20, -1.78],
      rightFoot: [0.68, -3, 0.72], leftFoot: [-0.80, -2.96, -0.66], lockLimbJoints: true,
    },
    {
      n: 0.15, name: "target_read", intention: "hold the eyes and hands still; do not announce the strike with the arm", energy: 0.31, leading: "Head",
      torsoPosition: [0.12, -0.39, -0.08], torsoEuler: [-16, -31, 10], headEuler: [9, 28, -7],
      rightFist: [0.36, 0.62, -1.42], leftFist: [-0.54, 0.20, -1.78],
      rightFoot: [0.68, -3, 0.72], leftFoot: [-0.80, -2.96, -0.66], lockLimbJoints: true,
    },
    {
      n: 0.31, name: "rear_mass_compression", intention: "lower the pelvis over the rear support while the striking fist remains in front of the ribs", energy: 0.62, leading: "Right Leg",
      torsoPosition: [0.20, -0.55, 0.04], torsoEuler: [-23, -49, 16], headEuler: [11, 40, -11],
      rightFist: [0.25, 0.50, -1.30], leftFist: [-0.50, 0.22, -1.82],
      rightFoot: [0.70, -3, 0.78], leftFoot: [-0.82, -2.88, -0.70], lockLimbJoints: true,
    },
    {
      n: 0.40, name: "hip_breaks_the_seal", intention: "rear foot and pelvis reverse first while the right fist is still visibly delayed", energy: 0.82, leading: "Torso",
      torsoPosition: [0.08, -0.43, -0.16], torsoEuler: [-17, -22, 8], headEuler: [8, 18, -6],
      rightFist: [0.34, 0.58, -1.58], leftFist: [-0.48, 0.34, -1.58],
      rightFoot: [0.70, -3, 0.76], leftFoot: [-0.82, -2.96, -0.72], lockLimbJoints: true,
    },
    {
      n: 0.46, name: "shoulder_release", intention: "chest crosses the support line and opens a straight skull-height lane", energy: 0.94, leading: "Torso",
      torsoPosition: [-0.02, -0.32, -0.34], torsoEuler: [-11, 8, 0], headEuler: [6, -6, 1],
      rightFist: [0.26, 0.80, -2.30], leftFist: [-0.50, 0.54, -1.28],
      rightFoot: [0.69, -3, 0.74], leftFoot: [-0.82, -3, -0.76], lockLimbJoints: true,
    },
    {
      n: 0.49, name: "preimpact_acceleration", intention: "place the fist one frame outside contact while the torso is already committed", energy: 0.99, leading: "Right Arm",
      torsoPosition: [-0.10, -0.27, -0.48], torsoEuler: [-8, 21, -4], headEuler: [5, -16, 4],
      rightFist: [0.14, 1.05, -3.18], leftFist: [-0.53, 0.68, -1.10],
      rightFoot: [0.68, -3, 0.72], leftFoot: [-0.82, -3, -0.78], lockLimbJoints: true,
    },
    {
      n: 0.505, name: "skull_breaker_impact_frame", intention: "one extreme frame: fist reaches first at skull height as the entire body forms one force line from rear foot to knuckles", energy: 1, leading: "Right Arm",
      torsoPosition: [-0.16, -0.23, -0.61], torsoEuler: [-6, 31, -8], headEuler: [5, -24, 6],
      rightFist: [0.02, 1.22, -3.68], leftFist: [-0.58, 0.72, -1.02],
      rightFoot: [0.68, -3, 0.72], leftFoot: [-0.82, -3, -0.80], lockLimbJoints: true,
    },
    {
      n: 0.535, name: "fatal_hitstop", intention: "hold the lethal hand-first silhouette for two authored frames without relaxing either support", energy: 1, leading: "Right Arm",
      torsoPosition: [-0.17, -0.24, -0.64], torsoEuler: [-7, 33, -9], headEuler: [5, -25, 7],
      rightFist: [0.00, 1.23, -3.72], leftFist: [-0.59, 0.71, -1.00],
      rightFoot: [0.68, -3, 0.72], leftFoot: [-0.82, -3, -0.80], lockLimbJoints: true,
    },
    {
      n: 0.62, name: "connected_penetration", intention: "let the shoulder and torso pass a fraction farther while the fist stays on the impact line", energy: 0.88, leading: "Torso",
      torsoPosition: [-0.20, -0.29, -0.70], torsoEuler: [-12, 38, -11], headEuler: [7, -28, 8],
      rightFist: [-0.04, 1.16, -3.62], leftFist: [-0.62, 0.62, -1.08],
      rightFoot: [0.68, -3, 0.72], leftFoot: [-0.82, -3, -0.78], lockLimbJoints: true,
    },
    {
      n: 0.74, name: "same_lane_recoil", intention: "withdraw the fist on its attack lane before unwinding the hips", energy: 0.62, leading: "Right Arm",
      torsoPosition: [-0.08, -0.34, -0.38], torsoEuler: [-14, 10, 1], headEuler: [8, -7, 0],
      rightFist: [0.18, 0.86, -2.20], leftFist: [-0.58, 0.42, -1.40],
      rightFoot: [0.68, -3, 0.72], leftFoot: [-0.82, -2.98, -0.74], lockLimbJoints: true,
    },
    {
      n: 0.88, name: "weight_returns", intention: "rebuild the guard while mass returns toward the rear support", energy: 0.43, leading: "Right Leg",
      torsoPosition: [0.06, -0.39, -0.16], torsoEuler: [-16, -20, 7], headEuler: [9, 17, -5],
      rightFist: [0.30, 0.66, -1.58], leftFist: [-0.56, 0.26, -1.68],
      rightFoot: [0.68, -3, 0.72], leftFoot: [-0.81, -2.96, -0.69], lockLimbJoints: true,
    },
    {
      n: 1, name: "cold_guard_return", intention: "finish in the same calm threat rather than celebrating the force", energy: 0.3, leading: "Head",
      torsoPosition: [0.12, -0.38, -0.08], torsoEuler: [-16, -30, 10], headEuler: [9, 27, -7],
      rightFist: [0.36, 0.62, -1.42], leftFist: [-0.54, 0.20, -1.78],
      rightFoot: [0.68, -3, 0.72], leftFoot: [-0.80, -2.96, -0.66], lockLimbJoints: true,
    },
  ],
};

const skullBreakerUppercut: Skill = {
  name: "MD_R6_SkullBreaker_Uppercut_ImpactFrame_v2",
  duration: 1.32,
  intent:
    "A fatal cinematic R6 uppercut built as one rising force chain: cold guard, deep rear-leg compression, fist lowered in front of the ribs, legs and hips launching first, diagonal hand-first skull impact, two-frame hit stop, vertical overshoot and same-arc recovery",
  contacts: [
    { id: "rear_right_spring", effector: "Right Leg", target: "ground", startTime: 0, endTime: 0.60, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.016 },
    { id: "front_left_axis", effector: "Left Leg", target: "ground", startTime: 0, endTime: 0.84, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.020 },
  ],
  phases: [
    {
      n: 0, name: "cold_uppercut_guard", intention: "hold a compact threat with the right fist already in front of the body", energy: 0.28, leading: "Head",
      torsoPosition: [0.10, -0.38, -0.08], torsoEuler: [-15, -28, 9], headEuler: [8, 25, -6],
      rightFist: [0.34, 0.58, -1.42], leftFist: [-0.54, 0.25, -1.72],
      rightFoot: [0.68, -3, 0.74], leftFoot: [-0.80, -2.98, -0.66], lockLimbJoints: true,
    },
    {
      n: 0.14, name: "silent_target_read", intention: "delay the attack with still eyes and shoulders", energy: 0.30, leading: "Head",
      torsoPosition: [0.10, -0.39, -0.08], torsoEuler: [-15, -29, 9], headEuler: [8, 26, -6],
      rightFist: [0.34, 0.58, -1.42], leftFist: [-0.54, 0.25, -1.72],
      rightFoot: [0.68, -3, 0.74], leftFoot: [-0.80, -2.98, -0.66], lockLimbJoints: true,
    },
    {
      n: 0.30, name: "deep_spring_compression", intention: "drop the pelvis between the supports and lower the right fist in front of the ribs, never behind the torso", energy: 0.65, leading: "Right Leg",
      torsoPosition: [0.18, -0.67, 0.05], torsoEuler: [-26, -43, 15], headEuler: [13, 35, -10],
      rightFist: [0.30, -0.16, -1.24], leftFist: [-0.50, 0.25, -1.80],
      rightFoot: [0.70, -3, 0.80], leftFoot: [-0.82, -2.92, -0.70], lockLimbJoints: true,
    },
    {
      n: 0.39, name: "fist_scoops_under_lane", intention: "seat the fist under the target lane while both legs remain visibly loaded", energy: 0.76, leading: "Torso",
      torsoPosition: [0.17, -0.64, -0.02], torsoEuler: [-24, -35, 12], headEuler: [12, 29, -8],
      rightFist: [0.28, -0.24, -1.48], leftFist: [-0.49, 0.32, -1.68],
      rightFoot: [0.70, -3, 0.80], leftFoot: [-0.82, -2.94, -0.72], lockLimbJoints: true,
    },
    {
      n: 0.455, name: "legs_launch_hips", intention: "extend from the floor and send the pelvis upward before the fist accelerates", energy: 0.89, leading: "Right Leg",
      torsoPosition: [0.08, -0.43, -0.20], torsoEuler: [-17, -12, 4], headEuler: [9, 10, -3],
      rightFist: [0.26, 0.08, -1.70], leftFist: [-0.50, 0.43, -1.50],
      rightFoot: [0.69, -3, 0.78], leftFoot: [-0.82, -3, -0.76], lockLimbJoints: true,
    },
    {
      n: 0.495, name: "preimpact_rising_acceleration", intention: "fist passes the chest on a diagonal while the body is already rising through it", energy: 0.98, leading: "Right Arm",
      torsoPosition: [-0.02, -0.22, -0.38], torsoEuler: [-10, 14, -4], headEuler: [4, -10, 3],
      rightFist: [0.16, 0.74, -2.20], leftFist: [-0.54, 0.62, -1.22],
      rightFoot: [0.68, -3, 0.76], leftFoot: [-0.82, -3, -0.78], lockLimbJoints: true,
    },
    {
      n: 0.515, name: "skull_breaker_uppercut_impact", intention: "one decisive impact frame: knuckles enter beneath the jaw as rear foot, hip, shoulder and fist form one rising diagonal", energy: 1, leading: "Right Arm",
      torsoPosition: [-0.13, -0.04, -0.53], torsoEuler: [-4, 29, -10], headEuler: [-2, -22, 7],
      rightFist: [0.02, 1.62, -2.72], leftFist: [-0.60, 0.78, -1.04],
      rightFoot: [0.68, -3, 0.74], leftFoot: [-0.82, -3, -0.80], lockLimbJoints: true,
    },
    {
      n: 0.545, name: "uppercut_hitstop", intention: "hold the stretched rising silhouette for two frames without losing the grounded support", energy: 1, leading: "Right Arm",
      torsoPosition: [-0.14, -0.01, -0.56], torsoEuler: [-3, 31, -11], headEuler: [-3, -24, 8],
      rightFist: [0.00, 1.68, -2.76], leftFist: [-0.61, 0.80, -1.02],
      rightFoot: [0.68, -3, 0.74], leftFoot: [-0.82, -3, -0.80], lockLimbJoints: true,
    },
    {
      n: 0.63, name: "vertical_overshoot", intention: "let chest and shoulder rise past contact while the fist remains above the target", energy: 0.87, leading: "Torso",
      torsoPosition: [-0.16, 0.04, -0.58], torsoEuler: [2, 35, -13], headEuler: [-5, -26, 9],
      rightFist: [-0.03, 1.82, -2.64], leftFist: [-0.63, 0.72, -1.08],
      rightFoot: [0.68, -3, 0.74], leftFoot: [-0.82, -3, -0.78], lockLimbJoints: true,
    },
    {
      n: 0.75, name: "same_arc_drop", intention: "bring the fist down the same diagonal before the torso fully recoils", energy: 0.62, leading: "Right Arm",
      torsoPosition: [-0.05, -0.20, -0.34], torsoEuler: [-9, 8, 0], headEuler: [4, -5, 0],
      rightFist: [0.16, 0.78, -2.02], leftFist: [-0.58, 0.48, -1.36],
      rightFoot: [0.68, -3, 0.74], leftFoot: [-0.82, -2.99, -0.74], lockLimbJoints: true,
    },
    {
      n: 0.89, name: "spring_recompresses", intention: "lower back into the fighting base and rebuild both hands ahead of the torso", energy: 0.43, leading: "Right Leg",
      torsoPosition: [0.06, -0.40, -0.15], torsoEuler: [-15, -18, 6], headEuler: [8, 15, -4],
      rightFist: [0.29, 0.58, -1.58], leftFist: [-0.56, 0.31, -1.62],
      rightFoot: [0.68, -3, 0.74], leftFoot: [-0.81, -2.97, -0.69], lockLimbJoints: true,
    },
    {
      n: 1, name: "cold_uppercut_return", intention: "return to calm threat without a celebratory recovery", energy: 0.29, leading: "Head",
      torsoPosition: [0.10, -0.38, -0.08], torsoEuler: [-15, -28, 9], headEuler: [8, 25, -6],
      rightFist: [0.34, 0.58, -1.42], leftFist: [-0.54, 0.25, -1.72],
      rightFoot: [0.68, -3, 0.74], leftFoot: [-0.80, -2.98, -0.66], lockLimbJoints: true,
    },
  ],
};

const tsbInspiredSkullBreakerUppercut: Skill = {
  name: "MD_R6_SkullBreaker_ChargedFromBelowUppercut_v4",
  duration: 1.6,
  intent:
    "An unmistakably vertical charged skull-breaker uppercut: the fist travels from knee height, pauses below the ribs, remains delayed during leg drive, then cuts close to the body from floor to jaw before carrying the attacker into the air",
  contacts: [
    { id: "launch_base", effector: "Right Leg", target: "ground", startTime: 0, endTime: 0.53, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.018 },
    { id: "lead_axis", effector: "Left Leg", target: "ground", startTime: 0, endTime: 0.55, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.018 },
    { id: "landing", effector: "Left Leg", target: "ground", startTime: 1.10, endTime: 1.44, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.026 },
  ],
  phases: [
    {
      n: 0, name: "tsb_cold_ready", intention: "stay compact and unreadable before the exaggerated game-style release", energy: 0.27, leading: "Head",
      torsoPosition: [0.08, -0.34, -0.10], torsoEuler: [-14, -24, 8], headEuler: [7, 21, -5],
      rightFist: [0.34, 0.55, -1.36], leftFist: [-0.52, 0.30, -1.64],
      rightFoot: [0.67, -3, 0.70], leftFoot: [-0.79, -2.99, -0.64], lockLimbJoints: true,
    },
    {
      n: 0.14, name: "fist_drops_beside_thigh", intention: "send the fist visibly below the waist and outside the thigh while keeping the shoulder connected", energy: 0.52, leading: "Right Arm",
      torsoPosition: [0.17, -0.50, 0.02], torsoEuler: [-21, -43, 15], headEuler: [10, 35, -9],
      rightFist: [0.62, -0.78, -0.56], leftFist: [-0.48, 0.30, -1.72],
      rightFoot: [0.69, -3, 0.76], leftFoot: [-0.81, -2.95, -0.68], lockLimbJoints: true, shoulderDrop: 0.18,
    },
    {
      n: 0.28, name: "knee_height_crater_load", intention: "collapse the pelvis and charge the fist beside the knee so the audience reads a true bottom-to-top attack", energy: 0.72, leading: "Right Leg",
      torsoPosition: [0.22, -0.96, 0.08], torsoEuler: [-36, -50, 19], headEuler: [18, 39, -12],
      rightFist: [0.48, -1.48, -0.72], leftFist: [-0.44, 0.06, -1.72],
      rightFoot: [0.70, -3, 0.80], leftFoot: [-0.82, -2.92, -0.71], lockLimbJoints: true, shoulderDrop: 0.25,
    },
    {
      n: 0.40, name: "charged_bottom_hold", intention: "hold the hand near the knee for a final instant while the hips begin to rebound upward", energy: 0.84, leading: "Right Leg",
      torsoPosition: [0.16, -0.78, -0.06], torsoEuler: [-29, -34, 11], headEuler: [14, 27, -7],
      rightFist: [0.44, -1.38, -0.86], leftFist: [-0.48, 0.20, -1.58],
      rightFoot: [0.69, -3, 0.77], leftFoot: [-0.82, -3, -0.75], lockLimbJoints: true, shoulderDrop: 0.22,
    },
    {
      n: 0.455, name: "vertical_release_below_chest", intention: "legs and hips rise first; the fist only begins climbing and stays close to the body's vertical centerline", energy: 0.94, leading: "Right Leg",
      torsoPosition: [0.04, -0.42, -0.22], torsoEuler: [-18, -9, 3], headEuler: [8, 7, -2],
      rightFist: [0.26, -0.42, -1.18], leftFist: [-0.54, 0.40, -1.36],
      rightFoot: [0.68, -3, 0.74], leftFoot: [-0.82, -3, -0.78], lockLimbJoints: true, shoulderDrop: 0.10,
    },
    {
      n: 0.495, name: "under_chin_acceleration", intention: "fist passes the chest vertically with almost no forward jab component", energy: 0.99, leading: "Right Arm",
      torsoPosition: [-0.04, -0.20, -0.36], torsoEuler: [-10, 13, -4], headEuler: [3, -10, 3],
      rightFist: [0.12, 0.78, -1.55], leftFist: [-0.60, 0.54, -1.18],
      rightFoot: [0.68, -3, 0.73], leftFoot: [-0.82, -3, -0.79], lockLimbJoints: true,
    },
    {
      n: 0.525, name: "vertical_skull_impact", intention: "impact directly beneath the jaw at the top of a long floor-to-chin arc, with both feet still sourcing the force", energy: 1, leading: "Right Arm",
      torsoPosition: [-0.12, 0.02, -0.43], torsoEuler: [-2, 29, -11], headEuler: [-5, -22, 8],
      rightFist: [0.00, 2.02, -1.86], leftFist: [-0.70, 0.62, -0.98],
      rightFoot: [0.68, -3, 0.72], leftFoot: [-0.82, -3, -0.80], lockLimbJoints: true,
    },
    {
      n: 0.55, name: "impact_freeze_before_launch", intention: "hold the grounded vertical impact before following the target upward", energy: 1, leading: "Right Arm",
      torsoPosition: [-0.13, 0.04, -0.45], torsoEuler: [-1, 31, -12], headEuler: [-6, -24, 9],
      rightFist: [-0.02, 2.08, -1.88], leftFist: [-0.72, 0.62, -0.96],
      rightFoot: [0.68, -3, 0.72], leftFoot: [-0.82, -3, -0.80], lockLimbJoints: true,
    },
    {
      n: 0.62, name: "attacker_follows_into_air", intention: "break both foot contacts and extend the whole body behind the vertical fist path", energy: 0.96, leading: "Torso",
      torsoPosition: [-0.13, 0.62, -0.62], torsoEuler: [5, 35, -14], headEuler: [-7, -27, 10],
      rightFist: [-0.06, 2.72, -1.82], leftFist: [-0.78, 0.34, -0.78],
      rightFoot: [0.48, -2.28, 0.38], leftFoot: [-0.58, -2.18, -0.30], lockLimbJoints: true,
    },
    {
      n: 0.71, name: "star_launch_apex", intention: "reach the tallest, cleanest upward silhouette: fist leading directly above the loaded knee line", energy: 0.88, leading: "Right Arm",
      torsoPosition: [-0.10, 1.02, -0.60], torsoEuler: [10, 31, -13], headEuler: [-8, -23, 9],
      rightFist: [-0.08, 3.08, -1.70], leftFist: [-0.86, 0.18, -0.62],
      rightFoot: [0.36, -1.72, 0.18], leftFoot: [-0.48, -1.64, -0.12], lockLimbJoints: true,
    },
    {
      n: 0.81, name: "airborne_fold", intention: "fold the knees and lower the fist only after the apex has read clearly", energy: 0.66, leading: "Torso",
      torsoPosition: [-0.04, 0.70, -0.45], torsoEuler: [3, 10, -3], headEuler: [-1, -6, 2],
      rightFist: [0.10, 1.55, -2.06], leftFist: [-0.68, 0.22, -0.92],
      rightFoot: [0.42, -1.88, 0.42], leftFoot: [-0.52, -1.78, -0.36], lockLimbJoints: true,
    },
    {
      n: 0.90, name: "descending_guard", intention: "bring both feet under the center of mass while the hands begin rebuilding protection", energy: 0.52, leading: "Left Leg",
      torsoPosition: [0.02, 0.20, -0.26], torsoEuler: [-7, -8, 2], headEuler: [4, 7, -2],
      rightFist: [0.22, 0.78, -1.72], leftFist: [-0.58, 0.28, -1.32],
      rightFoot: [0.54, -2.56, 0.34], leftFoot: [-0.66, -2.50, -0.30], lockLimbJoints: true,
    },
    {
      n: 0.965, name: "crater_landing", intention: "land low and absorb the fall through hips and both legs instead of snapping directly to idle", energy: 0.58, leading: "Left Leg",
      torsoPosition: [0.08, -0.56, -0.12], torsoEuler: [-22, -18, 6], headEuler: [11, 15, -4],
      rightFist: [0.30, 0.46, -1.42], leftFist: [-0.54, 0.18, -1.54],
      rightFoot: [0.67, -3, 0.68], leftFoot: [-0.79, -3, -0.64], lockLimbJoints: true,
    },
    {
      n: 1, name: "tsb_cold_return", intention: "settle only partway toward neutral so the ending retains threat", energy: 0.32, leading: "Head",
      torsoPosition: [0.08, -0.34, -0.10], torsoEuler: [-14, -24, 8], headEuler: [7, 21, -5],
      rightFist: [0.34, 0.55, -1.36], leftFist: [-0.52, 0.30, -1.64],
      rightFoot: [0.67, -3, 0.70], leftFoot: [-0.79, -2.99, -0.64], lockLimbJoints: true,
    },
  ],
};

const skullBreakerUppercutVictim: Skill = {
  name: "MD_R6_SkullBreaker_UppercutVictimReaction_v1",
  duration: 1.6,
  intent:
    "A synchronized R6 victim reaction for ChargedFromBelowUppercut v4: no anticipation, jaw-first contact at 0.84 seconds, head snap, chest delay, two-frame impact hold, feet leaving last, vertically stretched launch, trailing limbs, backward arch and an airborne star-exit ending",
  contacts: [
    { id: "victim_feet_before_hit", effector: "Left Leg", target: "ground", startTime: 0, endTime: 0.88, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.012 },
    { id: "victim_rear_support_before_hit", effector: "Right Leg", target: "ground", startTime: 0, endTime: 0.88, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.012 },
  ],
  phases: [
    {
      n: 0, name: "unaware_target_stance", intention: "remain readable and quiet so the reaction begins only when the fist arrives", energy: 0.18, leading: "Head",
      torsoPosition: [0, -0.10, 0], torsoEuler: [-3, 2, 0], headEuler: [2, -1, 0],
      rightFist: [0.72, -0.42, -0.28], leftFist: [-0.72, -0.42, -0.28],
      rightFoot: [0.58, -3, 0.08], leftFoot: [-0.58, -3, -0.08], lockLimbJoints: true, allowTrailingArms: true,
    },
    {
      n: 0.46, name: "unaware_hold", intention: "do not telegraph knowledge of the incoming uppercut", energy: 0.18, leading: "Head",
      torsoPosition: [0, -0.10, 0], torsoEuler: [-3, 2, 0], headEuler: [2, -1, 0],
      rightFist: [0.72, -0.42, -0.28], leftFist: [-0.72, -0.42, -0.28],
      rightFoot: [0.58, -3, 0.08], leftFoot: [-0.58, -3, -0.08], lockLimbJoints: true,
    },
    {
      n: 0.505, name: "jaw_contact_warning", intention: "allow only a tiny chin lift one frame before the full transfer", energy: 0.44, leading: "Head",
      torsoPosition: [0, -0.08, 0.02], torsoEuler: [-2, 1, 0], headEuler: [-7, -1, 1],
      rightFist: [0.72, -0.44, -0.26], leftFist: [-0.72, -0.44, -0.26],
      rightFoot: [0.58, -3, 0.08], leftFoot: [-0.58, -3, -0.08], lockLimbJoints: true,
    },
    {
      n: 0.525, name: "jaw_first_impact", intention: "jaw and head snap upward first while chest, shoulders, arms and feet still resist below", energy: 1, leading: "Head",
      torsoPosition: [0.01, 0.02, 0.12], torsoEuler: [10, -2, 2], headEuler: [-34, 3, -5],
      rightFist: [0.80, -0.62, 0.02], leftFist: [-0.78, -0.58, -0.04],
      rightFoot: [0.58, -3, 0.08], leftFoot: [-0.58, -3, -0.08], lockLimbJoints: true,
    },
    {
      n: 0.55, name: "impact_hold_body_lag", intention: "hold the broken-neck line while the torso has only begun following the head", energy: 1, leading: "Head",
      torsoPosition: [0.02, 0.08, 0.20], torsoEuler: [17, -3, 3], headEuler: [-43, 4, -7],
      rightFist: [0.88, -0.72, 0.18], leftFist: [-0.84, -0.66, 0.10],
      rightFoot: [0.58, -2.98, 0.08], leftFoot: [-0.58, -2.98, -0.08], lockLimbJoints: true, allowTrailingArms: true,
    },
    {
      n: 0.61, name: "feet_leave_last", intention: "chest accelerates upward, arms drag below it and both feet finally peel away from the floor", energy: 0.96, leading: "Torso",
      torsoPosition: [0.03, 0.72, 0.42], torsoEuler: [25, -4, 4], headEuler: [-39, 5, -7],
      rightFist: [0.94, -0.18, 0.34], leftFist: [-0.90, -0.12, 0.26],
      rightFoot: [0.54, -2.42, 0.18], leftFoot: [-0.54, -2.36, -0.16], lockLimbJoints: true, allowTrailingArms: true,
    },
    {
      n: 0.70, name: "vertical_whiplash_stretch", intention: "head leads the airborne body while arms and legs form a long delayed trail", energy: 0.9, leading: "Head",
      torsoPosition: [0.04, 1.72, 0.70], torsoEuler: [34, -5, 5], headEuler: [-31, 5, -6],
      rightFist: [1.00, 0.52, 0.50], leftFist: [-0.96, 0.60, 0.42],
      rightFoot: [0.46, -1.48, 0.34], leftFoot: [-0.44, -1.38, -0.28], lockLimbJoints: true, allowTrailingArms: true,
    },
    {
      n: 0.80, name: "backward_arch_follows", intention: "torso catches the head and arches backward while the limbs remain one beat late", energy: 0.78, leading: "Torso",
      torsoPosition: [0.05, 2.72, 0.98], torsoEuler: [48, -6, 7], headEuler: [-20, 4, -5],
      rightFist: [1.08, 1.34, 0.64], leftFist: [-1.02, 1.42, 0.56],
      rightFoot: [0.38, -0.48, 0.52], leftFoot: [-0.34, -0.38, -0.42], lockLimbJoints: true, allowTrailingArms: true,
    },
    {
      n: 0.90, name: "star_exit_silhouette", intention: "reduce the victim to a clean launched silhouette with head highest and extremities trailing apart", energy: 0.66, leading: "Head",
      torsoPosition: [0.04, 3.75, 1.24], torsoEuler: [58, -8, 8], headEuler: [-12, 4, -4],
      rightFist: [1.12, 2.26, 0.72], leftFist: [-1.08, 2.34, 0.64],
      rightFoot: [0.30, 0.52, 0.66], leftFoot: [-0.26, 0.64, -0.54], lockLimbJoints: true, allowTrailingArms: true,
    },
    {
      n: 1, name: "launched_out_of_scene", intention: "finish still travelling upward so gameplay can continue the knockback without a pose pop", energy: 0.58, leading: "Torso",
      torsoPosition: [0.02, 4.70, 1.48], torsoEuler: [66, -10, 9], headEuler: [-8, 3, -3],
      rightFist: [1.08, 3.18, 0.74], leftFist: [-1.04, 3.26, 0.68],
      rightFoot: [0.24, 1.44, 0.76], leftFoot: [-0.20, 1.58, -0.62], lockLimbJoints: true, allowTrailingArms: true,
    },
  ],
};

const skullBreakerVictimBackflipRecovery: Skill = {
  name: "MD_R6_SkullBreaker_UppercutVictim_BackflipRecovery_v2",
  duration: 3.2,
  intent:
    "The synchronized skull-breaker victim reaction extended into an airborne recovery: unchanged 0.84-second jaw impact, vertical launch, apex recognition, compact backward rotation, full backflip during descent, anticipatory opening, grounded two-foot landing compression, overshoot and recovered combat stance",
  contacts: [
    ...skullBreakerUppercutVictim.contacts,
    { id: "backflip_landing_left", effector: "Left Leg", target: "ground", startTime: 2.72, endTime: 3.2, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.028 },
    { id: "backflip_landing_right", effector: "Right Leg", target: "ground", startTime: 2.76, endTime: 3.2, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.028 },
  ],
  phases: [
    // Preserve every pose and absolute time from the 1.6-second hit reaction.
    ...skullBreakerUppercutVictim.phases.map((phase) => ({ ...phase, n: phase.n * 0.5 })),
    {
      n: 1.84 / 3.2, name: "launch_apex_hangs", intention: "let upward speed exhaust before rotation accelerates so the apex remains readable", energy: 0.52, leading: "Head",
      torsoPosition: [0.00, 5.20, 1.60], torsoEuler: [92, -10, 8], headEuler: [-10, 3, -3],
      rightFist: [0.92, 4.16, 0.84], leftFist: [-0.88, 4.22, 0.76],
      rightFoot: [0.18, 2.16, 0.90], leftFoot: [-0.16, 2.28, -0.74], lockLimbJoints: true, allowTrailingArms: true,
    },
    {
      n: 2.06 / 3.2, name: "backflip_tuck_begins", intention: "pull hands and feet toward the torso to convert the backward arch into controlled rotation", energy: 0.66, leading: "Torso",
      torsoPosition: [0.00, 4.82, 1.66], torsoEuler: [138, -8, 6], headEuler: [-13, 2, -2],
      rightFist: [0.54, 4.38, 1.24], leftFist: [-0.50, 4.42, 1.18],
      rightFoot: [0.40, 3.72, 1.58], leftFoot: [-0.36, 3.78, 1.46], lockLimbJoints: true, allowTrailingArms: true,
    },
    {
      n: 2.28 / 3.2, name: "backflip_inverted_tuck", intention: "cross the inverted phase compactly with hips and knees leading the circular silhouette", energy: 0.74, leading: "Torso",
      torsoPosition: [0.00, 3.92, 1.58], torsoEuler: [202, -5, 4], headEuler: [-10, 1, -1],
      rightFist: [0.46, 3.66, 1.52], leftFist: [-0.44, 3.70, 1.46],
      rightFoot: [0.46, 4.72, 1.32], leftFoot: [-0.42, 4.78, 1.22], lockLimbJoints: true, allowTrailingArms: true,
    },
    {
      n: 2.48 / 3.2, name: "backflip_rotation_releases", intention: "open the hips after inversion and begin aiming both feet toward the landing plane", energy: 0.70, leading: "Right Leg",
      torsoPosition: [0.00, 2.68, 1.30], torsoEuler: [270, -3, 3], headEuler: [-6, 1, 0],
      rightFist: [0.68, 2.88, 1.14], leftFist: [-0.64, 2.92, 1.08],
      rightFoot: [0.52, 2.02, 0.82], leftFoot: [-0.50, 2.08, 0.72], lockLimbJoints: true, allowTrailingArms: true,
    },
    {
      n: 2.575 / 3.2, name: "legs_open_through_arc", intention: "route both feet through a readable intermediate arc so the landing extension never flips a leg axially", energy: 0.67, leading: "Right Leg",
      torsoPosition: [0.00, 1.92, 1.08], torsoEuler: [304, -2, 2], headEuler: [-1, 1, 0],
      rightFist: [0.82, 2.08, 0.78], leftFist: [-0.78, 2.14, 0.72],
      rightFoot: [0.58, 0.18, 0.54], leftFoot: [-0.58, 0.28, 0.42], lockLimbJoints: true, allowTrailingArms: true,
    },
    {
      n: 2.67 / 3.2, name: "feet_search_for_ground", intention: "finish nearly all rotation in the air, widen the feet and use the arms to brake before contact", energy: 0.62, leading: "Left Leg",
      torsoPosition: [0.00, 1.12, 0.82], torsoEuler: [334, -2, 2], headEuler: [3, 1, 0],
      rightFist: [0.92, 0.88, 0.42], leftFist: [-0.88, 0.94, 0.36],
      rightFoot: [0.62, -1.98, 0.28], leftFoot: [-0.64, -1.90, -0.22], lockLimbJoints: true, allowTrailingArms: true,
    },
    {
      n: 2.78 / 3.2, name: "two_foot_backflip_contact", intention: "touch down after completing the full rotation, feet apart and center of mass already descending between them", energy: 0.78, leading: "Left Leg",
      torsoPosition: [0.00, -0.20, 0.32], torsoEuler: [358, -2, 1], headEuler: [8, 1, 0],
      rightFist: [0.84, -0.02, -0.12], leftFist: [-0.82, 0.02, -0.16],
      rightFoot: [0.68, -3, 0.18], leftFoot: [-0.70, -3, -0.18], lockLimbJoints: true,
    },
    {
      n: 2.90 / 3.2, name: "landing_weight_absorption", intention: "sink hips and shoulders deeply while the feet remain planted, turning the fall into visible weight", energy: 0.64, leading: "Torso",
      torsoPosition: [0.02, -0.72, 0.18], torsoEuler: [374, -8, 3], headEuler: [13, 6, -2],
      rightFist: [0.68, -0.30, -0.54], leftFist: [-0.66, -0.26, -0.58],
      rightFoot: [0.68, -3, 0.18], leftFoot: [-0.70, -3, -0.18], lockLimbJoints: true,
    },
    {
      n: 3.04 / 3.2, name: "landing_rebound", intention: "rise only partway from compression and rebuild the head and hands before straightening the legs", energy: 0.46, leading: "Head",
      torsoPosition: [0.04, -0.38, 0.10], torsoEuler: [365, -12, 4], headEuler: [8, 10, -3],
      rightFist: [0.52, 0.28, -1.18], leftFist: [-0.54, 0.32, -1.16],
      rightFoot: [0.68, -3, 0.18], leftFoot: [-0.70, -3, -0.18], lockLimbJoints: true,
    },
    {
      n: 1, name: "backflip_recovery_guard", intention: "finish grounded and combat-ready with residual asymmetry instead of snapping to neutral", energy: 0.34, leading: "Head",
      torsoPosition: [0.05, -0.24, 0.04], torsoEuler: [360, -14, 4], headEuler: [6, 11, -3],
      rightFist: [0.48, 0.46, -1.34], leftFist: [-0.56, 0.42, -1.30],
      rightFoot: [0.68, -3, 0.20], leftFoot: [-0.70, -3, -0.20], lockLimbJoints: true,
    },
  ],
};

const predatoryCrossBlock: Skill = {
  name: "MD_R6_PredatoryCrossBlock_v1",
  duration: 0.9,
  intent:
    "A readable full-body R6 high cross-block: the forearms meet in front of the face, the chin hides behind the barrier, the stance widens, the rear support remains grounded and the torso yields under impact instead of posing only with the arms",
  contacts: [
    { id: "rear_right_brace", effector: "Right Leg", target: "ground", startTime: 0, endTime: 0.9, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.02 },
    { id: "front_left_brace", effector: "Left Leg", target: "ground", startTime: 0, endTime: 0.9, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.03 },
  ],
  phases: [
    {
      n: 0, name: "melee_idle_source", intention: "start from the approved asymmetric fighting base", energy: 0.44, leading: "Head",
      torsoPosition: [0.16, -0.42, -0.10], torsoEuler: [-19, -38, 14], headEuler: [12, 34, -10],
      rightFist: [0.28, 0.76, -1.38], leftFist: [-0.58, -0.08, -2.02],
      rightFoot: [0.68, -3, 0.82], leftFoot: [-0.84, -2.82, -0.72], lockLimbJoints: true,
    },
    {
      n: 0.16, name: "threat_read", intention: "see the incoming strike before the hands move and begin lowering the center of mass", energy: 0.58, leading: "Head",
      torsoPosition: [0.12, -0.50, -0.08], torsoEuler: [-22, -31, 11], headEuler: [15, 25, -7],
      rightFist: [0.22, 0.80, -1.42], leftFist: [-0.52, 0.05, -1.94],
      rightFoot: [0.70, -3, 0.84], leftFoot: [-0.88, -2.92, -0.76], lockLimbJoints: true,
    },
    {
      n: 0.28, name: "forearms_intercept", intention: "snap both forearms into a broad X in front of the face while keeping the head readable behind it", energy: 0.9, leading: "Right Arm",
      torsoPosition: [0.04, -0.56, -0.02], torsoEuler: [-25, -14, 4], headEuler: [18, 9, -2],
      rightFist: [-0.34, 1.10, -1.62], leftFist: [0.38, 0.88, -1.72],
      rightFoot: [0.72, -3, 0.86], leftFoot: [-0.92, -3, -0.80], lockLimbJoints: true,
    },
    {
      n: 0.37, name: "impact_compression", intention: "absorb the collision through the crossed arms, torso and both legs instead of letting the shoulders collapse independently", energy: 1, leading: "Torso",
      torsoPosition: [0.02, -0.66, 0.12], torsoEuler: [-31, -10, 2], headEuler: [22, 6, -1],
      rightFist: [-0.28, 1.02, -1.42], leftFist: [0.32, 0.82, -1.50],
      rightFoot: [0.74, -3, 0.88], leftFoot: [-0.94, -3, -0.82], lockLimbJoints: true,
    },
    {
      n: 0.48, name: "block_hitstop", intention: "hold the compressed silhouette briefly so the successful block reads clearly", energy: 0.96, leading: "Torso",
      torsoPosition: [0.02, -0.66, 0.12], torsoEuler: [-31, -10, 2], headEuler: [22, 6, -1],
      rightFist: [-0.28, 1.02, -1.42], leftFist: [0.32, 0.82, -1.50],
      rightFoot: [0.74, -3, 0.88], leftFoot: [-0.94, -3, -0.82], lockLimbJoints: true,
    },
    {
      n: 0.68, name: "structure_rebounds", intention: "let the torso rebound before the forearms relax, preserving protection throughout recovery", energy: 0.68, leading: "Torso",
      torsoPosition: [0.04, -0.58, 0.02], torsoEuler: [-26, -13, 3], headEuler: [18, 8, -2],
      rightFist: [-0.32, 1.08, -1.56], leftFist: [0.36, 0.86, -1.66],
      rightFoot: [0.72, -3, 0.86], leftFoot: [-0.92, -3, -0.80], lockLimbJoints: true,
    },
    {
      n: 0.84, name: "protected_settle", intention: "settle into a lower crossed guard that still presents a strong asymmetric silhouette", energy: 0.56, leading: "Head",
      torsoPosition: [0.06, -0.55, -0.02], torsoEuler: [-24, -18, 5], headEuler: [16, 12, -3],
      rightFist: [-0.24, 1.00, -1.54], leftFist: [0.30, 0.78, -1.64],
      rightFoot: [0.72, -3, 0.86], leftFoot: [-0.90, -2.98, -0.80], lockLimbJoints: true,
    },
    {
      n: 1, name: "cross_block_pose", intention: "finish on the defendable hero pose rather than returning to a neutral boxing guard", energy: 0.54, leading: "Head",
      torsoPosition: [0.06, -0.55, -0.02], torsoEuler: [-24, -18, 5], headEuler: [16, 12, -3],
      rightFist: [-0.24, 1.00, -1.54], leftFist: [0.30, 0.78, -1.64],
      rightFoot: [0.72, -3, 0.86], leftFoot: [-0.90, -2.98, -0.80], lockLimbJoints: true,
    },
  ],
};

const predatoryRightHighKick: Skill = {
  name: "MD_R6_PredatoryRightFrontKick_v5",
  duration: 1.22,
  intent:
    "A forceful full-body right front stomp-kick: the left support receives the weight, the body compresses around it, the pelvis drives forward, the torso flexes back and left into a strong C-shaped silhouette, the arms counterbalance and the distal right foot remains the unmistakable impact point",
  contacts: [
    { id: "rear_right_launch", effector: "Right Leg", target: "ground", startTime: 0, endTime: 0.27, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.03 },
    { id: "left_support_pivot", effector: "Left Leg", target: "ground", startTime: 0.18, endTime: 0.90, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.06 },
    { id: "right_front_kick_strike", effector: "Right Leg", target: "target", startTime: 0.49, endTime: 0.62, positionWeight: 0.95, rotationWeight: 0.3, allowSlideMeters: 0.08 },
  ],
  phases: [
    {
      n: 0, name: "melee_idle_source", intention: "begin from the approved rear-right support stance", energy: 0.44, leading: "Head",
      torsoPosition: [0.16, -0.42, -0.10], torsoEuler: [-19, -38, 14], headEuler: [12, 34, -10],
      rightFist: [0.28, 0.76, -1.38], leftFist: [-0.58, -0.08, -2.02],
      rightFoot: [0.68, -3, 0.82], leftFoot: [-0.84, -2.82, -0.72], lockLimbJoints: true, stableLegSwing: true,
    },
    {
      n: 0.14, name: "left_support_load", intention: "move the center of mass over the forward left support while keeping the target locked", energy: 0.62, leading: "Left Leg",
      torsoPosition: [-0.20, -0.58, -0.02], torsoEuler: [-20, -25, -8], headEuler: [13, 20, 5],
      rightFist: [0.34, 0.58, -1.30], leftFist: [-0.82, -0.06, -1.66],
      rightFoot: [0.70, -2.88, 0.70], leftFoot: [-0.86, -3, -0.76], lockLimbJoints: true, stableLegSwing: true,
    },
    {
      n: 0.27, name: "right_front_chamber", intention: "lift the right leg in front of its own hip so the future extension already points toward the target", energy: 0.82, leading: "Right Leg",
      torsoPosition: [-0.28, -0.38, 0.02], torsoEuler: [-8, -10, -14], headEuler: [8, 7, 8],
      rightFist: [0.94, 0.36, -0.84], leftFist: [-1.26, 0.04, -1.18],
      rightFoot: [0.68, -1.02, -1.56], leftFoot: [-0.86, -3, -0.78], lockLimbJoints: true, stableLegSwing: true,
    },
    {
      n: 0.39, name: "hip_drives_front_line", intention: "drive the hip behind the chamber before full extension so the foot travels forward rather than escaping sideways", energy: 0.94, leading: "Torso",
      torsoPosition: [-0.25, -0.12, 0.02], torsoEuler: [15, -4, -14], headEuler: [-5, 4, 8],
      rightFist: [1.24, 0.18, -0.18], leftFist: [-1.12, 0.48, -1.12],
      rightFoot: [0.62, -1.16, -2.42], leftFoot: [-0.84, -3, -0.80], lockLimbJoints: true, allowTrailingArms: true, stableLegSwing: true,
    },
    {
      n: 0.49, name: "high_front_impact", intention: "extend the right foot high and directly toward the target while the torso leans away and the arms preserve the approved counterbalance", energy: 1, leading: "Right Leg",
      torsoPosition: [-0.18, 0.02, 0.16], torsoEuler: [36, -6, -15], headEuler: [-22, 7, 9],
      rightFist: [1.42, 0.02, 0.30], leftFist: [-0.72, 0.88, -1.52],
      rightFoot: [0.32, -1.10, -4.60], leftFoot: [-0.82, -3, -0.82], lockLimbJoints: true, allowTrailingArms: true, stableLegSwing: true,
    },
    {
      n: 0.545, name: "kick_hitstop", intention: "hold the high diagonal line briefly with the head still tracking the target", energy: 1, leading: "Right Leg",
      torsoPosition: [-0.16, 0.04, 0.20], torsoEuler: [39, -8, -16], headEuler: [-24, 9, 10],
      rightFist: [1.48, 0.00, 0.38], leftFist: [-0.68, 0.92, -1.58],
      rightFoot: [0.28, -1.06, -4.76], leftFoot: [-0.82, -3, -0.82], lockLimbJoints: true, allowTrailingArms: true, stableLegSwing: true,
    },
    {
      n: 0.66, name: "front_kick_recoil", intention: "retract the right leg backward through the original forward line before lowering it", energy: 0.8, leading: "Right Leg",
      torsoPosition: [-0.25, -0.12, 0.05], torsoEuler: [16, -3, -14], headEuler: [-5, 3, 8],
      rightFist: [1.20, 0.18, -0.16], leftFist: [-1.08, 0.44, -1.08],
      rightFoot: [0.64, -1.02, -1.82], leftFoot: [-0.84, -3, -0.80], lockLimbJoints: true, allowTrailingArms: true, stableLegSwing: true,
    },
    {
      n: 0.79, name: "right_foot_descends", intention: "lower the right foot behind the body while the torso rebuilds vertical balance", energy: 0.62, leading: "Torso",
      torsoPosition: [-0.16, -0.44, -0.12], torsoEuler: [-13, -12, -12], headEuler: [10, 9, 7],
      rightFist: [0.76, 0.40, -1.02], leftFist: [-1.10, 0.08, -1.30],
      rightFoot: [0.92, -2.30, 0.36], leftFoot: [-0.84, -3, -0.78], lockLimbJoints: true, stableLegSwing: true,
    },
    {
      n: 0.91, name: "rear_right_replants", intention: "replant the right foot behind as the support before restoring the compact hand threats", energy: 0.5, leading: "Right Leg",
      torsoPosition: [0.08, -0.46, -0.12], torsoEuler: [-18, -28, 8], headEuler: [11, 24, -6],
      rightFist: [0.38, 0.64, -1.32], leftFist: [-0.70, -0.02, -1.78],
      rightFoot: [0.70, -3, 0.80], leftFoot: [-0.84, -2.92, -0.74], lockLimbJoints: true, stableLegSwing: true,
    },
    {
      n: 1, name: "melee_idle_return", intention: "close on the original stance so the kick chains cleanly into the combat idle", energy: 0.44, leading: "Head",
      torsoPosition: [0.16, -0.42, -0.10], torsoEuler: [-19, -38, 14], headEuler: [12, 34, -10],
      rightFist: [0.28, 0.76, -1.38], leftFist: [-0.58, -0.08, -2.02],
      rightFoot: [0.68, -3, 0.82], leftFoot: [-0.84, -2.82, -0.72], lockLimbJoints: true, stableLegSwing: true,
    },
  ],
};

const predatoryLeftFrontKick: Skill = {
  name: "MD_R6_PredatoryLeftFrontKick_v1",
  duration: 1.12,
  intent:
    "A forceful lead-left front kick built from the approved predatory stance: the rear right leg remains the unquestionable support, the already-free forward left leg chambers without crossing the body, the pelvis thrusts toward the target, the torso leans back over the support and asymmetric arms stretch the impact silhouette",
  contacts: [
    { id: "rear_right_support", effector: "Right Leg", target: "ground", startTime: 0, endTime: 1.12, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.025 },
    { id: "left_foot_strike", effector: "Left Leg", target: "target", startTime: 0.50, endTime: 0.61, positionWeight: 0.98, rotationWeight: 0.25, allowSlideMeters: 0.06 },
  ],
  phases: [
    {
      n: 0, name: "approved_idle_source", intention: "start with the rear right foot already carrying the stance", energy: 0.44, leading: "Head",
      torsoPosition: [0.16, -0.42, -0.10], torsoEuler: [-19, -38, 14], headEuler: [12, 34, -10],
      rightFist: [0.28, 0.76, -1.38], leftFist: [-0.58, -0.08, -2.02],
      rightFoot: [0.68, -3, 0.82], leftFoot: [-0.84, -2.82, -0.72], lockLimbJoints: true, stableLeftLegSwing: true, stableArmSwing: true,
    },
    {
      n: 0.12, name: "rear_support_compression", intention: "compress the body over the planted rear right leg and make the forward left foot weightless", energy: 0.64, leading: "Right Leg",
      torsoPosition: [0.30, -0.57, -0.02], torsoEuler: [-21, -24, 9], headEuler: [13, 19, -5],
      rightFist: [0.46, 0.56, -1.24], leftFist: [-0.70, -0.04, -1.70],
      rightFoot: [0.70, -3, 0.84], leftFoot: [-0.82, -2.66, -0.82], lockLimbJoints: true, stableLeftLegSwing: true, stableArmSwing: true,
    },
    {
      n: 0.18, name: "arm_opens_with_chamber", intention: "open the right counterbalance arm through a readable intermediate arc while the left leg begins to chamber", energy: 0.74, leading: "Left Leg",
      torsoPosition: [0.32, -0.48, 0.00], torsoEuler: [-14, -16, 12], headEuler: [10, 12, -7],
      rightFist: [0.80, 0.44, -1.18], leftFist: [-0.94, 0.02, -1.44],
      rightFoot: [0.70, -3, 0.84], leftFoot: [-0.74, -1.82, -1.16], lockLimbJoints: true, stableLeftLegSwing: true, stableArmSwing: true,
    },
    {
      n: 0.24, name: "left_front_chamber", intention: "draw the free left leg up directly in front of its hip while the support side stays tall", energy: 0.84, leading: "Left Leg",
      torsoPosition: [0.32, -0.36, 0.03], torsoEuler: [-7, 8, 14], headEuler: [7, -5, -8],
      rightFist: [1.18, 0.02, -1.12], leftFist: [-0.94, 0.38, -0.82],
      rightFoot: [0.70, -3, 0.84], leftFoot: [-0.66, -1.00, -1.58], lockLimbJoints: true, stableLeftLegSwing: true, stableArmSwing: true,
    },
    {
      n: 0.36, name: "pelvis_thrusts_behind_left_foot", intention: "send the pelvis toward the target while the left foot stays chambered on a straight attack line", energy: 0.95, leading: "Torso",
      torsoPosition: [0.27, -0.10, 0.04], torsoEuler: [16, 4, 14], headEuler: [-6, -2, -8],
      rightFist: [1.14, 0.48, -1.18], leftFist: [-1.24, 0.18, -0.18],
      rightFoot: [0.70, -3, 0.84], leftFoot: [-0.58, -1.12, -2.46], lockLimbJoints: true, allowTrailingArms: true, stableLeftLegSwing: true, stableArmSwing: true,
    },
    {
      n: 0.46, name: "left_foot_drives_through_target", intention: "lean the torso back over the rear support as the distal left foot becomes the furthest point in the pose", energy: 1, leading: "Left Leg",
      torsoPosition: [0.22, 0.03, 0.18], torsoEuler: [37, 6, 15], headEuler: [-23, -7, -9],
      rightFist: [0.72, 0.90, -1.54], leftFist: [-1.44, 0.02, 0.32],
      rightFoot: [0.70, -3, 0.84], leftFoot: [-0.28, -1.08, -4.62], lockLimbJoints: true, allowTrailingArms: true, stableLeftLegSwing: true, stableArmSwing: true,
    },
    {
      n: 0.515, name: "left_kick_hitstop", intention: "hold the long foot-to-head silhouette and keep the right support visibly connected to the ground", energy: 1, leading: "Left Leg",
      torsoPosition: [0.20, 0.05, 0.22], torsoEuler: [40, 8, 16], headEuler: [-25, -9, -10],
      rightFist: [0.68, 0.94, -1.60], leftFist: [-1.50, 0.00, 0.40],
      rightFoot: [0.70, -3, 0.84], leftFoot: [-0.24, -1.04, -4.78], lockLimbJoints: true, allowTrailingArms: true, stableLeftLegSwing: true, stableArmSwing: true,
    },
    {
      n: 0.63, name: "left_leg_rechambers", intention: "recover the foot along the same forward line before allowing the torso to stack again", energy: 0.78, leading: "Left Leg",
      torsoPosition: [0.28, -0.10, 0.06], torsoEuler: [17, 4, 14], headEuler: [-6, -2, -8],
      rightFist: [1.10, 0.46, -1.14], leftFist: [-1.20, 0.16, -0.16],
      rightFoot: [0.70, -3, 0.84], leftFoot: [-0.62, -1.00, -1.86], lockLimbJoints: true, allowTrailingArms: true, stableLeftLegSwing: true, stableArmSwing: true,
    },
    {
      n: 0.77, name: "left_foot_descends_forward", intention: "lower the free leg toward its original forward landing while the arms rebuild threat range", energy: 0.6, leading: "Torso",
      torsoPosition: [0.26, -0.38, -0.01], torsoEuler: [-8, -8, 12], headEuler: [8, 6, -7],
      rightFist: [0.72, 0.46, -1.24], leftFist: [-0.88, 0.16, -1.12],
      rightFoot: [0.70, -3, 0.84], leftFoot: [-0.78, -2.28, -1.02], lockLimbJoints: true, stableLeftLegSwing: true, stableArmSwing: true,
    },
    {
      n: 0.90, name: "left_forward_replant", intention: "replant the left foot in front without stealing support from the rear right leg", energy: 0.49, leading: "Right Leg",
      torsoPosition: [0.20, -0.45, -0.08], torsoEuler: [-17, -27, 13], headEuler: [11, 23, -9],
      rightFist: [0.40, 0.66, -1.32], leftFist: [-0.68, 0.00, -1.76],
      rightFoot: [0.68, -3, 0.82], leftFoot: [-0.82, -2.88, -0.78], lockLimbJoints: true, stableLeftLegSwing: true, stableArmSwing: true,
    },
    {
      n: 1, name: "approved_idle_return", intention: "return exactly to the approved rear-support combat idle", energy: 0.44, leading: "Head",
      torsoPosition: [0.16, -0.42, -0.10], torsoEuler: [-19, -38, 14], headEuler: [12, 34, -10],
      rightFist: [0.28, 0.76, -1.38], leftFist: [-0.58, -0.08, -2.02],
      rightFoot: [0.68, -3, 0.82], leftFoot: [-0.84, -2.82, -0.72], lockLimbJoints: true, stableLeftLegSwing: true, stableArmSwing: true,
    },
  ],
};

const referenceObliqueBreaker: Skill = {
  name: "MD_R6_ObliqueBreaker_v1",
  duration: 0.86,
  intent:
    "An original outside-slip into an oblique rear cross: the head leaves the centerline first, the rear foot and hips reverse the coil, the right fist becomes the furthest point at contact, and a short hit-stop resolves into a guarded recovery.",
  contacts: [
    { id: "rear_drive", effector: "Right Leg", target: "ground", startTime: 0, endTime: 0.48, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.04 },
    { id: "front_receive", effector: "Left Leg", target: "ground", startTime: 0.30, endTime: 0.72, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.05 },
    { id: "right_fist_contact", effector: "Right Arm", target: "target", startTime: 0.43, endTime: 0.50, positionWeight: 0.98, rotationWeight: 0.2, allowSlideMeters: 0.05 },
  ],
  phases: [
    { n: 0, name: "offset_guard", intention: "quiet asymmetrical guard with both hands ahead of the chest", energy: 0.38, leading: "Head",
      torsoPosition: [0.06, -0.30, 0.02], torsoEuler: [-11, -18, 5], headEuler: [5, 14, -3],
      rightFist: [0.72, 0.34, -1.30], leftFist: [-0.76, 0.48, -1.46], rightFoot: [0.62, -3, 0.50], leftFoot: [-0.68, -3, -0.54], lockLimbJoints: true, stableArmSwing: true, stableLegSwing: true },
    { n: 0.13, name: "target_read", intention: "brief stillness makes the sudden line change readable", energy: 0.40, leading: "Head",
      torsoPosition: [0.06, -0.31, 0.02], torsoEuler: [-11, -18, 5], headEuler: [5, 14, -3],
      rightFist: [0.72, 0.34, -1.30], leftFist: [-0.76, 0.48, -1.46], rightFoot: [0.62, -3, 0.50], leftFoot: [-0.68, -3, -0.54], lockLimbJoints: true, stableArmSwing: true, stableLegSwing: true },
    { n: 0.27, name: "outside_slip", intention: "head and ribs slip left while the rear hip stores torque", energy: 0.66, leading: "Head",
      torsoPosition: [-0.22, -0.48, -0.02], torsoEuler: [-20, -42, -19], headEuler: [10, 31, 15],
      rightFist: [0.62, 0.18, -0.72], leftFist: [-0.50, 0.58, -1.34], rightFoot: [0.64, -3, 0.58], leftFoot: [-0.72, -3, -0.58], lockLimbJoints: true, stableArmSwing: true, stableLegSwing: true },
    { n: 0.36, name: "rear_drive_release", intention: "rear leg initiates the reversal while the right fist deliberately lags", energy: 0.82, leading: "Right Leg",
      torsoPosition: [-0.14, -0.43, -0.12], torsoEuler: [-17, -18, -12], headEuler: [7, 10, 8],
      rightFist: [0.78, 0.28, -0.62], leftFist: [-0.42, 0.62, -1.38], rightFoot: [0.64, -3, 0.56], leftFoot: [-0.70, -3, -0.62], lockLimbJoints: true, stableArmSwing: true, stableLegSwing: true },
    { n: 0.47, name: "oblique_cross_contact", intention: "hips and torso finish behind a hand-first diagonal cross", energy: 1, leading: "Right Arm",
      torsoPosition: [-0.10, -0.18, -0.43], torsoEuler: [-13, 39, -8], headEuler: [4, -30, 5],
      rightFist: [0.12, 0.94, -3.18], leftFist: [-0.68, 0.30, -1.34], rightFoot: [0.58, -3, 0.48], leftFoot: [-0.68, -3, -0.70], lockLimbJoints: true, stableArmSwing: true, stableLegSwing: true },
    { n: 0.515, name: "oblique_hitstop", intention: "hold the long fist-to-rear-foot line for impact readability", energy: 1, leading: "Right Arm",
      torsoPosition: [-0.09, -0.16, -0.47], torsoEuler: [-12, 43, -7], headEuler: [3, -33, 4],
      rightFist: [0.08, 0.98, -3.30], leftFist: [-0.70, 0.28, -1.32], rightFoot: [0.58, -3, 0.48], leftFoot: [-0.68, -3, -0.70], lockLimbJoints: true, stableArmSwing: true, stableLegSwing: true },
    { n: 0.66, name: "cross_overshoot", intention: "shoulder and ribs pass the contact as the fist starts folding back", energy: 0.72, leading: "Torso",
      torsoPosition: [-0.02, -0.27, -0.38], torsoEuler: [-15, 53, -3], headEuler: [6, -39, 1],
      rightFist: [-0.10, 0.68, -2.46], leftFist: [-0.58, 0.36, -1.26], rightFoot: [0.58, -3, 0.48], leftFoot: [-0.68, -3, -0.70], lockLimbJoints: true, stableArmSwing: true, stableLegSwing: true },
    { n: 0.82, name: "guard_rebuild", intention: "torso unwinds before the striking hand fully returns", energy: 0.50, leading: "Torso",
      torsoPosition: [0.04, -0.34, -0.08], torsoEuler: [-13, 4, 4], headEuler: [5, -2, -2],
      rightFist: [0.66, 0.28, -1.20], leftFist: [-0.72, 0.48, -1.42], rightFoot: [0.60, -3, 0.48], leftFoot: [-0.68, -3, -0.62], lockLimbJoints: true, stableArmSwing: true, stableLegSwing: true },
    { n: 1, name: "offset_guard_return", intention: "settle into a combat-ready variation of the opening guard", energy: 0.39, leading: "Head",
      torsoPosition: [0.06, -0.30, 0.02], torsoEuler: [-11, -18, 5], headEuler: [5, 14, -3],
      rightFist: [0.72, 0.34, -1.30], leftFist: [-0.76, 0.48, -1.46], rightFoot: [0.62, -3, 0.50], leftFoot: [-0.68, -3, -0.54], lockLimbJoints: true, stableArmSwing: true, stableLegSwing: true },
  ],
};

const referenceArcReversal: Skill = {
  name: "MD_R6_ArcReversal_v1",
  duration: 1.02,
  intent:
    "An original parry-to-backfist counter. The lead hand redirects the attack, the torso keeps turning through the defensive beat, the rear arm trails in a wide arc, and the backfist snaps across the target before the stance settles.",
  contacts: [
    { id: "left_parry", effector: "Left Arm", target: "incoming_attack", startTime: 0.20, endTime: 0.31, positionWeight: 0.8, rotationWeight: 0.15, allowSlideMeters: 0.12 },
    { id: "right_backfist", effector: "Right Arm", target: "target", startTime: 0.53, endTime: 0.60, positionWeight: 0.95, rotationWeight: 0.15, allowSlideMeters: 0.09 },
    { id: "pivot_support", effector: "Left Leg", target: "ground", startTime: 0.16, endTime: 0.76, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.06 },
  ],
  phases: [
    { n: 0, name: "narrow_guard", intention: "present a narrow target with hands staggered in depth", energy: 0.36, leading: "Head",
      torsoPosition: [0, -0.28, 0], torsoEuler: [-10, 12, -4], headEuler: [4, -9, 2],
      rightFist: [0.58, 0.46, -1.20], leftFist: [-0.74, 0.26, -1.48], rightFoot: [0.66, -3, 0.44], leftFoot: [-0.66, -3, -0.54], lockLimbJoints: true, stableArmSwing: false, stableLegSwing: true },
    { n: 0.16, name: "incoming_read", intention: "eyes and head lead a compact defensive lean", energy: 0.48, leading: "Head",
      torsoPosition: [-0.08, -0.36, 0.02], torsoEuler: [-14, 3, -11], headEuler: [6, -1, 8],
      rightFist: [0.54, 0.50, -1.14], leftFist: [-0.62, 0.34, -1.40], rightFoot: [0.66, -3, 0.44], leftFoot: [-0.66, -3, -0.54], lockLimbJoints: true, stableArmSwing: false, stableLegSwing: true },
    { n: 0.27, name: "lead_parry", intention: "left forearm sweeps the attack outside without collapsing the chest", energy: 0.72, leading: "Left Arm",
      torsoPosition: [-0.16, -0.38, -0.08], torsoEuler: [-13, -30, -18], headEuler: [5, 22, 13],
      rightFist: [0.46, 0.42, -0.92], leftFist: [-1.42, 0.76, -1.54], rightFoot: [0.66, -3, 0.48], leftFoot: [-0.68, -3, -0.58], lockLimbJoints: true, stableArmSwing: false, stableLegSwing: true },
    { n: 0.33, name: "parry_carries_turn", intention: "left hand remains outside while the torso rotation passes beneath it", energy: 0.79, leading: "Torso",
      torsoPosition: [-0.15, -0.35, -0.12], torsoEuler: [-12, -39, -17], headEuler: [4, 30, 12],
      rightFist: [0.72, 0.36, -0.58], leftFist: [-1.34, 0.62, -1.35], rightFoot: [0.64, -3, 0.42], leftFoot: [-0.68, -3, -0.59], lockLimbJoints: true, allowTrailingArms: true, stableArmSwing: false, stableLegSwing: true },
    { n: 0.39, name: "turn_continues", intention: "defense becomes attack as pelvis and shoulders continue the same arc", energy: 0.84, leading: "Torso",
      torsoPosition: [-0.12, -0.31, -0.16], torsoEuler: [-10, -54, -15], headEuler: [3, 42, 10],
      rightFist: [0.96, 0.30, -0.34], leftFist: [-1.24, 0.48, -1.16], rightFoot: [0.62, -3, 0.36], leftFoot: [-0.68, -3, -0.60], lockLimbJoints: true, allowTrailingArms: true, stableArmSwing: false, stableLegSwing: true },
    { n: 0.455, name: "backfist_midarc", intention: "a readable breakdown carries both arms through the torso reversal without an axial flip", energy: 0.91, leading: "Right Arm",
      torsoPosition: [-0.07, -0.25, -0.24], torsoEuler: [-9, -15, -11], headEuler: [3, 11, 8],
      rightFist: [0.44, 0.72, -1.78], leftFist: [-1.08, 0.32, -1.08], rightFoot: [0.61, -3, 0.35], leftFoot: [-0.68, -3, -0.61], lockLimbJoints: true, allowTrailingArms: true, stableArmSwing: false, stableLegSwing: true },
    { n: 0.52, name: "backfist_arc", intention: "right arm overtakes the rotating shoulder on a clean horizontal arc", energy: 0.96, leading: "Right Arm",
      torsoPosition: [-0.02, -0.18, -0.34], torsoEuler: [-8, 24, -7], headEuler: [2, -18, 5],
      rightFist: [-0.12, 1.02, -2.94], leftFist: [-1.28, 0.30, -1.20], rightFoot: [0.60, -3, 0.34], leftFoot: [-0.68, -3, -0.62], lockLimbJoints: true, allowTrailingArms: true, stableArmSwing: false, stableLegSwing: true },
    { n: 0.575, name: "backfist_hitstop", intention: "freeze the open arc for a sharp silhouette and clear contact", energy: 1, leading: "Right Arm",
      torsoPosition: [0, -0.16, -0.38], torsoEuler: [-7, 31, -5], headEuler: [1, -23, 4],
      rightFist: [-0.24, 1.04, -3.08], leftFist: [-1.30, 0.28, -1.18], rightFoot: [0.60, -3, 0.34], leftFoot: [-0.68, -3, -0.62], lockLimbJoints: true, allowTrailingArms: true, stableArmSwing: false, stableLegSwing: true },
    { n: 0.72, name: "arc_followthrough", intention: "striking hand crosses the center while the head keeps the target", energy: 0.68, leading: "Torso",
      torsoPosition: [0.08, -0.28, -0.28], torsoEuler: [-12, 47, 2], headEuler: [4, -36, -2],
      rightFist: [-0.58, 0.72, -2.20], leftFist: [-1.08, 0.34, -1.25], rightFoot: [0.60, -3, 0.34], leftFoot: [-0.68, -3, -0.62], lockLimbJoints: true, allowTrailingArms: true, stableArmSwing: false, stableLegSwing: true },
    { n: 0.87, name: "hands_reseat", intention: "hands return at different speeds to preserve overlap", energy: 0.46, leading: "Left Arm",
      torsoPosition: [0.04, -0.32, -0.06], torsoEuler: [-12, 18, 1], headEuler: [5, -13, -1],
      rightFist: [0.46, 0.34, -1.08], leftFist: [-0.72, 0.38, -1.38], rightFoot: [0.64, -3, 0.42], leftFoot: [-0.66, -3, -0.56], lockLimbJoints: true, stableArmSwing: false, stableLegSwing: true },
    { n: 1, name: "narrow_guard_return", intention: "close on the same narrow threat line", energy: 0.36, leading: "Head",
      torsoPosition: [0, -0.28, 0], torsoEuler: [-10, 12, -4], headEuler: [4, -9, 2],
      rightFist: [0.58, 0.46, -1.20], leftFist: [-0.74, 0.26, -1.48], rightFoot: [0.66, -3, 0.44], leftFoot: [-0.66, -3, -0.54], lockLimbJoints: true, stableArmSwing: false, stableLegSwing: true },
  ],
};

const referenceFallingAxe: Skill = {
  name: "MD_R6_FallingAxe_v1",
  duration: 1.18,
  intent:
    "An original right axe kick with a direct, non-spinning leg path: compression over the left support, a high straight chamber, a readable apex hold, and a heel-led drop assisted by a full-body crunch and opposing arms.",
  contacts: [
    { id: "left_support", effector: "Left Leg", target: "ground", startTime: 0, endTime: 0.92, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.04 },
    { id: "right_heel_drop", effector: "Right Leg", target: "target", startTime: 0.63, endTime: 0.75, positionWeight: 0.98, rotationWeight: 0.15, allowSlideMeters: 0.08 },
  ],
  phases: [
    { n: 0, name: "kick_guard", intention: "grounded stance with the left leg ready to own the weight", energy: 0.38, leading: "Head",
      torsoPosition: [0.04, -0.34, 0.02], torsoEuler: [-12, -10, 5], headEuler: [5, 8, -3],
      rightFist: [0.72, 0.26, -1.26], leftFist: [-0.76, 0.42, -1.42], rightFoot: [0.68, -3, 0.34], leftFoot: [-0.68, -3, -0.48], lockLimbJoints: true, stableArmSwing: true, stableLeftLegSwing: true, stableRightLegSwing: true },
    { n: 0.14, name: "left_support_compression", intention: "hips sink over the left leg and free the right foot", energy: 0.58, leading: "Left Leg",
      torsoPosition: [-0.16, -0.58, 0.04], torsoEuler: [-21, -18, -10], headEuler: [9, 13, 7],
      rightFist: [0.58, 0.12, -1.12], leftFist: [-0.58, 0.54, -1.34], rightFoot: [0.64, -2.78, 0.18], leftFoot: [-0.68, -3, -0.50], lockLimbJoints: true, stableArmSwing: true, stableLeftLegSwing: true, stableRightLegSwing: true },
    { n: 0.25, name: "right_knee_rises", intention: "right leg folds upward on its own side while arms widen for balance", energy: 0.74, leading: "Right Leg",
      torsoPosition: [-0.18, -0.36, 0.02], torsoEuler: [-9, -12, -12], headEuler: [4, 9, 8],
      rightFist: [1.34, 0.12, -0.76], leftFist: [-1.18, 0.24, -0.94], rightFoot: [0.62, -1.18, -1.10], leftFoot: [-0.68, -3, -0.50], lockLimbJoints: true, allowTrailingArms: true, stableArmSwing: true, stableLeftLegSwing: true, stableRightLegSwing: true },
    { n: 0.39, name: "axe_leg_climbs", intention: "heel climbs above the target as the torso leans away from the support", energy: 0.90, leading: "Right Leg",
      torsoPosition: [-0.24, -0.10, 0.10], torsoEuler: [24, -4, -16], headEuler: [-12, 3, 10],
      rightFist: [1.44, 0.38, -0.42], leftFist: [-1.38, 0.08, -0.54], rightFoot: [0.46, 0.52, -1.92], leftFoot: [-0.68, -3, -0.50], lockLimbJoints: true, allowTrailingArms: true, stableArmSwing: true, stableLeftLegSwing: true, stableRightLegSwing: true },
    { n: 0.48, name: "axe_apex", intention: "hold a tall foot-to-support silhouette before gravity takes over", energy: 0.96, leading: "Right Leg",
      torsoPosition: [-0.22, 0.00, 0.16], torsoEuler: [35, 1, -15], headEuler: [-20, -1, 9],
      rightFist: [1.34, 0.64, -0.22], leftFist: [-1.46, 0.18, -0.34], rightFoot: [0.34, 1.02, -2.22], leftFoot: [-0.68, -3, -0.50], lockLimbJoints: true, allowTrailingArms: true, stableArmSwing: true, stableLeftLegSwing: true, stableRightLegSwing: true },
    { n: 0.56, name: "apex_suspension", intention: "a short pause separates the lift from the violent drop", energy: 0.94, leading: "Right Leg",
      torsoPosition: [-0.21, 0.01, 0.17], torsoEuler: [36, 2, -14], headEuler: [-21, -2, 8],
      rightFist: [1.30, 0.66, -0.20], leftFist: [-1.48, 0.20, -0.32], rightFoot: [0.32, 1.06, -2.24], leftFoot: [-0.68, -3, -0.50], lockLimbJoints: true, allowTrailingArms: true, stableArmSwing: true, stableLeftLegSwing: true, stableRightLegSwing: true },
    { n: 0.68, name: "heel_crashes_down", intention: "heel travels straight down as torso and arms crunch around the strike", energy: 1, leading: "Right Leg",
      torsoPosition: [-0.06, -0.42, -0.38], torsoEuler: [-34, 8, 12], headEuler: [19, -6, -8],
      rightFist: [0.94, -0.24, -1.02], leftFist: [-0.92, -0.10, -1.28], rightFoot: [0.36, -2.10, -3.24], leftFoot: [-0.68, -3, -0.50], lockLimbJoints: true, stableArmSwing: true, stableLeftLegSwing: true, stableRightLegSwing: true },
    { n: 0.73, name: "axe_hitstop", intention: "hold the heel-low body-crunch silhouette for impact", energy: 1, leading: "Right Leg",
      torsoPosition: [-0.04, -0.46, -0.42], torsoEuler: [-38, 10, 13], headEuler: [22, -7, -9],
      rightFist: [0.90, -0.28, -1.04], leftFist: [-0.88, -0.14, -1.30], rightFoot: [0.34, -2.20, -3.30], leftFoot: [-0.68, -3, -0.50], lockLimbJoints: true, stableArmSwing: true, stableLeftLegSwing: true, stableRightLegSwing: true },
    { n: 0.84, name: "right_leg_recoils", intention: "right foot returns along the same attack plane without circling", energy: 0.70, leading: "Right Leg",
      torsoPosition: [-0.10, -0.40, -0.16], torsoEuler: [-20, 2, 5], headEuler: [11, -1, -3],
      rightFist: [0.78, 0.08, -1.12], leftFist: [-0.76, 0.28, -1.34], rightFoot: [0.58, -1.54, -1.28], leftFoot: [-0.68, -3, -0.50], lockLimbJoints: true, stableArmSwing: true, stableLeftLegSwing: true, stableRightLegSwing: true },
    { n: 0.94, name: "right_foot_replants", intention: "right foot lands softly as the left leg releases its support duty", energy: 0.48, leading: "Left Leg",
      torsoPosition: [0, -0.38, -0.04], torsoEuler: [-14, -5, 4], headEuler: [6, 4, -2],
      rightFist: [0.72, 0.22, -1.22], leftFist: [-0.76, 0.38, -1.40], rightFoot: [0.66, -3, 0.18], leftFoot: [-0.68, -3, -0.50], lockLimbJoints: true, stableArmSwing: true, stableLeftLegSwing: true, stableRightLegSwing: true },
    { n: 1, name: "kick_guard_return", intention: "finish in a stance that can chain into the next attack", energy: 0.38, leading: "Head",
      torsoPosition: [0.04, -0.34, 0.02], torsoEuler: [-12, -10, 5], headEuler: [5, 8, -3],
      rightFist: [0.72, 0.26, -1.26], leftFist: [-0.76, 0.42, -1.42], rightFoot: [0.68, -3, 0.34], leftFoot: [-0.68, -3, -0.48], lockLimbJoints: true, stableArmSwing: true, stableLeftLegSwing: true, stableRightLegSwing: true },
  ],
};

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
    if (phase.groundFeet) {
      for (const [joint, expectedY] of [
        ["Right Leg", phase.rightFoot[1]],
        ["Left Leg", phase.leftFoot[1]],
      ] as const) {
        const distalFoot = transformPoint(world[joint], [0, -1, 0]);
        assert.ok(
          Math.abs(distalFoot[1] - expectedY) < 0.001,
          `${skill.name}/${phase.name}/${joint}: distal foot Y=${distalFoot[1].toFixed(3)} missed ground Y=${expectedY.toFixed(3)}`,
        );
      }
    }
    for (const joint of ["Right Arm", "Left Arm"] as const) {
      const behindRatio = armBehindTorsoRatio(world.Torso, world[joint]);
      const allowTrailingArms = phase.allowTrailingArms || skill.name.includes("Villain_InsaneLaugh");
      const limit = allowTrailingArms
        ? 0.72
        : phase.name.includes("compression") || phase.name.includes("coil") ? 0.45 : 0.35;
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
      if (skill.name.includes("Guard")) {
        const side = joint === "Right Arm" ? 1 : -1;
        assert.ok(
          armCenter[0] * side > 0.58,
          `${skill.name}/${phase.name}/${joint}: arm center X=${armCenter[0].toFixed(2)} crossed into torso volume instead of seating outside`,
        );
        assert.ok(
          handPoint[0] * side > 0.45,
          `${skill.name}/${phase.name}/${joint}: hand X=${handPoint[0].toFixed(2)} crossed the center guard line`,
        );
      }
      if (skill.name.includes("ReadFeintCompression")) {
        assert.ok(
          armCenter[2] < 0.12,
          `${skill.name}/${phase.name}/${joint}: arm center Z=${armCenter[2].toFixed(2)} is lateral/rear instead of forward`,
        );
        assert.ok(
          handPoint[2] < -0.55,
          `${skill.name}/${phase.name}/${joint}: hand Z=${handPoint[2].toFixed(2)} is not clearly in front of torso`,
        );
      } else if (!allowTrailingArms) {
        assert.ok(
          handPoint[2] < 0.20,
          `${skill.name}/${phase.name}/${joint}: relaxed hand Z=${handPoint[2].toFixed(2)} crossed behind the back plane`,
        );
      }
    }
  }
  const solved = skill.phases.map((phase) => ({ n: phase.n, transforms: solvePhase(phase) }));
  for (let i = 1; i < solved.length; i += 1) assert.ok(solved[i]!.n > solved[i - 1]!.n);
  // q and -q encode the same orientation, but a sign jump between authored
  // poses can make downstream keyframe interpolation take the visible long arc.
  // Keep every track in one quaternion hemisphere before generating dense keys.
  for (const joint of joints) {
    for (let i = 1; i < solved.length; i += 1) {
      const previous = solved[i - 1]!.transforms[joint].q;
      const current = solved[i]!.transforms[joint].q;
      const signedDot = previous.x * current.x + previous.y * current.y + previous.z * current.z + previous.w * current.w;
      if (signedDot < 0) {
        solved[i]!.transforms[joint].q = {
          x: -current.x,
          y: -current.y,
          z: -current.z,
          w: -current.w,
        };
      }
    }
  }
  for (const joint of joints) {
    for (let i = 1; i < solved.length; i += 1) {
      const a = solved[i - 1]!.transforms[joint].q;
      const b = solved[i]!.transforms[joint].q;
      const cosine = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w));
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
    looped: skill.name.includes("PredatoryMeleeIdle"),
    priority: skill.name.includes("PredatoryMeleeIdle") ? "idle" : "action",
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

const drafts = process.env.MOTION_DRAFT_NAME === "medium-chain-finisher"
    ? [buildDraft(mediumChainFinisher)]
    : process.env.MOTION_DRAFT_NAME === "frenzy-run-punch"
    ? [buildDraft(frenzyRunPunch)]
    : process.env.MOTION_DRAFT_NAME === "frenzy-ground-carry-punch"
      ? [buildDraft(frenzyRunGroundCarryPunch)]
    : process.env.MOTION_DRAFT_NAME === "frenzy-carried-victim"
      ? [buildDraft(carriedVictim)]
    : process.env.MOTION_DRAFT_NAME === "sukuna-villain-laugh"
      ? [buildDraft(sukunaVillainLaughReferenceInformed)]
    : process.env.MOTION_DRAFT_NAME === "predatory-melee-pose"
      ? [buildDraft(predatoryMeleePose)]
    : process.env.MOTION_DRAFT_NAME === "predatory-rear-straight"
      ? [buildDraft(predatoryRearStraight)]
    : process.env.MOTION_DRAFT_NAME === "skull-breaker-impact-frame"
      ? [buildDraft(skullBreakerImpactFrame)]
    : process.env.MOTION_DRAFT_NAME === "skull-breaker-uppercut"
      ? [buildDraft(skullBreakerUppercut)]
    : process.env.MOTION_DRAFT_NAME === "skull-breaker-tsb-uppercut"
      ? [buildDraft(tsbInspiredSkullBreakerUppercut)]
    : process.env.MOTION_DRAFT_NAME === "skull-breaker-uppercut-victim"
      ? [buildDraft(skullBreakerUppercutVictim)]
    : process.env.MOTION_DRAFT_NAME === "skull-breaker-victim-backflip"
      ? [buildDraft(skullBreakerVictimBackflipRecovery)]
    : process.env.MOTION_DRAFT_NAME === "predatory-cross-block"
      ? [buildDraft(predatoryCrossBlock)]
    : process.env.MOTION_DRAFT_NAME === "predatory-right-high-kick"
      ? [buildDraft(predatoryRightHighKick)]
    : process.env.MOTION_DRAFT_NAME === "predatory-left-front-kick"
      ? [buildDraft(predatoryLeftFrontKick)]
    : process.env.MOTION_DRAFT_NAME === "reference-combat-originals"
      ? [buildDraft(referenceObliqueBreaker), buildDraft(referenceFallingAxe)]
    : [buildDraft(sovereignWalkPart01)];
if (process.env.MOTION_EMIT_DRAFT === "1") {
  process.stdout.write(JSON.stringify(drafts[0]));
  process.exit(0);
}
if (process.env.MOTION_REMOTE_RELAY === "1") {
  const relay = process.env.MOTION_RELAY_URL ?? "https://motion-director-relay.onrender.com";
  const pairingCode = process.env.MOTION_PAIRING_CODE;
  assert.ok(pairingCode, "MOTION_PAIRING_CODE is required for remote relay mode");
  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const post = async (path: string, body: unknown): Promise<any> => {
    const response = await fetch(`${relay}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(json)}`);
    return json;
  };
  const remoteAction = async (action: string, input: Record<string, unknown>, confirmWrite = false): Promise<any> => {
    const started = await post("/v1/actions/execute", { pairingCode, action, input, ...(confirmWrite ? { confirmWrite: true } : {}) });
    if (started.status === "succeeded") return started.result;
    for (;;) {
      await wait(started.pollAfterMs ?? 600);
      const job = await post("/v1/actions/job", { pairingCode, jobId: started.jobId });
      if (job.status === "succeeded") return job.result;
      if (job.status === "failed") throw new Error(`${action}: ${job.error}`);
    }
  };
  const results = [];
  for (const draft of drafts) {
    const validation = await remoteAction("validateAnimationDraft", { draft });
    const staged = await remoteAction("stageAnimationDraft", { transactionName: `World-solved R6 combat: ${draft.name}`, draft }, true);
    const committed = await remoteAction("commitAnimationDraft", { transactionId: staged.transactionId, destinationName: draft.name }, true);
    const attached = await remoteAction("attachCommittedAnimations", { namePrefix: draft.name }, true);
    const reviewTime = draft.name.includes("BackflipRecovery")
      ? 2.28 / 3.2
      : draft.name.includes("ChargedFromBelow") || draft.name.includes("UppercutVictim")
        ? 0.525
        : 0.505;
    const posed = await remoteAction("poseCommittedAnimation", { animationName: draft.name, normalizedTime: reviewTime }, true);
    results.push({ name: draft.name, validation, staged, committed, attached, posed });
  }
  process.stdout.write(JSON.stringify({ results }, null, 2));
  process.exit(0);
}
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
