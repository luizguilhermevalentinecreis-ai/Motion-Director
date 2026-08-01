# Quality and visual review

Professional review has four gates: intent, body mechanics, motion curves, and technical delivery. Passing one does not imply the others passed.

## Gate 1: still-pose readability

At hero frames, ask:

- Can the action/emotion be identified without playback?
- Does the silhouette read from the intended camera?
- Is there one dominant line of action?
- Are limb roles different and purposeful?
- Is negative space useful?
- Does the rendered avatar preserve visible joints/contacts, or do clothes/accessories create a false read?
- Is exaggeration focused on the intended idea?

Reject a pose that communicates the wrong action even if its transforms are safe.

## Gate 2: weight and mechanics

- Center of gravity relates credibly to support.
- Support is established before the free limb acts.
- Weight transfer is visible and timed.
- Feet/hands do not float, slide, or detach unintentionally.
- The force path connects endpoint to ground/support.
- Counterbalance is sufficient but not theatrical without reason.
- Recovery resolves momentum rather than snapping to neutral.

For R6, judge rigid-block endpoints and visible faces. For R15/custom, judge the full chain and joint distribution.

## Gate 3: playback and curves

- Timing matches the thesis and gameplay window.
- Spacing produces intended acceleration/deceleration.
- Hand, foot, head, and center-of-mass arcs are coherent.
- No unexpected pause at cycle alternation.
- No long-arc quaternion spin.
- Drag, overlap, overshoot, and settle are selective.
- Loop pose and loop velocity close.
- Root motion stays on the intended path.
- Post-bake angular/linear velocity does not introduce motion absent from the source design.

The stage audit must sample the baked result, not only the source draft. A pre-bake score of 1.0 cannot excuse a visible baked kick or jerk.

## Gate 4: delivery

- Correct rig and exact selection used.
- Correct destination name and priority.
- Staged result succeeded.
- Post-bake audit passed or exceptions are explicitly justified.
- Commit happened once.
- Correct AnimSave attached once.
- Representative pose and full playback reviewed in the proper Studio mode.
- User's visual verdict recorded.

## Diagnostic checklist by symptom

### “Looks random”

Likely cause: joints authored independently, weak hero poses, or smoothing before coordination. Return to stepped full-body blocking.

### “Too stiff”

Likely cause: linear pose interpolation without designed breakdowns, identical timing across joints, insufficient arcs/overlap, or dense repeated keys. Improve breakdowns and timing hierarchy; do not add noise.

### “Too loose/molenga”

Likely cause: uniform amplitude, too much torso/root motion, every joint overlapping, or no stable anchor. Reduce secondary movement and strengthen support/endpoint hierarchy.

### “Minimal/inofensive”

Likely cause: conservative pose envelope, low guard, weak line of action, poor endpoint aim, or mirrored limbs. Strengthen the base pose and spatial relationships—not constant motion.

### “Looks like a slide”

Likely cause: center of mass travels without clear stepping/support, legs are over-separated, or torso lean is unsupported. Rebuild support and passing poses.

### “Walks sideways”

Likely cause: excessive lateral foot spacing, crossed travel path, hip/root yaw, or camera-relative misread. Narrow the step track and audit world-space forward travel.

### “Run is a fast walk”

Likely cause: reused walk poses. Rebuild flight, compression, extension, ground-contact duration, and arm strategy.

### “Punches with elbow”

Likely cause: elbow/upper block leads, hand is hidden, arm rotates through the torso, or endpoint path is wrong. Pose contact hand-first and connect the body backward.

### “Kick is a knee/360 spin”

Likely cause: wrong support leg, distal endpoint not aimed, rigid R6 leg face misoriented, or quaternion long arc. Rebuild from support and contact; stabilize rotation signs.

### “Idle moves too much”

Likely cause: exaggeration applied to oscillation rather than base pose. Keep strategic stance, stable feet/root, small breathing, and limited torso propagation.

### “Numerically good, visually bad”

The validator measured incomplete proxies. Preserve the metrics as diagnostics, accept human feedback as authoritative visual evidence, and revise pose/timing/camera/body mechanics.

## Review sampling

Inspect at minimum:

- each hero pose;
- the frame before and after each contact/impact;
- fastest angular/linear velocity samples;
- contact windows;
- cycle boundary;
- maximum compression and extension;
- entry and recovery pose;
- front, side, and intended gameplay camera when ambiguity exists.

## Acceptance language

Report accurately:

- **Inspected:** evidence read from Studio.
- **Authored:** draft created or edited.
- **Validated:** source checks passed.
- **Staged:** reversible baked result created.
- **Post-bake audited:** baked continuity checked.
- **Committed:** written to Studio.
- **Attached:** AnimSave placed on rig.
- **Previewed:** visually displayed.
- **Approved:** user or qualified reviewer accepted the result.

Never collapse these into “finished” prematurely.
