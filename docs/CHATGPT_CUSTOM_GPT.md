# Motion Director Custom GPT

Motion Director connects a Custom GPT to the user's open Roblox Studio through a public HTTPS relay. No OpenAI API key is required: ChatGPT supplies the model, the Action calls the relay, and the Studio plugin polls only commands addressed to its personal pairing code.

## Production URLs

- Relay: `https://motion-director-relay.onrender.com`
- Health: `https://motion-director-relay.onrender.com/health`
- OpenAPI: `https://motion-director-relay.onrender.com/openapi.json`
- Privacy: `https://motion-director-relay.onrender.com/privacy`

## Files for the GPT editor

- `gpt-custom/INSTRUCTIONS.md` — paste into Instructions. It is kept below the editor's 8,000-character limit.
- `gpt-custom/KNOWLEDGE.md` — upload as the Knowledge index.
- `gpt-custom/PROFESSIONAL_ANIMATION_MANUAL.md` — professional craft and body mechanics.
- `gpt-custom/RIGS_AND_TRANSFORM_SPACES.md` — rig topology, spaces, FK/IK, contacts, and retargeting.
- `gpt-custom/AUTHORING_WORKFLOWS.md` — practical production recipes.
- `gpt-custom/ACTION_TOOL_REFERENCE.md` — Actions, draft lifecycle, authorization, and token economy.
- `gpt-custom/QUALITY_AND_VISUAL_REVIEW.md` — visual and post-bake acceptance gates.
- `gpt-custom/REFERENCE_STUDY_AND_STYLE.md` — reference analysis and style extraction.
- `gpt-custom/TROUBLESHOOTING.md` — setup and authoring failure diagnosis.
- `gpt-custom/CONFIG.md` — exact field values, starters, capabilities, URLs, and smoke test.

Do not upload the whole repository, place files, plugin source, environment files, Redis credentials, or pairing codes to GPT Knowledge.

## Create the GPT

GPT creation and editing currently happen on ChatGPT web and require a plan/workspace that permits GPT creation.

1. Open `https://chatgpt.com/gpts` and select **Create**.
2. Open the direct configuration view instead of relying only on the conversational builder.
3. Set the name and description from `gpt-custom/CONFIG.md`.
4. Paste all of `gpt-custom/INSTRUCTIONS.md` into **Instructions**.
5. Upload all eight Knowledge files listed in `gpt-custom/CONFIG.md` under **Knowledge**. Upload each file separately so its filename remains available for routing.
6. Add the conversation starters from `CONFIG.md`.
7. Under **Actions**, select **Create new action**.
8. Set Authentication to **None**. The persistent Studio pairing code provides beta session authorization; never hardcode it in the GPT.
9. Select **Import from URL** and import:
   `https://motion-director-relay.onrender.com/openapi.json`
10. Confirm the editor detects these eight operations:
    - `getMotionDirectorGlobalKnowledge`
    - `proposeMotionDirectorGlobalKnowledge`
    - `getMotionDirectorStudioStatus`
    - `createMotionDirectorAnimationDraft`
    - `editMotionDirectorAnimationDraft`
    - `composeMotionDirectorAnimationLayer`
    - `executeMotionDirectorAction`
    - `getMotionDirectorJob`
11. Set the Privacy Policy URL to:
    `https://motion-director-relay.onrender.com/privacy`
12. Do not enable GPT Apps; Apps and custom Actions are mutually exclusive. Other capabilities are optional as described in `CONFIG.md`.
13. Keep sharing set to **Only me** until the Preview tests pass.

## Connect Roblox Studio

1. Install/open the current Motion Director plugin.
2. In Roblox Studio, enable **Game Settings > Security > Allow HTTP Requests**.
3. Open the Motion Director panel.
4. Select `CHATGPT WEB`.
5. The default relay should already be `https://motion-director-relay.onrender.com`.
6. Copy the personal persistent connection code. Treat it like a password while the plugin is online.
7. Give the code only inside the current private GPT conversation when Studio work is needed.

## Test before publishing

In GPT Preview:

1. Ask it to consult global knowledge. It must call `getMotionDirectorGlobalKnowledge` first and report the snapshot version.
2. Give the personal code and ask for Studio status.
3. Select a disposable rig and request inspection only. Confirm no write approval is requested.
4. Request a preview-only pose. Confirm it does not commit or attach.
5. Request a complete short animation. Confirm the sequence is:
   create draft ID -> validate -> stage -> poll -> post-bake audit -> commit -> poll -> attach -> visual review.
6. Confirm the GPT does not claim draft creation is unavailable.
7. Confirm R6 and R15/custom topology are detected from inspection rather than assumed.
8. Close/disable the plugin and confirm Studio status reports offline without changing the personal code.

## Update an existing GPT

Use this whenever the repository Action schema or instruction package changes:

1. Open `https://chatgpt.com/gpts/mine` and edit Motion Director.
2. Replace Instructions with the current `gpt-custom/INSTRUCTIONS.md`.
3. Remove every old Motion Director Knowledge file. Upload the current eight-file set listed in `gpt-custom/CONFIG.md` so ChatGPT does not index duplicate versions.
4. Open the existing Action.
5. Re-import `https://motion-director-relay.onrender.com/openapi.json`. If the editor does not refresh operations reliably, delete that Action and create it again with Authentication **None**.
6. Re-enter the privacy URL if the editor clears it.
7. Run the Preview tests above, especially any newly added operation.
8. Select **Update** to publish the draft. Use the editor's version history if rollback is needed.

Updating the Render service alone does not update the Action schema cached by an existing GPT; re-import the schema after endpoint or operation changes.

## Runtime and security

- Connection codes are stable per registered Studio user and remain usable only while that plugin is connected.
- Plugin access uses a separate installation token; jobs are scoped to their pairing code.
- Pairing sessions and jobs expire and are not stored as global knowledge.
- Write actions require `confirmWrite=true`.
- The relay exposes a fixed action allowlist, not arbitrary Luau.
- Global knowledge proposals stay pending until an authorized development installation approves or rejects them.
- Approved global knowledge is shared; codes, place data, drafts, identities, and unpublished animation matrices are excluded.

For a large public launch, capability-code pairing should eventually be replaced or supplemented by account authentication, shared session storage, quotas, abuse monitoring, audit retention rules, and a documented deletion request process.

## Self-hosting

The relay needs Node.js 22+ and HTTPS. Typical Render variables are:

```text
PORT=8080
MOTION_RELAY_HOST=0.0.0.0
MOTION_PUBLIC_BASE_URL=https://your-domain.example
MOTION_KNOWLEDGE_REDIS_URL=https://your-upstash-endpoint
MOTION_KNOWLEDGE_REDIS_TOKEN=server-side-secret
MOTION_KNOWLEDGE_REDIS_KEY=motion-director:global-knowledge:v1
MOTION_KNOWLEDGE_DEVELOPER_INSTALLATIONS=authorized-installation-id
```

Never commit Redis tokens or other secrets. Build with `npm ci && npm run build`; start with `npm run relay:start`.
