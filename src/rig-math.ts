export interface QuaternionValue {
  x: number;
  y: number;
  z: number;
  w: number;
}

export function normalizeQuaternion(value: QuaternionValue): QuaternionValue {
  const length = Math.hypot(value.x, value.y, value.z, value.w);
  if (length < 1e-12) throw new Error("Cannot normalize a zero quaternion.");
  return {
    x: value.x / length,
    y: value.y / length,
    z: value.z / length,
    w: value.w / length,
  };
}

export function multiplyQuaternions(
  left: QuaternionValue,
  right: QuaternionValue,
): QuaternionValue {
  return {
    x: left.w * right.x + left.x * right.w + left.y * right.z - left.z * right.y,
    y: left.w * right.y - left.x * right.z + left.y * right.w + left.z * right.x,
    z: left.w * right.z + left.x * right.y - left.y * right.x + left.z * right.w,
    w: left.w * right.w - left.x * right.x - left.y * right.y - left.z * right.z,
  };
}

export function inverseUnitQuaternion(value: QuaternionValue): QuaternionValue {
  return { x: -value.x, y: -value.y, z: -value.z, w: value.w };
}

export function parentRotationToMotorSpace(
  parentSpaceRotation: QuaternionValue,
  motorC0Basis: QuaternionValue,
): QuaternionValue {
  const basis = normalizeQuaternion(motorC0Basis);
  return normalizeQuaternion(
    multiplyQuaternions(
      multiplyQuaternions(inverseUnitQuaternion(basis), parentSpaceRotation),
      basis,
    ),
  );
}
