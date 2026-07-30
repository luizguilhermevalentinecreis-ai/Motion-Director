# ChatGPT Web integration

Motion Director supports two independent connection modes:

- `LOCAL MCP`: the existing loopback MCP companion at `127.0.0.1:34718`;
- `CHATGPT WEB`: a public HTTPS relay used by a Custom GPT Action.

The Web mode does not use an OpenAI API key. ChatGPT supplies the model and the
relay only routes bounded commands to the explicitly paired Studio plugin.

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
4. Confirm that a temporary code appears.

This verifies the plugin-to-relay path. ChatGPT cannot call this localhost URL.

## Production deployment

The relay requires a Node.js 22+ host with HTTPS. It is stateless except for
short-lived in-memory pairing sessions and jobs, so a single instance is sufficient
for the first public beta. Sticky sessions or a shared session store are required
before horizontally scaling it.

Required environment variables:

```text
PORT=8080
MOTION_RELAY_HOST=0.0.0.0
MOTION_PUBLIC_BASE_URL=https://your-relay-domain.example
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
7. Test all three operations in Preview:
   - `getMotionDirectorStudioStatus`
   - `executeMotionDirectorAction`
   - `getMotionDirectorJob`
8. Before publishing, replace the policy contact with a real support contact.

## Pairing and security

- Pairing codes contain ten non-ambiguous random characters.
- Plugin access uses a separate 256-bit token and SHA-256 comparison.
- Codes expire when plugin heartbeats stop.
- Jobs are scoped to the pairing code that created them.
- Write actions require `confirmWrite=true`.
- The relay accepts at most eight simultaneous jobs per Studio session.
- Request bodies are capped at 4 MiB.
- Pairing and job data expire automatically and are not persisted.

For a larger public launch, add:

- OAuth accounts instead of capability-code-only identity;
- Redis-backed sessions and rate limiting;
- structured audit logs with short retention;
- abuse monitoring and per-account quotas;
- deployment-specific terms, privacy contact, and deletion workflow.

