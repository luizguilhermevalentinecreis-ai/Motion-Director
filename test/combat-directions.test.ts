import assert from "node:assert/strict";
import test from "node:test";
import {
  combatDirections,
  combatDirectionsFor,
  type CombatAction,
} from "../src/combat-directions.js";

const actions: CombatAction[] = [
  "stance", "jab", "cross", "hook", "uppercut",
  "kick", "block", "parry", "dodge", "hit-reaction",
];

test("defines one hundred distinct melee directions", () => {
  assert.equal(combatDirections.length, 100);
  assert.equal(new Set(combatDirections.map(({ id }) => id)).size, 100);
  assert.equal(new Set(combatDirections.map(({ name }) => name)).size, 100);
  assert.ok(combatDirections.every(({ thesis }) => thesis.length >= 80));
});

test("keeps ten mechanically comparable concepts per melee action", () => {
  for (const action of actions) {
    const group = combatDirectionsFor(action);
    assert.equal(group.length, 10, action);
    assert.equal(new Set(group.map(({ variant }) => variant)).size, 10, action);
  }
});
