# ChatGPT Web integration

Motion Director supports two independent connection modes:

- `LOCAL MCP`: the existing loopback MCP companion at `127.0.0.1:34718`;
- `CHATGPT WEB`: a public HTTPS relay used by a Custom GPT Action.

The Web mode does not use an OpenAI API key. ChatGPT supplies the model and the
relay only routes bounded commands to the explicitly paired Studio plugin. The
plugin creates one personal connection code per locally registered Roblox Studio
user and reuses it across reconnections and later Studio launches.

## Runtime flow

```text
Custom GPT Action
       |
       | HTTPS
       v
Motion Director Web Relay
       ^
       | HTTPS polling from Studio
       |
Roblox Studio plugin
```

The relay never exposes arbitrary Luau execution. `src/web-relay.ts` contains the
allowlist of supported actions and their read/write classification.

## Local relay test

```powershell
$env:MOTION_PUBLIC_BASE_URL = "http://127.0.0.1:34719"
npm run relay:dev
```

In the Studio plugin:

1. Enable Studio HTTP requests.
2. Enter `http://127.0.0.1:34719` in the relay URL field.
3. Click `CHATGPT WEB`.
4. Confirm that the user's persistent connection code appears.

This verifies the plugin-to-relay path. ChatGPT cannot call this localhost URL.

## Production deployment

The relay requires a Node.js 22+ host with HTTPS. Pairing sessions and jobs remain
short-lived in memory. The developer-approved global knowledge snapshot uses
Upstash Redis in production or an atomic JSON file during local development.
Sticky sessions or a shared session store are still required before horizontally
scaling live Studio sessions.

Required environment variables:

```text
PORT=8080
MOTION_RELAY_HOST=0.0.0.0
MOTION_PUBLIC_BASE_URL=https://your-relay-domain.example
MOTION_KNOWLEDGE_REDIS_URL=https://your-upstash-endpoint
MOTION_KNOWLEDGE_REDIS_TOKEN=server-side-token
MOTION_KNOWLEDGE_REDIS_KEY=motion-director:global-knowledge:v1
MOTION_KNOWLEDGE_DEVELOPER_INSTALLATIONS=development-plugin-installation-id
```

Build and start:

```powershell
npm ci
npm run build
npm run relay:start
```

The included `Dockerfile` provides the same production command.

After deployment, verify:

```text
GET https://your-relay-domain.example/health
GET https://your-relay-domain.example/openapi.json
GET https://your-relay-domain.example/privacy
```

## Configure the Custom GPT

1. Open the GPT builder in ChatGPT.
2. Paste `gpt-custom/INSTRUCTIONS.md` into Instructions.
3. Under Actions, create a new action.
4. Choose `None` for authentication during the pairing-code beta.
5. Import `https://your-relay-domain.example/openapi.json`.
6. Set the privacy policy URL to `https://your-relay-domain.example/privacy`.
7. Test all five operations in Preview:
   - `getMotionDirectorGlobalKnowledge`
   - `proposeMotionDirectorGlobalKnowledge`
   - `getMotionDirectorStudioStatus`
   - `executeMotionDirectorAction`
   - `getMotionDirectorJob`
8. Before publishing, replace the policy contact with a real support contact.

## Pairing and security

- Personal connection codes contain ten non-ambiguous random characters.
- The code is generated once and stored in the plugin settings for that Studio user.
- Treat the code as a password because it remains valid whenever that user's plugin is online.
- Plugin access uses a separate 256-bit token and SHA-256 comparison.
- Codes expire when plugin heartbeats stop.
- Jobs are scoped to the pairing code that created them.
- Write actions require `confirmWrite=true`.
- The relay accepts at most eight simultaneous jobs per Studio session.
- Request bodies are capped at 4 MiB.
- Pairing and job data expire automatically and are not persisted.
- Global knowledge proposals remain pending until an allowlisted development
  installation selects `COMMIT GLOBAL` or `REJECT`.
- Published snapshots are readable by every chat and contain no connection code,
  place identifier, proposal author, or unpublished animation data.

For a larger public launch, add:

- OAuth accounts instead of capability-code-only identity;
- Redis-backed sessions and rate limiting;
- structured audit logs with short retention;
- abuse monitoring and per-account quotas;
- deployment-specific terms, privacy contact, and deletion workflow.
