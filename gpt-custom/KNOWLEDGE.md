# Motion Director reference

This file is reference material for the Motion Director Custom GPT. Behavior and tool order belong in `INSTRUCTIONS.md`; current learned animation principles come from `getMotionDirectorGlobalKnowledge`.

## Public service

- Relay: `https://motion-director-relay.onrender.com`
- OpenAPI: `https://motion-director-relay.onrender.com/openapi.json`
- Privacy: `https://motion-director-relay.onrender.com/privacy`
- Authentication: `None` during the pairing-code beta. Every Studio operation still requires the personal plugin code.

## Top-level GPT Actions

- `getMotionDirectorGlobalKnowledge`: reads the current developer-approved global animation snapshot. No Studio code is required.
- `proposeMotionDirectorGlobalKnowledge`: submits reusable learning for developer review.
- `getMotionDirectorStudioStatus`: verifies the paired Studio session and plugin capabilities.
- `createMotionDirectorAnimationDraft`: converts a compact blueprint into a complete stored draft and returns `draftId`.
- `editMotionDirectorAnimationDraft`: performs focused draft edits without retransmitting all tracks.
- `composeMotionDirectorAnimationLayer`: combines stored drafts through masks and additive/override weights.
- `executeMotionDirectorAction`: exposes bounded Studio inspection, analysis, retarget, IK, stage, commit, attach, pose, preview, marker, and management actions.
- `getMotionDirectorJob`: polls asynchronous work.

## Token-efficient pattern

1. Read knowledge and Studio state.
2. Inspect only the selected rig and relevant animation pages.
3. Create one compact blueprint.
4. Keep the returned `draftId`.
5. Validate, edit, compose, and stage by ID.
6. Poll jobs rather than resending requests.
7. Inspect compact metrics/samples before requesting raw matrices.

## Blueprint notes

- Use exact inspected joint names.
- Blueprint keys accept Euler degrees as `rotationDegrees={x,y,z}`. Omitted position defaults to zero.
- Prefer `bakeMode="denseLinear"` when the authored curve is already resolved. Use Pose easing only when its parametric acceleration is an intentional design choice.
- Beats describe intention and energy over time. Contacts describe effectors, targets, time windows, weights, and allowed slide.
- Partial poses inherit the last known transform; omission is not an identity reset.

## R6 anatomy

- Six principal tracks: Torso, Head, Right Arm, Left Arm, Right Leg, Left Leg.
- Arms and legs are single rigid segments. Orientation and visible block faces matter.
- Torso rotation affects the full hierarchy. Do not use it like an isolated upper-chest control.
- Use calibrated local translation only when it improves silhouette, contact, or proportion while keeping the shoulder/hip connection visually credible.
- R6 has no true elbow/knee articulation. Design the whole block and negative space.

## R15 and custom rigs

- Inspect `jointSystem`, hierarchy, Part0/Part1, attachment bases, Bone structure, and AnimationConstraint state.
- Map authored transforms through actual bases; never assume default axes.
- Constraint-driven rigs can be kinematic or physical. Physical following may lag.
- IK is useful for feet, hands, props, and aim when a valid multi-segment chain exists.

## Professional review checklist

### Pose and staging

- Clear intention from one frame.
- Strong line of action and readable silhouette from the intended camera.
- Useful asymmetry and negative space.
- Limbs have different functions instead of being mirrored without reason.

### Weight and contacts

- Center of gravity is supported.
- Support leg/foot is explicit.
- Weight transfers before a free limb moves.
- Contact does not visibly slide, float, or detach.

### Motion

- Timing and spacing create the intended mass and speed.
- Arcs remain coherent between hero poses.
- Anticipation prepares action; follow-through and overlap resolve it.
- Overshoot and settle are selective, not applied everywhere.
- Fast actions use contrast, readable impact timing, and purposeful holds.

### Locomotion

- Legs alternate correctly.
- Contact, compression, passing, and recovery are distinct.
- Feet recover close to the ground unless style requires otherwise.
- Root motion and in-place cycling have a clear gameplay contract.
- Check loop pose and loop velocity, plus start/stop/turn compatibility.

### Combat

- Punches arrive hand-first through a connected kinetic chain.
- Kicks preserve a believable support leg and project the foot toward the target.
- Guards assign different jobs to lead and rear limbs.
- Reactions show contact direction, force path, absorption, and recovery.

### Curves and bake

- Check linear and angular velocity, acceleration, continuity, loop closure, and unintended extrema after bake.
- A perfect pre-bake score cannot cancel a bad post-bake curve.
- Visual review in Studio remains mandatory.

## Security boundary

The relay does not expose arbitrary Luau or filesystem execution. Pairing codes are persistent capability secrets while the user's plugin is online. Do not expose them in examples, global knowledge, or public output.
