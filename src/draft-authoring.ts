import { z } from "zod";
import {
  animationDraftSchema,
  contactSchema,
  easingSchema,
  performanceBeatSchema,
  vector3Schema,
  type AnimationDraft,
} from "./domain.js";

const authoredPoseKeySchema = z.object({
  time: z.number().nonnegative(),
  position: vector3Schema.default({ x: 0, y: 0, z: 0 }),
  rotationDegrees: vector3Schema,
  easing: easingSchema.default({ style: "cubicV2", direction: "inOut" }),
  weight: z.number().min(0).max(1).default(1),
  tangentIn: vector3Schema.optional(),
  tangentOut: vector3Schema.optional(),
});

const authoredJointTrackSchema = z.object({
  joint: z.string().min(1),
  space: z.enum(["local", "motor", "parent", "character", "world"]).default("parent"),
  keys: z.array(authoredPoseKeySchema).min(1),
});

export const animationBlueprintSchema = z.object({
  name: z.string().min(1),
  rigId: z.string().min(1),
  rigType: z.enum(["R6", "R15", "Custom"]),
  duration: z.number().positive().max(300),
  framesPerSecond: z.number().int().min(12).max(120).default(30),
  looped: z.boolean().default(false),
  priority: z.enum(["core", "idle", "movement", "action", "action2", "action3", "action4"]),
  authoredHipHeight: z.number().optional(),
  intent: z.string().min(1),
  style: z.array(z.string()).default([]),
  beats: z.array(performanceBeatSchema).default([]),
  contacts: z.array(contactSchema).default([]),
  tracks: z.array(authoredJointTrackSchema).min(1),
});

export type AnimationBlueprint = z.infer<typeof animationBlueprintSchema>;

export function quaternionFromEulerDegrees(rotation: {
  x: number;
  y: number;
  z: number;
}): { x: number; y: number; z: number; w: number } {
  const halfX = rotation.x * Math.PI / 360;
  const halfY = rotation.y * Math.PI / 360;
  const halfZ = rotation.z * Math.PI / 360;
  const sx = Math.sin(halfX);
  const cx = Math.cos(halfX);
  const sy = Math.sin(halfY);
  const cy = Math.cos(halfY);
  const sz = Math.sin(halfZ);
  const cz = Math.cos(halfZ);
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };
}

export function draftFromBlueprint(value: unknown): AnimationDraft {
  const blueprint = animationBlueprintSchema.parse(value);
  return animationDraftSchema.parse({
    name: blueprint.name,
    rigId: blueprint.rigId,
    duration: blueprint.duration,
    framesPerSecond: blueprint.framesPerSecond,
    looped: blueprint.looped,
    priority: blueprint.priority,
    ...(blueprint.authoredHipHeight === undefined
      ? {}
      : { authoredHipHeight: blueprint.authoredHipHeight }),
    beats: blueprint.beats,
    contacts: blueprint.contacts,
    tracks: blueprint.tracks.map((track) => ({
      joint: track.joint,
      space: track.space,
      keys: track.keys.map((key) => ({
        time: key.time,
        transform: {
          position: key.position,
          rotation: quaternionFromEulerDegrees(key.rotationDegrees),
        },
        easing: key.easing,
        weight: key.weight,
        ...(key.tangentIn === undefined ? {} : { tangentIn: key.tangentIn }),
        ...(key.tangentOut === undefined ? {} : { tangentOut: key.tangentOut }),
      })),
    })),
    metadata: {
      intent: blueprint.intent,
      rigType: blueprint.rigType,
      style: blueprint.style,
      version: 1,
    },
  });
}
