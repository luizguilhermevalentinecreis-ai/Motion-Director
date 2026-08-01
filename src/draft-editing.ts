import { z } from "zod";
import {
  animationDraftSchema,
  easingSchema,
  poseKeySchema,
  vector3Schema,
  type AnimationDraft,
} from "./domain.js";

const timeRangeSchema = z.object({
  startTime: z.number().nonnegative(),
  endTime: z.number().nonnegative(),
}).refine((range) => range.endTime >= range.startTime, "endTime must be >= startTime");

const jointSelectorSchema = z.object({
  joints: z.array(z.string().min(1)).min(1).max(128),
});

const upsertKeyOperationSchema = z.object({
  op: z.literal("upsertKey"),
  joint: z.string().min(1),
  space: z.enum(["local", "motor", "parent", "character", "world"]).optional(),
  key: poseKeySchema,
  tolerance: z.number().nonnegative().max(0.1).default(0.0001),
});

const deleteRangeOperationSchema = z.object({
  op: z.literal("deleteRange"),
  ...jointSelectorSchema.shape,
  ...timeRangeSchema.shape,
});

const offsetRangeOperationSchema = z.object({
  op: z.literal("offsetRange"),
  ...jointSelectorSchema.shape,
  ...timeRangeSchema.shape,
  positionDelta: vector3Schema.default({ x: 0, y: 0, z: 0 }),
  rotationDegreesDelta: vector3Schema.default({ x: 0, y: 0, z: 0 }),
  weightScale: z.number().min(0).max(4).default(1),
});

const retimeRangeOperationSchema = z.object({
  op: z.literal("retimeRange"),
  ...jointSelectorSchema.shape,
  ...timeRangeSchema.shape,
  newStartTime: z.number().nonnegative(),
  newEndTime: z.number().nonnegative(),
}).refine((operation) => operation.newEndTime >= operation.newStartTime, "newEndTime must be >= newStartTime");

const copyRangeOperationSchema = z.object({
  op: z.literal("copyRange"),
  sourceJoint: z.string().min(1),
  targetJoint: z.string().min(1),
  ...timeRangeSchema.shape,
  timeOffset: z.number().finite().default(0),
  positionScale: vector3Schema.default({ x: 1, y: 1, z: 1 }),
  rotationScale: vector3Schema.default({ x: 1, y: 1, z: 1 }),
  replaceTargetRange: z.boolean().default(false),
});

const mirrorRangeOperationSchema = z.object({
  op: z.literal("mirrorRange"),
  sourceJoint: z.string().min(1),
  targetJoint: z.string().min(1),
  ...timeRangeSchema.shape,
  axis: z.enum(["x", "y", "z"]).default("x"),
  timeOffset: z.number().finite().default(0),
  replaceTargetRange: z.boolean().default(false),
});

const setEasingOperationSchema = z.object({
  op: z.literal("setEasing"),
  ...jointSelectorSchema.shape,
  ...timeRangeSchema.shape,
  easing: easingSchema,
});

const densifyOperationSchema = z.object({
  op: z.literal("densify"),
  ...jointSelectorSchema.shape,
  ...timeRangeSchema.shape,
  interval: z.number().positive().min(1 / 240).max(1).default(1 / 60),
});

const breakdownOperationSchema = z.object({
  op: z.literal("breakdown"),
  joint: z.string().min(1),
  time: z.number().nonnegative(),
  previousTime: z.number().nonnegative(),
  nextTime: z.number().nonnegative(),
  bias: z.number().min(0).max(1).default(0.5),
  arcOffset: vector3Schema.default({ x: 0, y: 0, z: 0 }),
  easing: easingSchema.default({ style: "linear", direction: "inOut" }),
}).refine((value) => value.previousTime < value.time && value.time < value.nextTime, "breakdown time must sit between previousTime and nextTime");

const smoothRangeOperationSchema = z.object({
  op: z.literal("smoothRange"),
  ...jointSelectorSchema.shape,
  ...timeRangeSchema.shape,
  strength: z.number().min(0).max(1).default(0.5),
  passes: z.number().int().min(1).max(10).default(1),
});

const reduceKeysOperationSchema = z.object({
  op: z.literal("reduceKeys"),
  ...jointSelectorSchema.shape,
  ...timeRangeSchema.shape,
  positionTolerance: z.number().nonnegative().max(10).default(0.005),
  rotationToleranceDegrees: z.number().nonnegative().max(45).default(0.25),
});

