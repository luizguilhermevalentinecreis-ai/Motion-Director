# Rigs and transform spaces

Use this guide before authoring or retargeting. Names and topology must come from inspection, not assumptions.

## Inspect first

Record rig type, visible proportions, hierarchy, track names, joint system, Part0/Part1 or parent/child relation, rest bases, attachment axes, existing Animator/AnimSaves, and whether constraints are kinematic. Accessories can change the visible silhouette even when the skeletal rig is standard.

## R6

R6 has rigid single-segment arms and legs. It cannot express a real elbow or knee. The viewer infers articulation from block orientation, overlap, negative space, translation, support, and the visible faces of each limb.

The Torso behaves as a parent hub. Rotating it rotates the apparent base of head and all limbs. Treat torso yaw/roll as a whole-body decision, not an isolated chest control. For an idle, large repetitive torso rotation makes the entire character swivel. For an attack, coordinated torso rotation can create torque when the legs, root, head, and endpoints are designed around it.

Controlled local translation is valid when it improves silhouette, reach, contact, or block proportion. Preserve the visual shoulder/hip connection unless a deliberate smear frame or extreme graphic pose justifies temporary separation. Judge the rendered result rather than a universal numeric limit.

## R15

R15 normally offers segmented limbs and more anatomical distribution, but current rigs may use Motor6D, AnimationConstraint, Bone, or mixed/custom systems. An empty Motor6D list is not proof that animation is impossible.

For Motor6D, respect `Part0`, `Part1`, `C0`, and `C1`. For AnimationConstraint, inspect attachments and whether `IsKinematic` is true; a force-driven constraint may lag an authored pose. For Bones, use the actual bone hierarchy and rest transforms.

Distribute motion anatomically: hips and spine carry weight/torque; shoulder, elbow, wrist, thigh, knee, ankle, neck, and head contribute according to function. Avoid applying an R6 block solution directly to one R15 joint.

## Custom rigs

Never infer chain names or axes. Inspect the hierarchy and derive semantic roles from evidence. Identify root, pelvis, spine, head, left/right chains, effectors, controls, and deforming versus helper nodes. Preserve the user's selected rig and do not silently substitute a generated rig.

## Transform spaces

- **Local/parent space:** a child transform relative to its animated parent. Best for hierarchical authoring and reusable layers.
- **Motor space:** transform interpreted through Motor6D rest bases. Never mix with parent-space tracks without explicit conversion.
- **World space:** useful for contacts, paths, comparison, and solved targets, but must be converted through the hierarchy for animation storage.

For a Motor6D relationship, the visible child world transform is derived from the parent world transform, `C0`, animated pose transform, and inverse `C1`. Space conversion must preserve this conjugation. Mixing tracks labeled `parent` and `motor` silently produces wrong axes and pivots.

Quaternion interpolation must use the shortest equivalent arc. Normalize inputs, flip the second quaternion when the dot product is negative, and use SLERP for large rotations. A pose may be numerically equivalent at endpoints yet visibly spin 360 degrees between them if signs are not stabilized.

## FK, IK, and contacts

FK is the default for expressive arcs and authored body flow. IK is valuable for exact feet, hands, props, and aim when a valid multi-segment chain exists. R6 cannot gain real elbow/knee solving from IK because those joints do not exist.

For foot lock:

1. identify the correct effector and chain;
2. solve the desired world contact against inspected ground;
3. convert the solution through the actual bases;
4. preserve or intentionally manage foot orientation;
5. audit world-space position/orientation error over the entire lock window;
6. blend into and out of the lock to avoid snapping.

Do not solve an isolated foot while the center of mass makes the leg impossible. Contacts and body mechanics must agree.

## Retargeting

Retarget intent and world relationships, not raw matrices. Preserve action endpoint, support, contacts, line of action, timing, and silhouette while adapting proportions and joint count.

R6-to-R15 requires reconstructing source world poses through R6 rest bases, mapping semantic chains, then solving target local transforms through R15 bases. Directly copying R6 matrices to R15 causes pivot separation and axis errors. Use the dedicated staged retarget action and inspect both source and target paths.

## Safety checklist

- Exact selected rig confirmed.
- Topology and track names inspected.
- Transform spaces compatible.
- Rest bases included in conversion.
- Quaternion signs stabilized.
- R6 rigid-limb limitations respected.
- R15/custom kinematic state understood.
- Contacts audited in world space.
- Rendered avatar and accessories visually reviewed.
