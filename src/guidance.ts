export const PROFESSIONAL_AUTHORING_PROTOCOL = `# Motion Director professional authoring protocol v1

Treat animation as designed performance, not a collection of rotations.

## Required authoring order

1. Read the selected rig, its rest pose, joint hierarchy, proportions, effectors,
   held props, environment, intended camera, and target contacts.
   When professional reference clips exist, inspect their lossless keyframes and
   interpolated world-space samples before designing. Extract relationships
   between support, center of mass, line of action, timing, paths, and joint
   sequencing. Never copy isolated Pose.CFrame components without their spatial
   and mechanical context.
2. Write a performance thesis in one sentence: who acts, what they want, what
   resists them, and how their physical state changes.
3. Divide time into semantic beats. Every beat needs intention, energy,
   leading body part, focal target, and a visible change from the previous beat.
4. Mark non-negotiable contacts before generating motion: planted feet, grips,
   impacts, support hands, seats, walls, or paired-character interaction.
5. Design storytelling poses before interpolation:
   - neutral or entry pose;
   - anticipation;
   - readable extreme;
   - contact or impact;
   - overshoot/follow-through;
   - settle or exit.
6. Establish root and center-of-mass movement before limbs. Drive action from
   pelvis and torso, then shoulders, arms, hands, head, and secondary parts.
7. Author arcs and spacing deliberately. Do not distribute keys uniformly.
   Slow holds, accelerating transitions, impacts, and settling need different
   spacing profiles.
8. Add controlled asymmetry, counter-rotation, overlap, drag, breathing, gaze,
   fingers, and prop response only after the main mechanics read clearly.
9. Validate every frame range for contacts, balance, collision, anatomical
   limits, silhouette, acceleration discontinuities, and unintended stillness.
10. Stage a reversible draft. Never commit a first generation.

## Frame-level reasoning

For every strategically important authored frame, know:

- the narrative purpose of the pose;
- which body part leads;
- the line of action;
- the support polygon and projected center of mass;
- active contacts and their tolerances;
- the dominant silhouette from the intended camera;
- the next motion arc;
- which parts are leading, following, dragging, or settling;
- what changed since the previous important frame.

Dense per-frame keys are not inherently professional. Use the fewest purposeful
controls that preserve the desired curve, then bake or sample only when a solver
or export format requires it.

## Prohibited shortcuts

- Mirroring the entire body without purposeful asymmetry.
- Moving hands or weapons without upstream shoulder, spine, pelvis, and weight
  response.
- Hiding foot sliding with faster timing.
- Using easing as a substitute for authored spacing.
- Committing without a quality report and a visual review.
- Inventing rig joints or scene targets that inspection did not confirm.
- Copying raw translation or rotation values from a reference without
  reconstructing the complete rig pose and explaining the body relationship.
`;

export const PROFESSIONAL_QUALITY_RUBRIC = `# Motion Director quality rubric v1

Score every category from 0 to 1 and report evidence with exact time ranges.
A production-ready take has no blocking issue and normally scores at least 0.85
overall. A high average cannot cancel a broken contact or unsafe joint.

## Blocking categories

- Contact integrity: planted effectors remain within authored slide tolerance.
- Collision integrity: no unintended body, prop, environment, or paired-rig
  penetration.
- Anatomical integrity: joint limits and bend directions remain plausible for
  the selected rig.
- Temporal integrity: beats, contacts, events, and keys fit the clip and remain
  chronologically coherent.

## Performance categories

- Intent readability: a viewer can infer action and emotional state without
  reading the prompt.
- Pose clarity: important poses have clean silhouettes and purposeful negative
  space from the intended camera.
- Weight and balance: support, momentum, recovery, and center-of-mass changes
  match the claimed force.
- Timing and spacing: anticipation, acceleration, impact, holds, overshoot, and
  settle are designed rather than uniformly interpolated.
- Arcs: head, hands, feet, props, and center of mass travel through intentional
  paths without accidental kinks.
- Continuity: velocity and angular velocity discontinuities occur only where
  impact or deliberate style requires them.
- Overlap and follow-through: downstream parts respond with controlled delay.
- Asymmetry: left/right and upper/lower body differences support the action.
- Gaze and focus: eyes/head/chest attention agrees with story and targets.
- Secondary motion: fingers, breathing, accessories, and recoil support rather
  than obscure the primary action.
- Loop quality, when applicable: pose, velocity, contacts, and phase agree
  across the seam.
- Retarget robustness: required contacts and intent survive target proportions.

## Review output

Each defect must include severity, exact time range, affected joints/effectors,
visible consequence, likely cause, and a localized corrective action. Prefer
regenerating or solving the smallest defective interval instead of replacing a
successful take.
`;

export const ANIMATION_CONTRACT_GUIDE = `# Animation draft contract guide v1

- beats describe performance intention over time;
- contacts describe exact effector-to-target intervals and tolerances;
- tracks contain local, character, or world-space transforms;
- rotations are normalized quaternions;
- easing uses Roblox PoseEasingStyle-compatible values;
- metadata records the immutable human intent and style vocabulary;
- staging creates a reversible transaction;
- committing requires the staged transaction id.

The current implementation exports KeyframeSequence drafts compatible with legacy
Motor6D rigs and Avatar Joint Upgrade AnimationConstraint rigs. Pose tracks target
the reported animated child part name, and parent-space rotations are mapped through
the actual joint basis. Bone-only skinned rigs remain a separate topology that must
use their reported Bone tracks.
Curve tangents are preserved by the canonical schema for the future curve and
solver pipeline, but the v1 Roblox bake uses Pose easing.
`;
