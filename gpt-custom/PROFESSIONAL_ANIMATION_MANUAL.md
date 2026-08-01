# Professional animation manual for Motion Director

This is the craft manual for authoring game animation through Motion Director. It explains how to think, not merely which values to enter. Apply it with the live global knowledge, inspected rig evidence, and the user's visual feedback.

## 1. Begin with a performance thesis

Before touching keys, state what the viewer should feel in one sentence. Examples:

- “A serious RPG protagonist advances with controlled confidence, conserving motion until danger appears.”
- “A desperate runner commits every part of the body forward as if being chased.”
- “A villain suppresses laughter, loses control in stages, then settles into dangerous calm.”

The thesis controls pose scale, rhythm, gaze, breathing, asymmetry, and recovery. Generic labels such as `walk`, `punch`, or `idle` are not enough.

Define:

- gameplay purpose and whether motion is in-place or root-driven;
- intended camera and distance;
- realism/stylization ratio;
- character attitude, energy, fatigue, and urgency;
- loop, entry, exit, hit, and marker requirements;
- what must remain stable for gameplay readability.

## 2. Study reference before copying motion

Reference is evidence about mechanics, staging, and style. Identify support foot, center of gravity, line of action, contact order, pose rhythm, limb roles, and camera. Describe these principles before authoring. Do not trace a copyrighted sequence pose for pose unless the user owns it and asks for direct conversion. Create new timing, breakdowns, spatial path, and performance choices.

Use multiple reference types when helpful:

- real footage for anatomy, gravity, and contacts;
- game footage for gameplay constraints and loop design;
- anime or drawings for silhouette, timing contrast, and exaggeration;
- the selected professional AnimSave for rig-specific solutions.

## 3. Pose design

A pose is a coordinated whole-body statement. Judge it first as a still image.

### Line of action

Find the dominant flow through head, spine/torso, pelvis/root, support, and action endpoint. A strong line may be straight, C-shaped, or S-shaped, but it must serve intention. Avoid unrelated bends that cancel one another.

### Silhouette and negative space

From the intended camera, important limbs should not merge into the torso or each other. Create useful gaps between arms, torso, and legs. Asymmetry is usually stronger than mirrored limbs, but every asymmetry needs a job: guard, reach, counterbalance, support, drag, or secondary action.

### Staging and clarity

The primary action must read before secondary details. If a punch could be mistaken for an elbow strike, or exhaustion for jump anticipation, the pose failed regardless of numerical correctness. Change the endpoint, block face, body line, or support—not just easing.

### Strategic exaggeration

Exaggerate the relationship that communicates the idea: reach, compression, opposition, lean, negative space, or contact. Large transforms are acceptable when the rendered image is coherent. Do not enlarge every rotation and translation uniformly. In an idle, exaggeration belongs mainly in the base pose; motion around it should remain controlled.

## 4. Weight, balance, and body mechanics

Gravity always participates. Locate the center of gravity and its projection relative to the support polygon. A grounded pose usually needs:

- a clear support foot or support pair;
- compressed support joints or an R6 equivalent in block orientation and hip/root height;
- torso and head organized over or intentionally beyond the base;
- a counterbalance if a limb or torso reaches away;
- contacts that do not slide without narrative reason.

Weight transfer begins before the free limb acts. For a step, load one side, release the other, travel, contact, accept weight, and recover. For a strike, connect the ground through support, hips/root, torso, shoulder, and endpoint. For a reaction, show force entering, compression or displacement, recoil, and recovery.

Momentum and inertia create continuation. Heavy masses start and stop later. Small distal parts can drag and overshoot. Do not apply identical delay to every joint: establish an amplitude and timing hierarchy.

## 5. The animation principles in practical terms

- **Squash and stretch:** preserve perceived volume; in rigid Roblox rigs, express it through compression, extension, spacing, and silhouette rather than deforming blocks unless the rig supports scale.
- **Anticipation:** make direction and force legible before the action. Keep it proportional; a lethal fast strike may use a tiny readable load, not a long wind-up.
- **Staging:** choose camera, silhouette, and timing so the important idea cannot be confused.
- **Straight ahead and pose to pose:** use pose-to-pose for controlled game mechanics; use selective straight-ahead passes for drag, cloth, tremor, or chaotic accents.
- **Follow-through and overlap:** parts do not stop together. Offset head, arms, accessories, and recoil according to mass and attachment.
- **Slow in/slow out:** use spacing intentionally. A constant-speed support phase may need Linear output; do not let default easing invent acceleration.
- **Arcs:** track hands, feet, head, and center of mass. Break an arc only for a deliberate snap, hit stop, mechanical action, or teleport.
- **Secondary action:** support the main idea without competing with it.
- **Timing:** determines weight, urgency, force, and thought.
- **Exaggeration:** clarify the intended image without destroying structural coherence.
- **Solid drawing/posing:** in 3D, this means balance, perspective, proportion, readable planes, and believable joint relationships.
- **Appeal:** clarity, specificity, rhythm, and character—not prettiness alone.

## 6. Timing, spacing, and curves

Plan beats before interpolation. A useful action map may include neutral, anticipation, launch, contact, impact hold, recoil, overshoot, settle, and recovery. The time between poses controls energy; the spatial distance between sampled frames controls perceived speed.

