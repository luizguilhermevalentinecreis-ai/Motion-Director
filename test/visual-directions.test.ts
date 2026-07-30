import assert from "node:assert/strict";
import test from "node:test";
import {
  directionsFor,
  visualDirections,
  type FoundationAction,
} from "../src/visual-directions.js";

const actions: FoundationAction[] = [
  "idle", "walk", "run", "sprint", "start",
  "stop", "turn", "dash", "jump", "land",
];

test("defines one hundred distinct visual directions", () => {
  assert.equal(visualDirections.length, 100);
  assert.equal(new Set(visualDirections.map((direction) => direction.id)).size, 100);
  assert.equal(new Set(visualDirections.map((direction) => direction.name)).size, 100);
  assert.ok(visualDirections.every((direction) => direction.thesis.length >= 60));
});

test("keeps ten comparable concepts in every foundation action group", () => {
  for (const action of actions) {
    assert.equal(directionsFor(action).length, 10, action);
  }
});
