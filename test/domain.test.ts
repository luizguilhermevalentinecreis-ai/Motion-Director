import assert from "node:assert/strict";
import test from "node:test";
import { animationDraftSchema, validateTemporalIntegrity } from "../src/domain.js";
import { reviewDraft } from "../src/quality.js";

const identity = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
};

test("accepts a semantic professional animation draft", () => {
  const draft = animationDraftSchema.parse({
    name: "Heavy sword strike",
    rigId: "Workspace.Knight",
    duration: 1.2,
    framesPerSecond: 30,
    looped: false,
    priority: "action",
    beats: [
      {
        id: "anticipation",
        label: "Anticipation",
        startTime: 0,
        endTime: 0.4,
        intention: "Load weight into the rear leg",
        energy: 0.35,
      },
      {
        id: "strike",
        label: "Strike",
        startTime: 0.4,
        endTime: 1.2,
        intention: "Drive the weapon through the target",
        energy: 1,
      },
    ],
    contacts: [
      {
        id: "right-foot-lock",
        effector: "RightFoot",
        target: "Ground",
        startTime: 0,
        endTime: 0.8,
      },
    ],
    tracks: [
      {
        joint: "LowerTorso",
        keys: [
          {
            time: 0,
            transform: identity,
            easing: { style: "cubic", direction: "inOut" },
          },
          {
            time: 1.2,
            transform: identity,
            easing: { style: "cubic", direction: "out" },
          },
        ],
      },
    ],
    metadata: {
      intent: "A committed, weighty sword strike",
      style: ["grounded", "cinematic"],
      version: 1,
    },
  });

  assert.deepEqual(validateTemporalIntegrity(draft), []);
  assert.equal(reviewDraft(draft).blockingIssues.length, 0);
});

test("rejects authored content past the duration", () => {
  const draft = animationDraftSchema.parse({
    name: "Broken",
    rigId: "Workspace.Rig",
    duration: 1,
    priority: "action",
    beats: [],
    contacts: [],
    tracks: [
      {
        joint: "Head",
        keys: [
          {
            time: 1.1,
            transform: identity,
            easing: { style: "linear", direction: "inOut" },
          },
        ],
      },
    ],
  });

  assert.match(validateTemporalIntegrity(draft).join(" "), /past the animation duration/);
  assert.equal(reviewDraft(draft).blockingIssues.length, 1);
});

test("uses a wider displacement envelope for intentional R6 combat", () => {
  const draft = animationDraftSchema.parse({
    name: "R6 anime strike",
    rigId: "Workspace.Rig",
    duration: 0.5,
    framesPerSecond: 60,
    looped: false,
    priority: "action",
    beats: [{
      id: "strike",
      label: "Strike",
      startTime: 0,
      endTime: 0.5,
      intention: "Drive through the target",
      energy: 1,
    }],
    contacts: [],
    tracks: [{
      joint: "Right Arm",
      space: "parent",
      keys: [
        { time: 0, transform: identity, easing: { style: "linear", direction: "in" } },
        {
          time: 0.5,
          transform: {
            position: { x: 0.1, y: 0, z: -0.38 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
          },
          easing: { style: "linear", direction: "in" },
        },
      ],
    }],
    metadata: {
      intent: "Purposeful R6 anime combat displacement",
      rigType: "R6",
      style: ["anime-skill", "r6-combat-displacement"],
      version: 1,
    },
  });

  const metric = reviewDraft(draft).metrics.find(
    (candidate) => candidate.name === "r6_combat_displacement_envelope",
  );
  assert.equal(metric?.severity, "info");
  assert.equal(metric?.score, 1);
});

test("uses a contextual displacement envelope for R6 locomotion", () => {
  const draft = animationDraftSchema.parse({
    name: "R6 authored walk",
    rigId: "Workspace.Rig",
    duration: 1,
    framesPerSecond: 60,
    looped: true,
    priority: "movement",
    beats: [{
      id: "cycle",
      label: "Walk cycle",
      startTime: 0,
      endTime: 1,
      intention: "Transfer weight through a grounded step",
      energy: 0.5,
    }],
    contacts: [],
    tracks: [{
      joint: "Left Leg",
      space: "parent",
      keys: [
        { time: 0, transform: identity, easing: { style: "linear", direction: "in" } },
        {
          time: 0.5,
          transform: {
            position: { x: 0.18, y: 0.08, z: -0.38 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
          },
          easing: { style: "linear", direction: "in" },
        },
      ],
    }],
    metadata: {
      intent: "Reference-informed R6 locomotion",
      rigType: "R6",
      style: ["grounded", "locomotion"],
      version: 1,
    },
  });

  const metric = reviewDraft(draft).metrics.find(
    (candidate) => candidate.name === "r6_locomotion_displacement_envelope",
  );
  assert.equal(metric?.severity, "info");
  assert.equal(metric?.score, 1);
});
