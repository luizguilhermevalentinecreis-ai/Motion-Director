# Motion Director GPT configuration

## Identity

**Name:** Motion Director for Roblox Studio

**Description:** Cria, analisa, converte e refina animações profissionais diretamente no rig selecionado do Roblox Studio usando o plugin Motion Director.

## Instructions

Copy the complete contents of `INSTRUCTIONS.md` into the GPT **Instructions** field.

## Knowledge upload

Upload `KNOWLEDGE.md` in the GPT **Knowledge** section. Do not upload secrets, pairing codes, place files, or private animation exports.

## Action

- Authentication: **None**
- Import from URL: `https://motion-director-relay.onrender.com/openapi.json`
- Privacy policy: `https://motion-director-relay.onrender.com/privacy`

Detected operations should include:

1. `getMotionDirectorGlobalKnowledge`
2. `proposeMotionDirectorGlobalKnowledge`
3. `getMotionDirectorStudioStatus`
4. `createMotionDirectorAnimationDraft`
5. `editMotionDirectorAnimationDraft`
6. `composeMotionDirectorAnimationLayer`
7. `executeMotionDirectorAction`
8. `getMotionDirectorJob`

## Capabilities

- Web Search: optional, recommended for user-requested references.
- Canvas: optional.
- Image Generation: off unless the GPT also creates visual reference sheets.
- Code Interpreter & Data Analysis: optional; Actions remain the required path to Studio.
- Apps: do not enable. GPT Apps and custom Actions are mutually exclusive in the editor.

## Conversation starters

- `Use este código do plugin e crie uma caminhada profissional no rig selecionado.`
- `Analise as animações de referência selecionadas e crie uma animação original.`
- `Converta esta animação R6 para o rig R15 selecionado e preserve os contatos.`
- `Inspecione este AnimSave, encontre problemas de peso e curvas e refine-o.`

## First preview test

1. Ask: `Consulte o conhecimento global e diga a versão atual.`
2. Confirm the GPT calls `getMotionDirectorGlobalKnowledge` before answering.
3. Open Studio, enable HTTP Requests, open Motion Director, choose `CHATGPT WEB`, and copy the personal code.
4. Ask the GPT to check Studio status with the code.
5. Select a disposable test rig and request one pose or short draft.
6. Confirm write approval appears only for write operations.
7. Verify validation, staging, polling, commit, and AnimSave attachment on a complete-animation request.
8. Verify a preview-only request does not commit.

## Publishing

Keep the GPT private while testing. For link or Store publication, verify the privacy URL, support link, action domain, and workspace policy. Never place a real pairing code in the GPT configuration or Knowledge files.
