# Roblox Motion Director

Local-first MCP infrastructure for directing professional Roblox animations
without an AI-provider API key.

## Current vertical slice

- stdio MCP server;
- secure loopback-only Studio bridge;
- Studio connection and selection inspection;
- Motor6D/Bone rig inspection;
- rich semantic animation draft schema;
- deterministic draft validation and quality review;
- MCP authoring protocol, quality rubric, and professional direction prompt;
- reversible `KeyframeSequence` staging;
- explicit commit/discard operations with Studio undo history.
- Custom GPT Action relay with temporary Studio pairing codes;
- paginated lossless `KeyframeSequence` inspection;
- rig-aware world-space resampling at up to 120 FPS;
- center-of-mass, support, velocity, path, angular-speed, and root-relative support-travel metrics;
- normalized phase-aware comparison between two animation clips.

This is foundation work, not yet a motion generator. It establishes the
professional edit contract so future generators and AI agents do not have to
approximate animation by issuing raw joint rotations.

## Development

```powershell
npm install
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

The Studio plugin sources are
`studio-plugin/MotionDirectorPlugin.server.lua` and
`studio-plugin/AnimationAnalyzer.lua`.

See `docs/ARCHITECTURE.md` for the contract and security model.
See `docs/CHATGPT_CUSTOM_GPT.md` for the complete Custom GPT deployment and
pairing workflow.