const cycleOffsetOperationSchema = z.object({
  op: z.literal("cycleOffset"),
  ...jointSelectorSchema.shape,
  ...timeRangeSchema.shape,
  timeOffset: z.number().finite(),
});

const curveResampleOperationSchema = z.object({
  op: z.literal("curveResample"),
  ...jointSelectorSchema.shape,
  ...timeRangeSchema.shape,
  interval: z.number().positive().min(1 / 240).max(1).default(1 / 60),
  interpolation: z.enum(["linear", "cubicHermite", "catmullRom"]).default("cubicHermite"),
  tension: z.number().min(0).max(1).default(0.25),
  preserveOriginalKeys: z.boolean().default(true),
});

const timeWarpOperationSchema = z.object({
  op: z.literal("timeWarp"),
  ...jointSelectorSchema.shape,
  ...timeRangeSchema.shape,
  preset: z.enum(["easeIn", "easeOut", "easeInOut", "anticipate", "overshoot"]).default("easeInOut"),
  strength: z.number().min(0).max(1).default(0.5),
});

export const animationEditOperationSchema = z.discriminatedUnion("op", [
  upsertKeyOperationSchema,
  deleteRangeOperationSchema,
  offsetRangeOperationSchema,
  retimeRangeOperationSchema,
  copyRangeOperationSchema,
  mirrorRangeOperationSchema,
  setEasingOperationSchema,
  densifyOperationSchema,
  breakdownOperationSchema,
  smoothRangeOperationSchema,
  reduceKeysOperationSchema,
  cycleOffsetOperationSchema,
  curveResampleOperationSchema,
  timeWarpOperationSchema,
]);

export const animationEditProgramSchema = z.object({
  name: z.string().min(1).max(160),
  operations: z.array(animationEditOperationSchema).min(1).max(2_000),
});

export type AnimationEditProgram = z.infer<typeof animationEditProgramSchema>;

type PoseKey = AnimationDraft["tracks"][number]["keys"][number];

