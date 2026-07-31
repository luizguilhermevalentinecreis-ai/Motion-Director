import assert from "node:assert/strict";
import test from "node:test";
import { draftFromBlueprint, quaternionFromEulerDegrees } from "../src/draft-authoring.js";

test("converts compact Euler authoring keys into a complete AnimationDraft", () => {
  const draft = draftFromBlueprint({
    name: "M1_01",
    rigId: "Workspace.Rig",
    rigType: "R6",
    duration: 0.45,
    framesPerSecond: 30,
    priority: "action",
    intent: "A grounded medium jab with a decisive hand-first impact.",
    style: ["r6", "combat", "m1"],
    tracks: [
      {
        joint: "Torso",
        keys: [
          { time: 0, rotationDegrees: { x: 0, y: 0, z: 0 } },
          {
            time: 0.2,
            position: { x: 0, y: -0.08, z: -0.12 },
            rotationDegrees: { x: 8, y: 20, z: -4 },
          },
        ],
      },
    ],
  });

  assert.equal(draft.metadata.version, 1);
  assert.equal(draft.metadata.rigType, "R6");
  assert.equal(draft.tracks[0]?.space, "parent");
  assert.deepEqual(draft.tracks[0]?.keys[0]?.transform.position, { x: 0, y: 0, z: 0 });
  assert.deepEqual(draft.tracks[0]?.keys[0]?.easing, {
    style: "cubicV2",
    direction: "inOut",
  });
  const rotation = draft.tracks[0]?.keys[1]?.transform.rotation;
  assert.ok(rotation);
  const length = Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w);
  assert.ok(Math.abs(length - 1) < 1e-12);
});

test("uses Roblox-compatible XYZ Euler quaternion conversion", () => {
  const rotation = quaternionFromEulerDegrees({ x: 90, y: 0, z: 0 });
  assert.ok(Math.abs(rotation.x - Math.SQRT1_2) < 1e-12);
  assert.equal(rotation.y, 0);
  assert.equal(rotation.z, 0);
  assert.ok(Math.abs(rotation.w - Math.SQRT1_2) < 1e-12);
});
