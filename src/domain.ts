import { z } from "zod";

export const vector3Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

export const quaternionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  w: z.number().finite(),
});

export const transformSchema = z.object({
  position: vector3Schema,
  rotation: quaternionSchema,
});

export const easingSchema = z.object({
  style: z.enum([
    "linear",
    "constant",
    "cubic",
    "cubicV2",
    "elastic",
    "bounce",
  ]),
  direction: z.enum(["in", "out", "inOut"]),
});

export const poseKeySchema = z.object({
  time: z.number().nonnegative(),
  transform: transformSchema,
  easing: easingSchema,
  weight: z.number().min(0).max(1).default(1),
  tangentIn: vector3Schema.optional(),
  tangentOut: vector3Schema.optional(),
});

export const jointTrackSchema = z.object({
  joint: z.string().min(1),
  space: z
    .enum(["local", "motor", "parent", "character", "world"])
    .default("motor")
    .describe(
      "motor/local is raw Motor6D.Transform space; parent is anatomical Part0 space; character/world require hierarchical solving.",
    ),
  keys: z.array(poseKeySchema).min(1),
});

export const contactSchema = z.object({
  id: z.string().min(1),
  effector: z.string().min(1),
  target: z.string().min(1),
  startTime: z.number().nonnegative(),
  endTime: z.number().nonnegative(),
  positionWeight: z.number().min(0).max(1).default(1),
  rotationWeight: z.number().min(0).max(1).default(0),
  allowSlideMeters: z.number().nonnegative().default(0.005),
});

export const performanceBeatSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  startTime: z.number().nonnegative(),
  endTime: z.number().nonnegative(),
  intention: z.string().min(1),
  energy: z.number().min(0).max(1),
  leadingBodyPart: z.string().optional(),
  focalTarget: z.string().optional(),
});

export const animationDraftSchema = z.object({
  name: z.string().min(1),
  rigId: z.string().min(1),
  duration: z.number().positive().max(300),
  framesPerSecond: z.number().int().min(12).max(120).default(30),
  looped: z.boolean().default(false),
  priority: z.enum(["core", "idle", "movement", "action", "action2", "action3", "action4"]),
  authoredHipHeight: z.number().optional(),
  beats: z.array(performanceBeatSchema).default([]),
  contacts: z.array(contactSchema).default([]),
  tracks: z.array(jointTrackSchema),
  metadata: z
    .object({
      intent: z.string().optional(),
      rigType: z.enum(["R6", "R15", "Custom"]).optional(),
      style: z.array(z.string()).default([]),
      version: z.literal(1),
    })
    .default({ style: [], version: 1 }),
});

export const qualityMetricSchema = z.object({
  name: z.string().min(1),
  score: z.number().min(0).max(1),
  severity: z.enum(["info", "warning", "error"]),
  timeStart: z.number().nonnegative().optional(),
  timeEnd: z.number().nonnegative().optional(),
  joints: z.array(z.string()).default([]),
  explanation: z.string(),
  suggestedAction: z.string().optional(),
});

export const qualityReportSchema = z.object({
  overallScore: z.number().min(0).max(1),
  metrics: z.array(qualityMetricSchema),
  blockingIssues: z.array(z.string()),
});

export type AnimationDraft = z.infer<typeof animationDraftSchema>;
export type QualityReport = z.infer<typeof qualityReportSchema>;

export function validateTemporalIntegrity(draft: AnimationDraft): string[] {
  const problems: string[] = [];

  for (const beat of draft.beats) {
    if (beat.endTime <= beat.startTime) {
      problems.push(`Beat ${beat.id} must end after it starts.`);
    }
    if (beat.endTime > draft.duration) {
      problems.push(`Beat ${beat.id} extends past the animation duration.`);
    }
  }

  for (const contact of draft.contacts) {
    if (contact.endTime < contact.startTime) {
      problems.push(`Contact ${contact.id} ends before it starts.`);
    }
    if (contact.endTime > draft.duration) {
      problems.push(`Contact ${contact.id} extends past the animation duration.`);
    }
  }

  for (const track of draft.tracks) {
    let previous = -1;
    for (const key of track.keys) {
      if (key.time < previous) {
        problems.push(`Track ${track.joint} has keys out of chronological order.`);
        break;
      }
      if (key.time > draft.duration) {
        problems.push(`Track ${track.joint} has a key past the animation duration.`);
      }
      previous = key.time;
    }
  }

  return problems;
}
