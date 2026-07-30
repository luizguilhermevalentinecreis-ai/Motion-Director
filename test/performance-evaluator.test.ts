import assert from "node:assert/strict";
import test from "node:test";
import { animationDraftSchema, type AnimationDraft } from "../src/domain.js";
import { evaluatePerformance } from "../src/performance-evaluator.js";

function quaternion(xDegrees: number) {
  const half = xDegrees * Math.PI / 360;
  return { x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) };
}

function draftFor(
  style: string[],
  duration: number,
  angles: Record<string, number[]>,
  positions?: number[],
): AnimationDraft {
  const count = Math.max(...Object.values(angles).map((values) => values.length));
  return animationDraftSchema.parse({
    name: "Evaluator fixture",
    rigId: "selection:1",
    duration,
    framesPerSecond: 30,
    looped: false,
    priority: "action",
    beats: [
      {
        id: "action",
        label: "Action",
        startTime: 0,
        endTime: duration,
        intention: "Exercise the evaluator",
        energy: 1,
      },
    ],
    contacts: [],
    tracks: Object.entries(angles).map(([joint, values]) => ({
      joint,
      space: "parent",
      keys: values.map((angle, index) => ({
        time: index * duration / Math.max(1, count - 1),
        transform: {
          position: {
            x: 0,
            y: joint === "Torso" ? (positions?.[index] ?? 0) : 0,
            z: 0,
          },
          rotation: quaternion(angle),
        },
        easing: { style: "cubicV2", direction: "inOut" },
        weight: 1,
      })),
    })),
    metadata: { rigType: "R6", style, version: 1 },
  });
}

test("rejects a forward dash that is actually an opposing run stride", () => {
  const draft = draftFor(["r6", "dash", "forward"], 0.36, {
    Torso: [0, -24, 0],
    Head: [0, 15, 0],
    "Right Arm": [0, 70, 0],
    "Left Arm": [0, -35, 0],
    "Right Leg": [0, -60, 0],
    "Left Leg": [0, 50, 0],
  });
  const metric = evaluatePerformance(draft).find(
    (candidate) => candidate.name === "forward_dash_readability",
  );
  assert.ok(metric);
  assert.ok(metric.score < 0.8);
});

test("accepts a unified arrow silhouette for a forward dash", () => {
  const draft = draftFor(["r6", "dash", "forward"], 0.3, {
    Torso: [0, -42, 0],
    Head: [0, 30, 0],
    "Right Arm": [0, 86, 0],
    "Left Arm": [0, 86, 0],
    "Right Leg": [0, -64, 0],
    "Left Leg": [0, -40, 0],
  });
  const metric = evaluatePerformance(draft).find(
    (candidate) => candidate.name === "forward_dash_readability",
  );
  assert.ok(metric);
  assert.ok(metric.score >= 0.95);
});

test("recognizes a continuous keyed backflip instead of losing the full turn", () => {
  const pitch = [0, 34, 76, 128, 182, 238, 289, 329, 351, 368, 360];
  const draft = draftFor(
    ["r6", "backflip"],
    1.05,
    {
      Torso: pitch,
      Head: pitch.map((value) => value * -0.08),
      "Right Arm": [0, -132, -105, -48, -30, -35, -72, -25, 18, 38, 0],
      "Left Arm": [0, -132, -105, -48, -30, -35, -72, -25, 18, 38, 0],
      "Right Leg": [0, -12, 46, 88, 104, 92, 48, 18, 22, 25, 0],
      "Left Leg": [0, -12, 46, 88, 104, 92, 48, 18, 22, 25, 0],
    },
    [0, 0.02, 0.24, 0.37, 0.43, 0.36, 0.23, 0.07, -0.13, -0.21, 0],
  );
  const metric = evaluatePerformance(draft).find(
    (candidate) => candidate.name === "backflip_rotation_continuity",
  );
  assert.ok(metric);
  assert.ok(metric.score >= 0.85);
});

test("distinguishes a valid run start handoff from a neutral-to-neutral gesture", () => {
  const draft = draftFor(["r6", "locomotion-start"], 0.42, {
    Torso: [0, -8],
    Head: [0, 6],
    "Right Arm": [0, 38],
    "Left Arm": [0, -38],
    "Right Leg": [0, -46],
    "Left Leg": [0, 46],
  });
  const metric = evaluatePerformance(draft).find(
    (candidate) => candidate.name === "locomotion_transition_handoff",
  );
  assert.ok(metric);
  assert.ok(metric.score >= 0.8);
});

