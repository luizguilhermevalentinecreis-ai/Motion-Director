# Roblox Motion Director architecture

## Product boundary

Motion Director is not an LLM and never requires an LLM provider API key. It is
a local professional animation engine and an MCP capability surface. The MCP
client supplies reasoning; Motion Director supplies Studio context, reversible
editing, solvers, validation, preview, and eventually rendering.

## Runtime components

1. **MCP companion** — launched by the AI client over stdio.
2. **Loopback bridge** — bound only to `127.0.0.1:34718`.
3. **Studio plugin** — makes outbound requests to the loopback bridge.
4. **Motion engine** — planned local worker for retargeting, IK, contacts,
   trajectory optimization, curve cleanup, and Blender-headless integration.
5. **Web relay** — optional public HTTPS command broker for Custom GPT Actions.
   The Studio plugin polls it outbound and displays its locally registered user's connection code.

The Studio plugin is intentionally not the MCP server. Roblox Studio can make
HTTP requests, but it is not a general-purpose local listening server.

## Security model

- MCP uses stdio: no network credential and no user-managed key.
- The bridge binds only to IPv4 loopback.
- Requests with an `Origin` header are rejected.
- A non-simple custom header is mandatory, preventing ordinary cross-origin
  browser requests.
- Studio changes are staged under `ServerStorage.MotionDirectorDrafts`.
- A separate explicit call commits a reviewed draft.
- Mutations are recorded with `ChangeHistoryService`.

The Web relay has a separate security boundary:

- no arbitrary Studio method or Luau endpoint;
- a fixed action allowlist;
- persistent personal connection codes separate from rotating 256-bit plugin tokens;
- heartbeat and job expiration;
- explicit write confirmation;
- bounded body size and pending-job count.

The bridge handshake will gain an installation-bound secret before public
distribution. It will be generated and exchanged by the installer, not entered
by the user.

## Professional animation contract

The canonical draft is intentionally richer than Roblox keyframes:

- semantic performance beats;
- contact intervals and allowed sliding tolerances;
- per-joint transform tracks;
- explicit coordinate spaces;
- quaternion rotations;
- easing and future curve tangents;
- root-motion and authored hip-height metadata;
- style and performance intent.

This representation remains editable until bake. Future versions will add
center-of-mass goals, gaze, prop constraints, pose annotations, layered motion,
camera tracks, event tracks, FACS controls, and solver provenance.

## MCP operation levels

### Read

`studio_status`, `get_scene_selection`, `inspect_rig`

### Analyze

`validate_animation_draft` and future frame diagnostics, silhouette review,
contact validation, and visual preview resources.

### Stage

`stage_animation_draft` writes only to the reversible draft area.

### Commit

`commit_animation_draft` requires a transaction identifier created by staging.
Publication to Roblox is deliberately outside the first slice.
