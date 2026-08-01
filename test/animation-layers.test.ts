import assert from "node:assert/strict";
import test from "node:test";
import { composeAnimationLayer } from "../src/animation-layers.js";

const key = (time: number, y: number) => ({
  time, transform: { position: { x: 0, y, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
  easing: { style: "linear" as const, direction: "inOut" as const }, weight: 1,
});
const makeDraft = (name: string, values: [number, number], duration = 1, space: "motor" | "parent" = "motor") => ({
  name, rigId: "Workspace.Rig", duration, framesPerSecond: 30, looped: false,
  priority: "action" as const, beats: [], contacts: [],
  tracks: [{ joint: "Torso", space, keys: [key(0, values[0]), key(duration, values[1])] }],
  metadata: { version: 1 as const, style: [] },
});

const rotationY = (degrees: number) => {
  const radians = degrees * Math.PI / 180;
  return { x: 0, y: Math.sin(radians / 2), z: 0, w: Math.cos(radians / 2) };
};

test("composes an additive masked layer into dense linear output", () => {
  const result = composeAnimationLayer(makeDraft("Base", [0, 0]), makeDraft("Breathing", [0, 1]), {
    name: "Breathing", mode: "additive", weight: 0.5, jointMask: ["Torso"], sampleRate: 20,
  });
  assert.equal(result.bakeMode, "denseLinear");
  assert.equal(result.tracks[0]!.keys.length, 21);
  assert.ok(Math.abs(result.tracks[0]!.keys.at(-1)!.transform.position.y - 0.5) < 1e-6);
});

for (const [duration, sampleRate] of [[1.75, 90], [2.4, 72]] as const) {
  test(`always samples the exact duration endpoint for ${duration}s at ${sampleRate}Hz`, () => {
    const result = composeAnimationLayer(makeDraft("Base", [0, 0], duration), makeDraft("Layer", [0, 1], duration), {
      name: "Endpoint", mode: "additive", sampleRate,
    });
    assert.equal(result.tracks[0]!.keys.at(-1)!.time, duration);
  });
}

test("rejects incompatible base and layer transform spaces", () => {
  assert.throws(() => composeAnimationLayer(makeDraft("Base", [0, 0], 1, "parent"), makeDraft("Layer", [0, 1], 1, "motor"), {
    name: "Bad space", sampleRate: 30,
  }), /incompatible/);
});

test("rejects a layer that starts after the base animation", () => {
  assert.throws(() => composeAnimationLayer(makeDraft("Base", [0, 0]), makeDraft("Layer", [0, 1]), {
    name: "Late layer", startTime: 1.01, sampleRate: 30,
  }), /exceeds base duration/);
});

test("uses spherical interpolation for sparse rotations", () => {
  const base = makeDraft("Base", [0, 0]);
  const layer = makeDraft("Layer", [0, 0]);
  layer.tracks[0]!.keys[0]!.transform.rotation = rotationY(0);
  layer.tracks[0]!.keys[1]!.transform.rotation = rotationY(120);
  const result = composeAnimationLayer(base, layer, { name: "Sparse turn", mode: "override", sampleRate: 12 });
  const quarter = result.tracks[0]!.keys.find((entry) => entry.time === 0.25)!;
  const angle = 2 * Math.atan2(Math.abs(quarter.transform.rotation.y), quarter.transform.rotation.w) * 180 / Math.PI;
  assert.ok(Math.abs(angle - 30) < 1e-6, `expected 30 degrees, received ${angle}`);
});