function normalizeQuaternion(q: PoseKey["transform"]["rotation"]): PoseKey["transform"]["rotation"] {
  const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

function quaternionFromEulerDegrees(rotation: { x: number; y: number; z: number }) {
  const x = rotation.x * Math.PI / 360;
  const y = rotation.y * Math.PI / 360;
  const z = rotation.z * Math.PI / 360;
  const sx = Math.sin(x), cx = Math.cos(x);
  const sy = Math.sin(y), cy = Math.cos(y);
  const sz = Math.sin(z), cz = Math.cos(z);
  return normalizeQuaternion({
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  });
}

function multiplyQuaternion(a: PoseKey["transform"]["rotation"], b: PoseKey["transform"]["rotation"]) {
  return normalizeQuaternion({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  });
}

function scaledQuaternion(q: PoseKey["transform"]["rotation"], scale: { x: number; y: number; z: number }) {
  return normalizeQuaternion({ x: q.x * scale.x, y: q.y * scale.y, z: q.z * scale.z, w: q.w });
}

function mirroredQuaternion(q: PoseKey["transform"]["rotation"], axis: "x" | "y" | "z") {
  if (axis === "x") return normalizeQuaternion({ x: q.x, y: -q.y, z: -q.z, w: q.w });
  if (axis === "y") return normalizeQuaternion({ x: -q.x, y: q.y, z: -q.z, w: q.w });
  return normalizeQuaternion({ x: -q.x, y: -q.y, z: q.z, w: q.w });
}

function interpolateKey(a: PoseKey, b: PoseKey, time: number): PoseKey {
  const span = b.time - a.time;
  const alpha = span <= 0 ? 0 : (time - a.time) / span;
  let br = b.transform.rotation;
  const ar = a.transform.rotation;
  if (ar.x * br.x + ar.y * br.y + ar.z * br.z + ar.w * br.w < 0) {
    br = { x: -br.x, y: -br.y, z: -br.z, w: -br.w };
  }
  return {
    time,
    transform: {
      position: {
        x: a.transform.position.x + (b.transform.position.x - a.transform.position.x) * alpha,
        y: a.transform.position.y + (b.transform.position.y - a.transform.position.y) * alpha,
        z: a.transform.position.z + (b.transform.position.z - a.transform.position.z) * alpha,
      },
      rotation: normalizeQuaternion({
        x: ar.x + (br.x - ar.x) * alpha,
        y: ar.y + (br.y - ar.y) * alpha,
        z: ar.z + (br.z - ar.z) * alpha,
        w: ar.w + (br.w - ar.w) * alpha,
      }),
    },
    easing: a.easing,
    weight: a.weight + (b.weight - a.weight) * alpha,
  };
}

function nlerpRotation(a: PoseKey["transform"]["rotation"], bValue: PoseKey["transform"]["rotation"], alpha: number) {
  let b = bValue;
  if (a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0) b = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
  return normalizeQuaternion({
    x: a.x + (b.x - a.x) * alpha,
    y: a.y + (b.y - a.y) * alpha,
    z: a.z + (b.z - a.z) * alpha,
    w: a.w + (b.w - a.w) * alpha,
  });
}

function curveKeyAt(keys: PoseKey[], time: number, mode: "linear" | "cubicHermite" | "catmullRom", tension: number): PoseKey {
  const right = keys.findIndex((key) => key.time >= time);
  if (right <= 0) return structuredClone(keys[0]!);
  if (right < 0) return structuredClone(keys.at(-1)!);
  const a = keys[right - 1]!, b = keys[right]!;
  const span = Math.max(1e-8, b.time - a.time);
  const u = Math.min(1, Math.max(0, (time - a.time) / span));
  if (mode === "linear") return interpolateKey(a, b, time);
  const previous = keys[Math.max(0, right - 2)]!;
  const next = keys[Math.min(keys.length - 1, right + 1)]!;
  const result = interpolateKey(a, b, time);
  const smoothU = u * u * (3 - 2 * u);
  result.transform.rotation = nlerpRotation(a.transform.rotation, b.transform.rotation, smoothU);
  for (const axis of ["x", "y", "z"] as const) {
    const p0 = a.transform.position[axis], p1 = b.transform.position[axis];
    const automaticOut = ((b.transform.position[axis] - previous.transform.position[axis]) / Math.max(1e-8, b.time - previous.time)) * (1 - tension);
    const automaticIn = ((next.transform.position[axis] - a.transform.position[axis]) / Math.max(1e-8, next.time - a.time)) * (1 - tension);
    const m0 = (a.tangentOut?.[axis] ?? automaticOut) * span;
    const m1 = (b.tangentIn?.[axis] ?? automaticIn) * span;
    const u2 = u * u, u3 = u2 * u;
    result.transform.position[axis] = (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
  }
  result.easing = { style: "linear", direction: "inOut" };
  return result;
}

function warpAlpha(alpha: number, preset: "easeIn" | "easeOut" | "easeInOut" | "anticipate" | "overshoot", strength: number): number {
  const linear = alpha;
  let shaped = alpha;
  if (preset === "easeIn") shaped = alpha * alpha;
  else if (preset === "easeOut") shaped = 1 - (1 - alpha) * (1 - alpha);
  else if (preset === "easeInOut") shaped = alpha * alpha * (3 - 2 * alpha);
  else if (preset === "anticipate") shaped = alpha * alpha * ((2.2 + 1) * alpha - 2.2);
  else {
    const t = alpha - 1;
    shaped = 1 + t * t * ((2.2 + 1) * t + 2.2);
  }
  return Math.min(1, Math.max(0, linear + (shaped - linear) * strength));
}

function blendKeys(a: PoseKey, b: PoseKey, alpha: number, time = a.time): PoseKey {
  const syntheticA = { ...a, time: 0 };
  const syntheticB = { ...b, time: 1 };
  const result = interpolateKey(syntheticA, syntheticB, alpha);
  result.time = time;
  return result;
}

function quaternionDistanceDegrees(a: PoseKey["transform"]["rotation"], b: PoseKey["transform"]["rotation"]): number {
  const dot = Math.min(1, Math.max(-1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w)));
  return (2 * Math.acos(dot) * 180) / Math.PI;
}

function sortAndDeduplicate(keys: PoseKey[]): PoseKey[] {
  const sorted = [...keys].sort((a, b) => a.time - b.time);
  const result: PoseKey[] = [];
  for (const key of sorted) {
    const previous = result.at(-1);
    if (previous && Math.abs(previous.time - key.time) < 1e-6) result[result.length - 1] = key;
    else result.push(key);
  }
  return result;
}

export function applyAnimationEditProgram(draftValue: unknown, programValue: unknown): AnimationDraft {
  const draft = structuredClone(animationDraftSchema.parse(draftValue));
  const program = animationEditProgramSchema.parse(programValue);
  const track = (joint: string, create = false) => {
    let value = draft.tracks.find((candidate) => candidate.joint === joint);
    if (!value && create) {
      value = { joint, space: "motor", keys: [] };
      draft.tracks.push(value);
    }
    if (!value) throw new Error(`Unknown joint track: ${joint}`);
    return value;
  };

  for (const operation of program.operations) {
    if (operation.op === "upsertKey") {
      const target = track(operation.joint, true);
      if (operation.space) target.space = operation.space;
      target.keys = target.keys.filter((key) => Math.abs(key.time - operation.key.time) > operation.tolerance);
      target.keys.push(structuredClone(operation.key));
      target.keys = sortAndDeduplicate(target.keys);
      draft.duration = Math.max(draft.duration, operation.key.time);
      continue;
    }
    if (operation.op === "deleteRange") {
      for (const joint of operation.joints) {
        const target = track(joint);
        target.keys = target.keys.filter((key) => key.time < operation.startTime || key.time > operation.endTime);
      }
      continue;
    }
    if (operation.op === "offsetRange") {
      const delta = quaternionFromEulerDegrees(operation.rotationDegreesDelta);
      for (const joint of operation.joints) {
        const target = track(joint);
        for (const key of target.keys) if (key.time >= operation.startTime && key.time <= operation.endTime) {
          key.transform.position.x += operation.positionDelta.x;
          key.transform.position.y += operation.positionDelta.y;
          key.transform.position.z += operation.positionDelta.z;
          key.transform.rotation = multiplyQuaternion(key.transform.rotation, delta);
          key.weight = Math.min(1, key.weight * operation.weightScale);
        }
      }
      continue;
    }
    if (operation.op === "retimeRange") {
      const oldSpan = operation.endTime - operation.startTime;
      const newSpan = operation.newEndTime - operation.newStartTime;
      for (const joint of operation.joints) {
        const target = track(joint);
        for (const key of target.keys) if (key.time >= operation.startTime && key.time <= operation.endTime) {
          const alpha = oldSpan <= 0 ? 0 : (key.time - operation.startTime) / oldSpan;
          key.time = operation.newStartTime + alpha * newSpan;
        }
        target.keys = sortAndDeduplicate(target.keys);
      }
      draft.duration = Math.max(draft.duration, operation.newEndTime);
      continue;
    }
    if (operation.op === "copyRange" || operation.op === "mirrorRange") {
      const source = track(operation.sourceJoint);
      const target = track(operation.targetJoint, true);
      const copied = source.keys
        .filter((key) => key.time >= operation.startTime && key.time <= operation.endTime)
        .map((key) => {
          const clone = structuredClone(key);
          clone.time += operation.timeOffset;
          if (operation.op === "copyRange") {
            clone.transform.position = {
              x: clone.transform.position.x * operation.positionScale.x,
              y: clone.transform.position.y * operation.positionScale.y,
              z: clone.transform.position.z * operation.positionScale.z,
            };
            clone.transform.rotation = scaledQuaternion(clone.transform.rotation, operation.rotationScale);
          } else {
            clone.transform.position[operation.axis] *= -1;
            clone.transform.rotation = mirroredQuaternion(clone.transform.rotation, operation.axis);
          }
          return clone;
        });
      if (operation.replaceTargetRange) {
        const start = operation.startTime + operation.timeOffset;
        const end = operation.endTime + operation.timeOffset;
        target.keys = target.keys.filter((key) => key.time < start || key.time > end);
      }
      target.keys = sortAndDeduplicate([...target.keys, ...copied]);
      if (copied.length) draft.duration = Math.max(draft.duration, copied.at(-1)!.time);
      continue;
    }
    if (operation.op === "setEasing") {
      for (const joint of operation.joints) {
        const target = track(joint);
        for (const key of target.keys) if (key.time >= operation.startTime && key.time <= operation.endTime) {
          key.easing = structuredClone(operation.easing);
        }
      }
      continue;
    }
    if (operation.op === "densify") {
      for (const joint of operation.joints) {
        const target = track(joint);
        const additions: PoseKey[] = [];
        for (let index = 0; index < target.keys.length - 1; index += 1) {
          const a = target.keys[index]!, b = target.keys[index + 1]!;
          const start = Math.max(a.time, operation.startTime);
          const end = Math.min(b.time, operation.endTime);
          for (let time = start + operation.interval; time < end - 1e-7; time += operation.interval) {
            additions.push(interpolateKey(a, b, Number(time.toFixed(6))));
          }
        }
        target.keys = sortAndDeduplicate([...target.keys, ...additions]);
      }
      continue;
    }
    if (operation.op === "breakdown") {
      const target = track(operation.joint);
      const previous = target.keys.find((key) => Math.abs(key.time - operation.previousTime) < 1e-6);
      const next = target.keys.find((key) => Math.abs(key.time - operation.nextTime) < 1e-6);
      if (!previous || !next) throw new Error(`breakdown requires exact boundary keys on ${operation.joint}`);
      const key = blendKeys(previous, next, operation.bias, operation.time);
      key.time = operation.time;
      key.transform.position.x += operation.arcOffset.x;
      key.transform.position.y += operation.arcOffset.y;
      key.transform.position.z += operation.arcOffset.z;
      key.easing = structuredClone(operation.easing);
      target.keys = sortAndDeduplicate([...target.keys.filter((candidate) => Math.abs(candidate.time - operation.time) > 1e-6), key]);
      continue;
    }
    if (operation.op === "smoothRange") {
      for (const joint of operation.joints) {
        const target = track(joint);
        for (let pass = 0; pass < operation.passes; pass += 1) {
          const source = structuredClone(target.keys);
          for (let index = 1; index < source.length - 1; index += 1) {
            const current = source[index]!;
            if (current.time < operation.startTime || current.time > operation.endTime) continue;
            const predicted = interpolateKey(source[index - 1]!, source[index + 1]!, current.time);
            const smoothed = blendKeys(current, predicted, operation.strength, current.time);
            smoothed.time = current.time;
            smoothed.easing = current.easing;
            target.keys[index] = smoothed;
          }
        }
      }
      continue;
    }
    if (operation.op === "reduceKeys") {
      for (const joint of operation.joints) {
        const target = track(joint);
        let changed = true;
        while (changed) {
          changed = false;
          for (let index = 1; index < target.keys.length - 1; index += 1) {
            const current = target.keys[index]!;
            if (current.time <= operation.startTime || current.time >= operation.endTime) continue;
            const predicted = interpolateKey(target.keys[index - 1]!, target.keys[index + 1]!, current.time);
            const positionError = Math.hypot(
              current.transform.position.x - predicted.transform.position.x,
              current.transform.position.y - predicted.transform.position.y,
              current.transform.position.z - predicted.transform.position.z,
            );
            const rotationError = quaternionDistanceDegrees(current.transform.rotation, predicted.transform.rotation);
            if (positionError <= operation.positionTolerance && rotationError <= operation.rotationToleranceDegrees) {
              target.keys.splice(index, 1);
              changed = true;
              break;
            }
          }
        }
      }
      continue;
    }
    if (operation.op === "cycleOffset") {
      const span = operation.endTime - operation.startTime;
      if (span <= 0) throw new Error("cycleOffset requires a non-zero range");
      for (const joint of operation.joints) {
        const target = track(joint);
        for (const key of target.keys) if (key.time >= operation.startTime && key.time <= operation.endTime) {
          const local = (key.time - operation.startTime + operation.timeOffset) % span;
          key.time = operation.startTime + (local < 0 ? local + span : local);
        }
        target.keys = sortAndDeduplicate(target.keys);
      }
      continue;
    }
    if (operation.op === "curveResample") {
      for (const joint of operation.joints) {
        const target = track(joint);
        const source = structuredClone(target.keys);
        const sampled: PoseKey[] = [];
        for (let time = operation.startTime; time <= operation.endTime + 1e-7; time += operation.interval) {
          sampled.push(curveKeyAt(source, Number(Math.min(time, operation.endTime).toFixed(6)), operation.interpolation, operation.tension));
        }
        const outside = target.keys.filter((key) => key.time < operation.startTime || key.time > operation.endTime);
        const originals = operation.preserveOriginalKeys
          ? target.keys.filter((key) => key.time >= operation.startTime && key.time <= operation.endTime)
          : [];
        target.keys = sortAndDeduplicate([...outside, ...originals, ...sampled]);
      }
      continue;
    }
    if (operation.op === "timeWarp") {
      const span = operation.endTime - operation.startTime;
      if (span <= 0) throw new Error("timeWarp requires a non-zero range");
      for (const joint of operation.joints) {
        const target = track(joint);
        for (const key of target.keys) if (key.time >= operation.startTime && key.time <= operation.endTime) {
          const alpha = (key.time - operation.startTime) / span;
          key.time = operation.startTime + warpAlpha(alpha, operation.preset, operation.strength) * span;
        }
        target.keys = sortAndDeduplicate(target.keys);
      }
    }
  }

  draft.tracks = draft.tracks.filter((value) => value.keys.length > 0);
  return animationDraftSchema.parse(draft);
}