Use holds to create thought, threat, or impact. Use rapid spacing changes for anime acceleration. Avoid constant speed unless the physical or graphic design requires it. A fast attack often reads better with a brief readable setup, compressed acceleration, one decisive contact, a hit stop, and a shorter recovery than with uniformly fast playback.

Graph cleanup goals:

- no accidental spikes in linear or angular velocity;
- no quaternion long-arc flips;
- clean extrema rather than noisy reversals;
- tangents that preserve intended acceleration;
- loop pose and loop velocity continuity;
- stable planted contacts;
- selective overshoot and settle.

When a curve has already been resolved, bake dense Linear samples so Roblox Pose easing does not reinterpret it. Dense output must represent a designed curve; repeated or arbitrary keys waste tokens and can make motion stiffer.

## 7. Production passes

### Reference and thumbnails

Collect visual/mechanical evidence and propose two or three contrasting pose directions. Choose one based on the thesis and camera.

### Stepped blocking

Author hero poses and contacts with no concern for polish. Review still frames and the transition order. Fix silhouette, support, body line, and endpoint first.

### Breakdowns

Define how the body travels between heroes: arcs, passing positions, leading part, drag, foot clearance, and force transfer. Breakdowns are not automatic averages.

### Spline and timing

Introduce interpolation while preserving the blocking. Refine spacing, slow-in/out, acceleration, and holds. Verify the motion did not become floaty.

### Secondary motion

Add head/gaze, breath, recoil, drag, overlap, accessories, or subtle asymmetry. Keep the main action dominant.

### Polish

Clean curves, collisions, penetrations, contacts, loop closure, endpoint orientation, and camera readability. Rebuild weak poses rather than hiding them under extra keys.

### Visual review

Preview representative moments and the full clip in Studio. Numerical checks are a gate, not approval. Record the user's visual verdict and revise the exact observed problem.

## 8. Locomotion

### Idle

An idle communicates readiness and personality while preserving a stable gameplay base. Keep feet credible and root drift near zero unless the concept explicitly uses shifting stance. Use restrained breathing and offsets. Do not rotate the entire R6 torso rhythmically as a substitute for life; that propagates every limb and looks mechanical.

### Walk

Build contact, down/compression, passing, up/recovery, and opposite contact. Legs oppose each other. Pelvis/root accepts weight over the planted foot. Feet remain near the floor during recovery unless the character is marching or stylized. Arms counterbalance with character-specific amplitude and delay.

### Run and sprint

A run has flight or near-flight, stronger compression and extension, faster weight transfer, different arm strategy, and stronger forward commitment. Do not accelerate a walk. A sprint can lower the center of mass, increase rear extension, shorten ground contact, and sharpen arm drive, but excessive constant lean makes the character appear to fall.

### Starts, stops, and turns

Locomotion systems need transitions. A start overcomes inertia; a stop absorbs momentum; a turn redirects the center of mass before the feet fully reorient. Match phase and support when blending.

### Jump, fall, and land

Anticipate through compression, extend through takeoff, preserve a clear airborne line, prepare feet before contact, then compress and recover. Landing force must pass through support into the torso; avoid feet touching while the body remains unaffected.

## 9. Combat

### Guard and combat idle

Assign different roles to lead and rear hands, lead and rear legs. Keep hands high enough to threaten or protect, elbows structurally connected, support leg loaded, and silhouette open enough to read. Exaggerate the stance, not the idle oscillation.

### Punch

Choose target, striking hand, support, and force path. Load through foot/root/torso, keep the hand visually leading, use the other hand as guard or counterbalance, hit with a clear endpoint and selective hit stop, then recover without reversing through a visible 180-degree arm spin.

### Uppercut

The characteristic path begins low and travels upward through leg drive, hip/root extension, torso rise, and a hand-first ascending arc. It should not read as a horizontal punch tilted upward. Keep the target and follow-through legible.

### Kick

Choose the support leg first. Shift weight onto it, free the kicking leg, orient the rigid R6 block or articulated R15 chain so the foot—not the knee—meets the target, lean/counterbalance for reach, and recover the leg without long-arc rotation. The torso and arms must leave a boxing pose and join the kick's line.

### Block, dodge, and reaction

A block receives force through arms into body compression and support. A dodge relocates the vulnerable volume with minimal necessary travel and a clear recovery route. A hit reaction follows the incoming force vector, character mass, contact location, and desired gameplay window.

## 10. Acting and cutscenes

Acting is a sequence of thoughts. Plan gaze, focus changes, breath, pauses, decisions, and emotional escalation. A villain laugh can begin with restrained torso tremors and delayed head/shoulder response, grow into an extreme silhouette, then settle; jumping instantly to maximum amplitude removes escalation.

For a cold standoff, reduce expressive walking, lengthen pauses, stabilize the gaze, and let small weight shifts carry tension. For two rigs, stage relative distance, eye line, screen direction, contact timing, camera markers, and shared beats before polishing either character separately.

## 11. Final acceptance

An animation is ready only when its mechanics, graphic read, technical bake, and gameplay contract agree. If the user says it looks wrong, treat that as evidence. Diagnose whether the cause is pose, silhouette, timing, spacing, topology, interpolation, camera, or rendered avatar, then revise the source decision rather than merely increasing key count.
