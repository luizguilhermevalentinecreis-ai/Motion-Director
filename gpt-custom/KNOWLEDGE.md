# Motion Director knowledge index

This file routes the Motion Director Custom GPT through its uploaded reference pack. It is not a frozen replacement for the cloud knowledge base.

## Authority order

1. The user's current explicit request and visual feedback.
2. The live developer-approved snapshot returned by `getMotionDirectorGlobalKnowledge`.
3. Inspected evidence from the current Studio selection, rig, references, and committed animation.
4. The uploaded manuals listed below.
5. General animation knowledge and web references.

The live global snapshot must be consulted at the start of every animation-related turn. At the time this pack was prepared, the service reported schema v1, global knowledge v22, and 22 approved entries. That number is informational only; always trust the version returned by the Action.

## Uploaded reference map

- `PROFESSIONAL_ANIMATION_MANUAL.md`: animation craft, body mechanics, posing, timing, blocking, spline, polish, acting, locomotion, combat, and cutscenes.
- `RIGS_AND_TRANSFORM_SPACES.md`: R6, R15, custom rigs, Motor6D, Bone, AnimationConstraint, FK/IK, transform spaces, contacts, and retargeting.
- `AUTHORING_WORKFLOWS.md`: practical recipes for building and revising common game animations with Motion Director.
- `ACTION_TOOL_REFERENCE.md`: tool selection, draft IDs, jobs, staging, commit, attachment, token economy, pagination, and authorization boundaries.
- `QUALITY_AND_VISUAL_REVIEW.md`: visual review gates, post-bake audit, failure diagnosis, and acceptance criteria.
- `REFERENCE_STUDY_AND_STYLE.md`: extracting mechanics and style from references without blindly copying sequences.
- `TROUBLESHOOTING.md`: connection, topology, preview, payload, attachment, bake, and quality failures.

Use the smallest relevant set. For example, a R6 kick normally needs the professional manual, rig guide, workflow guide, and review guide; it does not require reading every troubleshooting section.

## Current global principles, summarized

The live snapshot contains the full operational wording. These summaries are navigation cues:

- Visual approval outranks numerical validation. Metrics find risks; they cannot judge appeal, intention, silhouette, or perceived anatomy.
- Coordinate the entire body in blocking before smoothing individual joints.
- Dense keys must sample intentional motion; key count is not quality.
- Judge the rendered avatar, accessories, proportions, and visible block faces, not only abstract transforms.
- R6 communicates through rigid-block orientation, overlap, negative space, and controlled translation; do not fake elbows or knees.
- Inspect the actual R15/custom joint system instead of assuming Motor6D.
- Translation limits are contextual. Preserve credible pivots, but allow justified attack and stylization envelopes.
- Locomotion depends on leg opposition, support, weight transfer, and distinct contact/compression/passing/recovery phases.
- A run is a different mechanical cycle, not a walk played faster.
- Use amplitude hierarchy and stable anchors. Constant full-body motion looks loose and weightless.
- Punches must read hand-first through a connected kinetic chain.
- Kicks require a support map, directional logic, and a foot-first endpoint.
- Anime speed comes from timing contrast, directional agreement, impact holds, and selective smear—not uniform fast playback.
- Acting must be readable in silhouette and must avoid cues that imply the wrong action.
- Stateful reference analysis preserves inherited poses; retarget through real joint bases.
- Exaggerate structure and intention, not random amplitude.
- Choose the kicking leg from the existing support map rather than stealing the planted leg without preparation.
- Prevent quaternion long-arc spins explicitly.
- Connect a strike endpoint to its support through one coherent body line.
- A strong block absorbs force through support, compression, recoil, and recovery, not just raised arms.
- Visual intent may exceed conservative numeric envelopes when the resulting image remains coherent.

## Professional baseline

Every complete animation should have:

- a one-sentence performance thesis;
- an intended camera and readable silhouette;
- explicit support, center of gravity, contacts, and force path;
- hero poses, breakdowns, timing accents, arcs, overlap, and recovery;
- rig-specific transform decisions;
- post-bake curve and continuity checks;
- a representative Studio preview and human visual review.

Do not claim professional quality merely because validation passed. State separately what was inspected, authored, numerically validated, staged, committed, attached, previewed, and visually approved.

## Public service

- Relay: `https://motion-director-relay.onrender.com`
- OpenAPI: `https://motion-director-relay.onrender.com/openapi.json`
- Privacy: `https://motion-director-relay.onrender.com/privacy`
- Authentication: none in the GPT Action editor during the pairing-code beta. Studio operations still require the user's persistent personal plugin code.

## Security boundary

Never place pairing codes, installation tokens, identities, place names, private asset data, unpublished matrices, or copyrighted animation sequences in global knowledge proposals or uploaded reference files. The relay exposes a bounded action allowlist, not arbitrary Luau or filesystem execution.
