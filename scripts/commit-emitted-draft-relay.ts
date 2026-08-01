import { execFileSync } from "node:child_process";
import { animationDraftSchema } from "../src/domain.js";

const relay = process.env.MOTION_RELAY_URL ?? "https://motion-director-relay.onrender.com";
const pairingCode = process.env.MOTION_PAIRING_CODE;
const draftSelector = process.env.MOTION_DRAFT_NAME;
const draftScript = process.env.MOTION_DRAFT_SCRIPT ?? "scripts/create-r6-world-solved-combat.ts";

if (!pairingCode) throw new Error("MOTION_PAIRING_CODE is required.");
if (!draftSelector) throw new Error("MOTION_DRAFT_NAME is required.");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function post(path: string, body: unknown): Promise<any> {
  const response = await fetch(`${relay}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(json)}`);
  return json;
}

async function action(name: string, input: Record<string, unknown>, confirmWrite = false): Promise<any> {
  const started = await post("/v1/actions/execute", {
    pairingCode,
    action: name,
    input,
    ...(confirmWrite ? { confirmWrite: true } : {}),
  });
  if (started.status === "succeeded") return started.result;
  for (;;) {
    await sleep(started.pollAfterMs ?? 600);
    const job = await post("/v1/actions/job", { pairingCode, jobId: started.jobId });
    if (job.status === "succeeded") return job.result;
    if (job.status === "failed") throw new Error(`${name}: ${job.error}`);
  }
}

const executable = process.platform === "win32"
  ? "node_modules\\.bin\\tsx.cmd"
  : "node_modules/.bin/tsx";
const emitted = execFileSync(executable, [draftScript], {
  cwd: process.cwd(),
  encoding: "utf8",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    MOTION_DRAFT_NAME: draftSelector,
    MOTION_EMIT_DRAFT: "1",
  },
  maxBuffer: 32 * 1024 * 1024,
});
const draft = animationDraftSchema.parse(JSON.parse(emitted));
const validation = await action("validateAnimationDraft", { draft });
const blockingIssues = validation?.report?.blockingIssues ?? [];
if (blockingIssues.length > 0) {
  throw new Error(`Blocking validation issues: ${blockingIssues.join("; ")}`);
}
const staged = await action(
  "stageAnimationDraft",
  { transactionName: `${draft.name} complete take`, draft },
  true,
);
if (process.env.MOTION_STAGE_ONLY === "1") {
  process.stdout.write(JSON.stringify({
    name: draft.name,
    duration: draft.duration,
    validation,
    staged,
  }, null, 2));
  process.exit(0);
}
const committed = await action(
  "commitAnimationDraft",
  { transactionId: staged.transactionId, destinationName: draft.name },
  true,
);
const attached = await action(
  "attachCommittedAnimations",
  { namePrefix: draft.name },
  true,
);

process.stdout.write(JSON.stringify({
  name: draft.name,
  duration: draft.duration,
  trackKeyCounts: Object.fromEntries(draft.tracks.map((track) => [track.joint, track.keys.length])),
  validation,
  staged,
  committed,
  attached,
}, null, 2));
