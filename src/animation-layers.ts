import { z } from "zod";
import { animationDraftSchema, type AnimationDraft } from "./domain.js";

export const animationLayerOptionsSchema = z.object({
  name: z.string().min(1).max(160),
  mode: z.enum(["override", "additive"]).default("additive"),
  weight: z.number().min(0).max(1).default(1),
  jointMask: z.array(z.string().min(1)).max(128).optional(),
  startTime: z.number().nonnegative().default(0),
  endTime: z.number().nonnegative().optional(),
  timeOffset: z.number().finite().default(0),
  timeScale: z.number().positive().min(0.01).max(100).default(1),
  additiveReferenceTime: z.number().nonnegative().default(0),
  sampleRate: z.number().int().min(12).max(240).default(60),
});

type Key = AnimationDraft["tracks"][number]["keys"][number];
type Quaternion = Key["transform"]["rotation"];

function normalized(q: Quaternion): Quaternion {
  const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}
function inverse(q: Quaternion): Quaternion { return normalized({ x: -q.x, y: -q.y, z: -q.z, w: q.w }); }
function multiply(a: Quaternion, b: Quaternion): Quaternion {
  return normalized({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  });
}
function slerpRotation(a: Quaternion, bValue: Quaternion, alpha: number): Quaternion {
  let b = bValue;
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  if (dot < 0) { b = { x: -b.x, y: -b.y, z: -b.z, w: -b.w }; dot = -dot; }
  dot = Math.min(1, Math.max(-1, dot));
  if (dot > 0.9995) return normalized({ x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha, z: a.z + (b.z - a.z) * alpha, w: a.w + (b.w - a.w) * alpha });
  const theta = Math.acos(dot);
  const denominator = Math.sin(theta);
  const left = Math.sin((1 - alpha) * theta) / denominator;
  const right = Math.sin(alpha * theta) / denominator;
  return normalized({ x: a.x * left + b.x * right, y: a.y * left + b.y * right, z: a.z * left + b.z * right, w: a.w * left + b.w * right });
}
function neutral(time: number): Key {
  return { time, transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }, easing: { style: "linear", direction: "inOut" }, weight: 1 };
}
function sampleAtIndex(keys: Key[], time: number, right: number): Key {
  if (!keys.length) return neutral(time);
  if (time <= keys[0]!.time) return { ...structuredClone(keys[0]!), time };
  if (time >= keys.at(-1)!.time) return { ...structuredClone(keys.at(-1)!), time };
  const a = keys[right - 1]!, b = keys[right]!;
  const alpha = (time - a.time) / Math.max(1e-8, b.time - a.time);
  return {
    time,
    transform: {
      position: {
        x: a.transform.position.x + (b.transform.position.x - a.transform.position.x) * alpha,
        y: a.transform.position.y + (b.transform.position.y - a.transform.position.y) * alpha,
        z: a.transform.position.z + (b.transform.position.z - a.transform.position.z) * alpha,
      },
      rotation: slerpRotation(a.transform.rotation, b.transform.rotation, alpha),
    },
    easing: { style: "linear", direction: "inOut" }, weight: a.weight + (b.weight - a.weight) * alpha,
  };
}

function sample(keys: Key[], time: number): Key {
  if (!keys.length) return neutral(time);
  let low = 0, high = keys.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (keys[middle]!.time < time) low = middle + 1; else high = middle;
  }
  return sampleAtIndex(keys, time, low);
}

function monotonicSampler(keys: Key[]) {
  let right = Math.min(1, Math.max(0, keys.length - 1));
  return (time: number): Key => {
    while (right < keys.length - 1 && keys[right]!.time < time) right += 1;
    return sampleAtIndex(keys, time, right);
  };
}

function sampleTimes(duration: number, sampleRate: number): number[] {
  const frameCount = Math.floor(duration * sampleRate + 1e-9);
  const times = Array.from({ length: frameCount + 1 }, (_, index) => Number((index / sampleRate).toFixed(9)));
  const last = times.at(-1) ?? 0;
  if (duration - last > 1e-8) times.push(duration);
  else times[times.length - 1] = duration;
  return times;
}

export function composeAnimationLayer(baseValue: unknown, layerValue: unknown, optionsValue: unknown): AnimationDraft {
  const base = structuredClone(animationDraftSchema.parse(baseValue));
  const layer = animationDraftSchema.parse(layerValue);
  const options = animationLayerOptionsSchema.parse(optionsValue);
  if (options.startTime > base.duration) throw new Error(`Layer startTime ${options.startTime} exceeds base duration ${base.duration}.`);
  if (options.endTime !== undefined && options.endTime < options.startTime) throw new Error("Layer endTime must be greater than or equal to startTime.");
  const endTime = Math.min(base.duration, options.endTime ?? base.duration);
  const mask = options.jointMask ? new Set(options.jointMask) : undefined;
  const layerByJoint = new Map(layer.tracks.map((track) => [track.joint, track]));
  const baseByJoint = new Map(base.tracks.map((track) => [track.joint, track]));
  for (const [joint, layerTrack] of layerByJoint) {
    if (mask && !mask.has(joint)) continue;
    let baseTrack = baseByJoint.get(joint);
    if (!baseTrack) {
      baseTrack = { joint, space: layerTrack.space, keys: [neutral(0), neutral(base.duration)] };
      base.tracks.push(baseTrack); baseByJoint.set(joint, baseTrack);
    }
    if (baseTrack.space !== layerTrack.space) {
      throw new Error(`Cannot compose joint ${joint}: base space ${baseTrack.space} is incompatible with layer space ${layerTrack.space}. Convert both tracks to the same space first.`);
    }
    const reference = sample(layerTrack.keys, options.additiveReferenceTime);
    const output: Key[] = [];
    const baseSample = monotonicSampler(baseTrack.keys);
    const layerSample = monotonicSampler(layerTrack.keys);
    for (const exactTime of sampleTimes(base.duration, options.sampleRate)) {
      const baseKey = baseSample(exactTime);
      if (exactTime < options.startTime || exactTime > endTime) { output.push(baseKey); continue; }
      const layerTime = (exactTime - options.timeOffset) / options.timeScale;
      const layerKey = layerSample(layerTime);
      if (options.mode === "override") {
        baseKey.transform.position.x += (layerKey.transform.position.x - baseKey.transform.position.x) * options.weight;
        baseKey.transform.position.y += (layerKey.transform.position.y - baseKey.transform.position.y) * options.weight;
        baseKey.transform.position.z += (layerKey.transform.position.z - baseKey.transform.position.z) * options.weight;
        baseKey.transform.rotation = slerpRotation(baseKey.transform.rotation, layerKey.transform.rotation, options.weight);
      } else {
        baseKey.transform.position.x += (layerKey.transform.position.x - reference.transform.position.x) * options.weight;
        baseKey.transform.position.y += (layerKey.transform.position.y - reference.transform.position.y) * options.weight;
        baseKey.transform.position.z += (layerKey.transform.position.z - reference.transform.position.z) * options.weight;
        const delta = multiply(inverse(reference.transform.rotation), layerKey.transform.rotation);
        baseKey.transform.rotation = multiply(baseKey.transform.rotation, slerpRotation({ x: 0, y: 0, z: 0, w: 1 }, delta, options.weight));
      }
      output.push(baseKey);
    }
    baseTrack.keys = output;
  }
  base.bakeMode = "denseLinear";
  base.bakeFramesPerSecond = options.sampleRate;
  base.metadata.style = [...new Set([...base.metadata.style, `layer:${options.name}`, `layer-mode:${options.mode}`])];
  return animationDraftSchema.parse(base);
}
