# Motion Director Action and token-efficiency reference

The OpenAPI schema is authoritative for exact request fields. This document explains when and why to use each top-level Action.

## Required order

1. `getMotionDirectorGlobalKnowledge`
2. `getMotionDirectorStudioStatus` when Studio work is requested
3. bounded inspection through `executeMotionDirectorAction`
4. create/edit/compose by stored draft ID
5. validate, stage, poll, post-bake audit
6. commit and attach only within authorized scope
7. preview and human review

## Top-level operations

### `getMotionDirectorGlobalKnowledge`

No Studio code required. Call first for any Motion Director or animation turn. Use the returned version and approved entries; do not rely on the version noted in uploaded files.

### `proposeMotionDirectorGlobalKnowledge`

Submit a reusable operational lesson for developer review. Include category, title, principle/rule, rationale, applicability, and evidence. Exclude private or user-specific data. A proposal is not published knowledge until an authorized development installation approves it.

### `getMotionDirectorStudioStatus`

Verifies that the user's persistent pairing code currently resolves to an online plugin session and reports capabilities/place state. A pairing code is a capability secret; never print it unnecessarily or store it in knowledge.

### `createMotionDirectorAnimationDraft`

Creates a complete stored draft from a compact semantic blueprint and returns `draftId`. Use exact inspected track names. Define duration, loop policy, bake mode, beats, contacts, style, and coordinated full-body poses. This is the operation that authors from zero; never claim it is unavailable when present in the imported schema.

### `editMotionDirectorAnimationDraft`

Apply focused changes to an existing `draftId`: pose/key adjustments, time warps, curve resampling, smoothing, densification, breakdown insertion, cycle offsets, or key reduction. Prefer this over resending the entire animation.

### `composeMotionDirectorAnimationLayer`

Combines stored drafts with additive or override behavior, joint mask, weight, timing, and resampling policy. Verify transform-space compatibility. Use layers for breathing, recoil, acting, aim, or polish that can be revised independently.

### `executeMotionDirectorAction`

Gateway for bounded Studio operations such as selection/rig inspection, animation inventory and paginated key inspection, comparison, validation, R6-to-R15 retarget staging, contact/IK creation and audit, stage, commit, attach, pose, preview, marker reads, and management. Use only action names exposed by the current status/schema.

### `getMotionDirectorJob`

Polls asynchronous operations. Wait the returned `pollAfterMs`; continue until `succeeded` or `failed`. Do not resubmit the original write while a job is pending, and never repeat a successful commit/attach.

## Draft lifecycle

- **Blueprint:** compact authoring intent.
- **Draft:** stored editable animation data identified by `draftId`.
- **Validation:** structural/semantic checks on the draft.
- **Stage:** reversible bake into Studio-ready output.
- **Post-bake audit:** checks the actual baked result for continuity and curve damage.
- **Commit:** writes the staged result under a unique destination.
- **Attach:** places the committed animation in the selected rig's AnimSaves using the exact committed prefix.
- **Preview/pose:** visual inspection; not equivalent to commit.

## Token economy

- Inspect summaries before matrices.
- Use pagination and bounded time ranges. Begin with `page=1,pageSize=1`, then request only necessary pages/tracks.
- Prefer `sourcePath` when animation names can collide.
- Keep `draftId`; do not retransmit hundreds of keyframes.
- Use semantic beats/contacts/style for initial authoring and focused operations for revision.
- Compose layers rather than duplicating the base draft.
- Poll by `jobId` rather than repeating requests.
- Request compact post-bake metrics and suspicious samples before full raw output.
- Use dense sampling only for final/resolved curves, not during every blocking pass.

## Blueprint guidance

- Exact track names only.
- Euler rotations are degrees in `rotationDegrees={x,y,z}` where supported.
- Omitted position defaults to zero.
- Partial poses inherit the last authored state; omission is not an identity reset.
- Beats express intention and energy over time.
- Contacts express effector, target, time window, weight, and allowed slide.
- `denseLinear` is preferred when preserving an already-designed curve; Pose easing is valid only when its acceleration is intentional.

## Authorization boundary

Read-only inspection and numerical analysis do not need write confirmation. A direct request for a complete animation authorizes the bounded stage, commit, and attachment needed to fulfill it, using `confirmWrite=true`. A pose-only, preview-only, review-by-parts, or “do not save/commit yet” request does not.

Never infer permission to delete unrelated AnimSaves, publish Roblox assets, run arbitrary Luau, change Play/Edit mode, replace the selected rig, or modify another place. Retry one transient failure once; do not retry a successful write.

## Markers and cross-discipline timing

Read the shared director marker list before coordinating animation with VFX, camera, audio, or hit logic. Use descriptive marker names and precise times. Keep aura/loop markers distinct from impact markers; not every effect has an impact beat.
