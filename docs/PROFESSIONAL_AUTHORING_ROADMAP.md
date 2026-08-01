# Professional Authoring Roadmap

The product goal is not to expose more keyframes than Studio MCP. It is to move expensive animation work into deterministic local tools so the AI sends a compact direction program and receives review evidence.

## Shipped foundation

- versioned draft editing: pose upsert, range offset/delete/retime, copy, mirror, easing, biased breakdowns, smoothing, cycle offsets, key reduction and densification;
- dense-linear 60 Hz bake mode so a solved curve is not reinterpreted by Pose easing;
- post-bake velocity continuity audit;
- edit-mode FK posing and playback through anchored `Part.CFrame` with reset restoration;
- context-sensitive R6 combat displacement;
- reversible stage/commit/discard and exact rig-space conversion;
- Studio-native pose ghosting and wrist/foot/head motion-path guides.
- cubic-Hermite/Catmull-Rom resampling, authored tangent support and timing warps;
- additive/override layer composition with masks, weights, offsets and stored draft IDs;
- shared marker publication for Motion, Visual, camera and audio alignment.
- native IK targets with chain/pole/priority controls, surface-aligned foot locks and world-space contact audits.

## P0: local curve kernel and review loop

1. **F-Curve channels** — separate translation/quaternion channels, weighted Bezier handles, broken/aligned/auto tangents, stepped segments, filters and deterministic resampling.
2. **Curve preservation tests** — compare authored and baked position, orientation, velocity and acceleration at a chosen sample rate; fail commit when error exceeds a declared tolerance.
3. **Motion paths** — render wrist, foot, head and center-of-mass trajectories with contact intervals and arc discontinuities.
4. **Ghosting/onion skin** — generate color-coded previous/current/next pose clones at configurable frame offsets.
5. **Review capture** — automatically capture hero frames from front, side, three-quarter and intended camera, returning compact images and numeric overlays rather than hundreds of transforms.

This is the highest token-return investment: one local curve command can replace tens of thousands of pose tokens.

## P1: control rig and constraint solver

- FK/IK blending per chain with pole targets and joint limits;
- planted-foot and planted-hand contact locks;
- center-of-mass projection, support polygon and balance warnings;
- look-at/aim constraints, prop constraints and two-character contact constraints;
- R6 semantic pseudo-controls that preserve connected rigid-block silhouettes;
- bake solved controls to editable keys with a tolerance-based key reducer.
- Euler/gimbal diagnostics, quaternion continuity fixes and automatic rotation-order recommendations;
- collision-aware limb posing, interpenetration warnings and two-character contact solving;
- foot-slide cleanup, stride warping, terrain adaptation and root-motion extraction/in-place conversion.

Roblox already exposes procedural `IKControl` for R15 and custom rigs. Motion Director should add a rig-independent authoring layer, constraint visualization and bake-to-AnimSave workflow around it.

## P2: nonlinear animation and reusable knowledge

- additive/override layers with joint masks and time ranges;
- animation clips with trim, loop, reverse, time warp, blend and transition matching;
- pose library with semantic tags, thumbnails and approved rig-space variants;
- motion matching by pose/contact/trajectory features;
- reference comparison by features, not by copying matrices;
- shared scene timeline for actors, camera, VFX, sound and hit markers.
- Dope Sheet/Time Editor with ripple edits, marker regions, shot ranges and beat snapping;
- control picker, selection sets, mirror tables and character-specific hot controls;
- pose-space deformation helpers for rigid R6 silhouettes and corrective R15 poses;
- draw-over review notes attached to camera and frame;
- A/B takes, version branches, approval states and frame-addressed feedback.

## P4: capture, cleanup and cinematic tooling

- video-reference panel with frame stepping, sync markers, opacity overlay and perspective matching;
- mocap cleanup: floor solve, contact detection, jitter removal, joint-limit enforcement and key reduction;
- camera rig with aim, dolly, orbit, shake layers, focal target and safe framing guides;
- audio waveform, phoneme/viseme tracks, eye direction, blink and breathing generators;
- batch retarget QA across R6, R15, bones and AnimationConstraints;
- deterministic playblast/contact sheet generation for human review.

## P3: procedural directors

High-level operators such as `authorWalkCycle`, `authorPunch`, `authorLanding`, and `authorTwoActorContact` should compile locally from inspected proportions, controls, contacts and style parameters. The AI chooses narrative beats, silhouettes and exceptions; the plugin solves repetitive in-betweens, contact maintenance and curve cleanup.

## Token architecture

- snapshots receive stable IDs and hashes;
- every mutation is a small patch against a snapshot ID;
- large key arrays stay local and are returned only by bounded pages;
- macros and pose blocks are stored once and referenced by ID;
- review responses return deltas, flagged frames and thumbnails;
- no tool should require retransmitting an unchanged complete draft.

## Security before public release

- bind the local bridge session to an installation secret instead of a public static header;
- display remote metadata disclosure before first relay contact;
- keep all writes scoped, undoable and free of arbitrary code execution;
- add per-operation limits and a visible audit log.

## Primary references

- [Roblox IKControl and joint constraints](https://create.roblox.com/docs/animation/inverse-kinematics)
- [Roblox Animation Editor and keyframe optimization](https://create.roblox.com/docs/animation/editor)
- [Blender Actions, constraints and bake workflow](https://docs.blender.org/manual/en/latest/animation/constraints/relationship/action.html)
- [Maya Graph Editor tangent workflow](https://help.autodesk.com/cloudhelp/2027/ENU/Maya-Animation/files/GUID-ABB47176-9119-47F2-8466-6FA19C427F9F.htm)
