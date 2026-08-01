# Motion Director troubleshooting

Use current Action errors and Studio evidence first. Do not invent missing capabilities.

## GPT does not consult global knowledge

- Confirm the full current `INSTRUCTIONS.md` is in the GPT Instructions field.
- Re-import `https://motion-director-relay.onrender.com/openapi.json`.
- Confirm `getMotionDirectorGlobalKnowledge` appears among the eight operations.
- Remove duplicate/older uploaded knowledge files.
- Test with: “Consulte o conhecimento global e diga a versão atual.”

## GPT says it cannot create a draft from zero

The imported schema is stale or Instructions are old. The current Action includes `createMotionDirectorAnimationDraft`, which accepts a compact blueprint and returns `draftId`. Re-import the schema; if the editor caches it, delete and recreate the Action with Authentication `None`.

## Studio is offline or code fails

- Enable Studio HTTP Requests.
- Open the current Motion Director plugin and select `CHATGPT WEB`.
- Copy the persistent personal code exactly.
- The code should remain stable for the registered Studio user, but it works only while that plugin session is connected.
- Do not generate or guess a replacement code.

## Selection is missing or changed

Ask the user to select the intended rig and re-inspect immediately. Do not create a replacement rig or alter selection while the user is evaluating. Verify the returned path before writes.

## Inspection response is too large

Use pagination and bounded ranges. Start with inventory, then `page=1,pageSize=1`, a specific `sourcePath`, selected tracks, and a narrow time range. Expand incrementally. Do not request every raw transform when compact metrics answer the question.

## R15 reports no Motor6D

Inspect for AnimationConstraint, Bone, and custom topology. Do not conclude that R15 cannot animate. Check attachment bases and `IsKinematic`; never edit `RigAttachment` CFrames as a substitute for animation.

## Preview does not move in Edit mode

`Motor6D.Transform` may not visibly update outside simulation. Use the plugin's supported preview/pose path that reconstructs FK and temporarily applies part world transforms, preserving/restoring anchors and original state. Do not force Start/Stop Play while the user is evaluating.

## Animation Editor does not detect the result

Verify that commit succeeded, the exact committed prefix was attached to the selected rig's expected AnimSaves location, track names/topology match, and the sequence is a valid KeyframeSequence. Avoid duplicate names and stale attachments.

## Stage or job appears stuck

Poll `getMotionDirectorJob` using the returned `jobId` and `pollAfterMs`. Do not submit duplicate writes. Retry a transient failure once only after the job reports failure.

## Post-bake audit fails despite good draft validation

The bake changed the authored curve. Inspect suspicious velocity/continuity samples. Use tangent-aware output or dense Linear resampling of the resolved source curve. Ensure the resampler includes a final sample exactly at `duration`, even when duration is not divisible by sample interval.

## Layer composition produces wrong axes

Check `space` on base and layer tracks. Do not mix parent and motor space without explicit conversion through rest bases. Verify layer start time falls within duration. Use shortest-arc SLERP for rotations and a monotonic sampler for long clips.

## Feet slide or contacts drift

Inspect world-space effector error, support phase, root/center-of-mass path, and lock blend windows. IK cannot repair an impossible support pose. On R6, use authored block mechanics rather than promising knee/ankle solving.

## Animation has a visible 180/360-degree spin

Normalize quaternions, choose consistent signs, use shortest-arc SLERP, and add an intentional intermediate orientation/twist reference when direction aligns with the solver's up vector.

## Motion is stiff despite many keys

Key count is not design. Return to hero poses and breakdowns; inspect timing, spacing, arcs, and overlap. Remove repeated/noisy keys. Dense keys should sample a deliberate curve.

## Motion is loose or overanimated

Establish stable anchors and amplitude hierarchy. Reduce constant root/torso/idle oscillation. Keep exaggeration in strategic pose relationships, then use small controlled motion around them.

## Wrong rig/avatar appearance

Reinspect the rendered avatar, body type, proportions, accessories, and visible block faces. A mathematically valid transform can read incorrectly on a non-block avatar or differently proportioned rig.

## Commit/attach happened twice

Never retry a succeeded write. List committed/attached outputs, identify the exact destination, and ask before deleting duplicates unless cleanup was explicitly authorized.

## Security and privacy

Never put pairing codes, Redis tokens, installation tokens, private place data, or animation matrices into GPT Knowledge. The Action must remain bounded; do not add arbitrary Luau execution as a troubleshooting shortcut.