test("requires head lead and torso direction in a left turn", () => {
  const draft = draftFor(["r6", "turn-left"], 0.48, {
    Torso: [0, 0],
    Head: [0, 0],
    "Right Arm": [0, 25],
    "Left Arm": [0, -25],
    "Right Leg": [0, -30],
    "Left Leg": [0, 30],
  });
  const yaw = (degrees: number) => {
    const half = degrees * Math.PI / 360;
    return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
  };
  draft.tracks.find((track) => track.joint === "Torso")!.keys[1]!.transform.rotation = yaw(26);
  draft.tracks.find((track) => track.joint === "Head")!.keys[1]!.transform.rotation = yaw(38);
  const metric = evaluatePerformance(draft).find(
    (candidate) => candidate.name === "turn_direction_readability",
  );
  assert.ok(metric);
  assert.ok(metric.score >= 0.95);
});

test("tracks a complete forward roll through wrapped pitch angles", () => {
  const pitch = [0, -55, -110, -170, -225, -285, -335, -360];
  const draft = draftFor(["r6", "forward-roll"], 0.78, {
    Torso: pitch,
    Head: pitch.map(() => 8),
    "Right Arm": pitch.map((_, index) => index === 0 ? 0 : -40),
    "Left Arm": pitch.map((_, index) => index === 0 ? 0 : -40),
    "Right Leg": pitch.map((_, index) => index === 0 ? 0 : 65),
    "Left Leg": pitch.map((_, index) => index === 0 ? 0 : 65),
  });
  const metric = evaluatePerformance(draft).find(
    (candidate) => candidate.name === "roll_rotation_continuity",
  );
  assert.ok(metric);
  assert.ok(metric.score >= 0.95);
});

test("rejects a punch where the torso moves but the striking arm barely commits", () => {
  const draft = draftFor(["r6", "combat-strike", "right-hand"], 0.42, {
    Torso: [0, -30, 20, 0],
    Head: [0, 12, -8, 0],
    "Right Arm": [0, -8, -10, 0],
    "Left Arm": [0, -20, -15, 0],
    "Right Leg": [0, 12, -8, 0],
    "Left Leg": [0, -12, 8, 0],
  });
  draft.beats = [
    { id: "anticipation", label: "Anticipation", startTime: 0, endTime: 0.16, intention: "Load", energy: 0.5 },
    { id: "impact", label: "Impact", startTime: 0.2, endTime: 0.25, intention: "Hit", energy: 1 },
    { id: "recover", label: "Recover", startTime: 0.25, endTime: 0.42, intention: "Recover", energy: 0.5 },
  ];
  const metric = evaluatePerformance(draft).find(
    (candidate) => candidate.name === "combat_strike_commitment",
  );
  assert.ok(metric);
  assert.ok(metric.score < 0.8);
});

test("rejects dense motion that restarts InOut easing on every sample", () => {
  const draft = draftFor(["r6", "dense-sampled"], 0.3, {
    Torso: [0, 8, 18, 30, 38, 42, 38, 28, 15, 0],
    Head: [0, -2, -6, -12, -18, -22, -20, -14, -7, 0],
    "Right Arm": [0, 10, 25, 45, 65, 78, 70, 50, 25, 0],
    "Left Arm": [0, 8, 20, 38, 58, 70, 62, 44, 22, 0],
    "Right Leg": [0, -8, -18, -30, -42, -52, -45, -30, -15, 0],
    "Left Leg": [0, -6, -14, -24, -34, -42, -36, -25, -12, 0],
  });
  const metric = evaluatePerformance(draft).find(
    (candidate) => candidate.name === "easing_velocity_continuity",
  );
  assert.ok(metric);
  assert.equal(metric.score, 0);
});

test("accepts linearly interpolated samples of an already-designed smooth curve", () => {
  const draft = draftFor(["r6", "dense-sampled"], 0.3, {
    Torso: [0, 8, 18, 30, 38, 42, 38, 28, 15, 0],
    Head: [0, -1, -4, -9, -15, -20, -22, -18, -10, 0],
    "Right Arm": [0, 10, 25, 45, 65, 78, 72, 55, 30, 0],
    "Left Arm": [0, 5, 15, 30, 48, 63, 70, 60, 36, 0],
    "Right Leg": [0, -6, -16, -28, -42, -52, -48, -36, -20, 0],
    "Left Leg": [0, -3, -10, -20, -32, -42, -45, -38, -24, 0],
  });
  for (const track of draft.tracks) {
    for (const key of track.keys) key.easing.style = "linear";
  }
  const metric = evaluatePerformance(draft).find(
    (candidate) => candidate.name === "easing_velocity_continuity",
  );
  assert.ok(metric);
  assert.equal(metric.score, 1);
});
