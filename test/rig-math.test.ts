import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeQuaternion,
  parentRotationToMotorSpace,
  type QuaternionValue,
} from "../src/rig-math.js";

function axisAngle(x: number, y: number, z: number, degrees: number): QuaternionValue {
  const radians = (degrees * Math.PI) / 180;
  const half = radians / 2;
  const scale = Math.sin(half);
  return normalizeQuaternion({ x: x * scale, y: y * scale, z: z * scale, w: Math.cos(half) });
}

test("keeps anatomical rotation unchanged for an identity Motor6D basis", () => {
  const authored = axisAngle(1, 0, 0, 35);
  const converted = parentRotationToMotorSpace(authored, { x: 0, y: 0, z: 0, w: 1 });
  assert.deepEqual(converted, authored);
});

test("conjugates parent-space rotation through a rotated R6 joint basis", () => {
  const parentForwardSwing = axisAngle(1, 0, 0, 30);
  const shoulderBasis = axisAngle(0, 1, 0, 90);
  const converted = parentRotationToMotorSpace(parentForwardSwing, shoulderBasis);

  assert.ok(Math.abs(converted.x) < 1e-10);
  assert.ok(Math.abs(converted.y) < 1e-10);
  assert.ok(Math.abs(Math.abs(converted.z) - Math.sin(Math.PI / 12)) < 1e-10);
  assert.ok(Math.abs(converted.w - Math.cos(Math.PI / 12)) < 1e-10);
});
