# Roblox Motion Director

Local-first MCP infrastructure for directing professional Roblox animations
without an AI-provider API key.

## Current vertical slice

- stdio MCP server;
- secure loopback-only Studio bridge;
- Studio connection and selection inspection;
- Motor6D/Bone rig inspection;
- rich semantic animation draft schema;
- compact Euler-degree animation blueprints converted into complete stored drafts;
- deterministic draft validation and quality review;
- MCP authoring protocol, quality rubric, and professional direction prompt;
- reversible `KeyframeSequence` staging;
- explicit commit/discard operations with Studio undo history.
- Custom GPT Action relay with persistent per-user Studio connection codes;
- developer-curated global knowledge snapshots shared across every GPT chat and user;
- paginated lossless `KeyframeSequence` inspection;
- rig-aware world-space resampling at up to 120 FPS;
- center-of-mass, support, velocity, path, angular-speed, and root-relative support-travel metrics;
- normalized phase-aware comparison between two animation clips.
- cubic-Hermite/Catmull-Rom curve resampling, time warps and tangent-preserving dense output;
- additive/override animation-layer composition by stored draft IDs and joint masks;
- Studio-native ghosting, motion paths and a shared director marker bus.
- native R15/custom `IKControl` authoring, raycast-aligned foot locks and live contact-error auditing.

The relay now exposes a first-class draft-authoring operation. GPTs can submit a
compact full-body blueprint, receive a short-lived `draftId`, then validate and
stage the complete generated `AnimationDraft` without retransmitting it.

## Development

```powershell
npm install
# If npm 11 blocks esbuild/tsx lifecycle scripts, review and allow esbuild with:
# npm approve-scripts
npm run check
npm test
npm run build
```

Start the MCP companion manually for development:

```powershell
npm run dev
```

Start the ChatGPT Web relay locally:

```powershell
$env:MOTION_PUBLIC_BASE_URL = "http://127.0.0.1:34719"
npm run relay:dev
```

### Global knowledge publishing

Every GPT can read the published global knowledge snapshot. A paired chat can
propose a reusable lesson, but only an allowlisted development plugin can commit
or reject it.

For durable free cloud storage, create an Upstash Redis database and configure
these relay environment variables in Render:

```text
MOTION_KNOWLEDGE_REDIS_URL=https://...
MOTION_KNOWLEDGE_REDIS_TOKEN=...
MOTION_KNOWLEDGE_REDIS_KEY=motion-director:global-knowledge:v1
MOTION_KNOWLEDGE_DEVELOPER_INSTALLATIONS=<installation id shown by the development plugin>
```

Redis credentials remain server-side. Public plugin users need no API key. For
local development without Redis, the relay uses
`data/global-knowledge.json` with atomic writes.

The Studio plugin sources are
`studio-plugin/MotionDirectorPlugin.server.lua` and
`studio-plugin/AnimationAnalyzer.lua`.

See `docs/ARCHITECTURE.md` for the contract and security model.
See `docs/CHATGPT_CUSTOM_GPT.md` for the complete Custom GPT deployment and
pairing workflow.

The ready-to-copy GPT package is in `gpt-custom/`: paste `INSTRUCTIONS.md`,
upload `KNOWLEDGE.md`, and follow the exact field values in `CONFIG.md`.
