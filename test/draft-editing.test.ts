import assert from "node:assert/strict";
import test from "node:test";
import { applyAnimationEditProgram } from "../src/draft-editing.js";

const draft = {
  name: "Editable punch",
  rigId: "Workspace.Rig",
  duration: 1,
  framesPerSecond: 60,
  looped: false,
  priority: "action" as const,
  beats: [], contacts: [],
  tracks: [{
    joint: "Right Arm",
    space: "motor" as const,
    keys: [0, 1].map((time) => ({
      time,
      transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
      easing: { style: "cubicV2" as const, direction: "inOut" as const },
      weight: 1,
    })),
  }],
  metadata: { version: 1 as const, style: [] },
};

test("edits only the requested joint range and densifies it", () => {
  const edited = applyAnimationEditProgram(draft, {
    name: "Stronger arm arc",
    operations: [
      { op: "offsetRange", joints: ["Right Arm"], startTime: 0, endTime: 1, positionDelta: { x: 0, y: -0.2, z: -0.5 }, rotationDegreesDelta: { x: -35, y: 0, z: 12 } },
      { op: "densify", joints: ["Right Arm"], startTime: 0, endTime: 1, interval: 0.25 },
    ],
  });
  assert.equal(edited.tracks[0]?.keys.length, 5);
  assert.equal(edited.tracks[0]?.keys[2]?.transform.position.z, -0.5);
  assert.notEqual(edited.tracks[0]?.keys[2]?.transform.rotation.w, 1);
});

test("mirrors a source track into a new target track", () => {
  const edited = applyAnimationEditProgram(draft, {
    name: "Mirror guard",
    operations: [{ op: "mirrorRange", sourceJoint: "Right Arm", targetJoint: "Left Arm", startTime: 0, endTime: 1, axis: "x" }],
  });
  assert.equal(edited.tracks.length, 2);
  assert.equal(edited.tracks[1]?.joint, "Left Arm");
  assert.equal(edited.tracks[1]?.keys.length, 2);
});

test("creates biased breakdowns and removes visually redundant keys", () => {
  const withBreakdown = applyAnimationEditProgram(draft, {
    name: "Tween-machine breakdown",
    operations: [{
      op: "breakdown", joint: "Right Arm", previousTime: 0, time: 0.5, nextTime: 1,
      bias: 0.35, arcOffset: { x: 0, y: 0.2, z: -0.1 },
    }],
  });
  assert.equal(withBreakdown.tracks[0]?.keys.length, 3);
  assert.equal(withBreakdown.tracks[0]?.keys[1]?.transform.position.y, 0.2);
  const reduced = applyAnimationEditProgram(withBreakdown, {
    name: "Keep the authored arc",
    operations: [{
      op: "reduceKeys", joints: ["Right Arm"], startTime: 0, endTime: 1,
      positionTolerance: 0.01, rotationToleranceDegrees: 0.5,
    }],
  });
  assert.equal(reduced.tracks[0]?.keys.length, 3, "the non-linear arc key must survive reduction");
});

test("resamples authored tangents locally and applies a time warp", () => {
  const curved: any = structuredClone(draft);
  curved.tracks[0]!.keys[0]!.tangentOut = { x: 0, y: 2, z: 0 };
  curved.tracks[0]!.keys[1]!.tangentIn = { x: 0, y: -2, z: 0 };
  const edited = applyAnimationEditProgram(curved, {
    name: "Preserve authored arc",
    operations: [
      { op: "curveResample", joints: ["Right Arm"], startTime: 0, endTime: 1, interval: 0.25, interpolation: "cubicHermite", preserveOriginalKeys: true },
      { op: "timeWarp", joints: ["Right Arm"], startTime: 0, endTime: 1, preset: "easeInOut", strength: 0.7 },
    ],
  });
  assert.equal(edited.tracks[0]!.keys.length, 5);
  assert.ok(edited.tracks[0]!.keys.some((key) => key.transform.position.y > 0.2));
});
