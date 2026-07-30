import assert from "node:assert/strict";
import test from "node:test";
import {
  parkourDirections,
  parkourDirectionsFor,
  type ParkourAction,
} from "../src/parkour-directions.js";

const actions: ParkourAction[] = [
  "approach", "takeoff", "precision-jump", "landing", "vault",
  "wall-run", "wall-climb", "ledge", "slide", "roll",
];

test("defines one hundred distinct realistic parkour directions", () => {
  assert.equal(parkourDirections.length, 100);
  assert.equal(new Set(parkourDirections.map(({ id }) => id)).size, 100);
  assert.equal(new Set(parkourDirections.map(({ name }) => name)).size, 100);
});

test("keeps ten distinct mechanics in every parkour family", () => {
  for (const action of actions) {
    const group = parkourDirectionsFor(action);
    assert.equal(group.length, 10, action);
    assert.equal(new Set(group.map(({ variant }) => variant)).size, 10, action);
  }
});
