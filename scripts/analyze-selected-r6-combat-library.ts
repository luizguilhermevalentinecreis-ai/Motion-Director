const relay = process.env.MOTION_RELAY_URL ?? "https://motion-director-relay.onrender.com";
const pairingCode = process.env.MOTION_PAIRING_CODE;
if (!pairingCode) throw new Error("MOTION_PAIRING_CODE is required.");

const rigPath = "Workspace.References.High Quality R6 Combat Animations";
const sourceBase = `${rigPath}.AnimSaves`;
const names = ["Combat1", "Combat2", "Combat3", "Combat4", "Combat5", "Clash1", "Clash2", "DownSlam", "Uptilt"];
const joints = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

async function action(name: string, input: Record<string, unknown>): Promise<any> {
  const started = await post("/v1/actions/execute", { pairingCode, action: name, input });
  if (started.status === "succeeded") return started.result;
  for (;;) {
    await sleep(started.pollAfterMs ?? 600);
    const job = await post("/v1/actions/job", { pairingCode, jobId: started.jobId });
    if (job.status === "succeeded") return job.result;
    if (job.status === "failed") throw new Error(`${name}: ${job.error}`);
  }
}

type V3 = { x: number; y: number; z: number };
type Pose = { rotation: V3; position: V3 };
type Frame = { time: number; poses: Record<string, Pose> };

function flattenPose(node: any, output: Record<string, Pose>) {
  if (joints.includes(node?.name) && node?.cframe?.eulerDegrees && node?.cframe?.position) {
    output[node.name] = { rotation: node.cframe.eulerDegrees, position: node.cframe.position };
  }
  for (const child of node?.children ?? []) flattenPose(child, output);
}

function mag(v: V3) { return Math.hypot(v.x, v.y, v.z); }
function delta(a: Pose, b: Pose) {
  return mag({ x: a.rotation.x - b.rotation.x, y: a.rotation.y - b.rotation.y, z: a.rotation.z - b.rotation.z })
    + mag({ x: a.position.x - b.position.x, y: a.position.y - b.position.y, z: a.position.z - b.position.z }) * 45;
}

const summaries: any[] = [];
for (const name of names) {
  const result = await action("inspectAnimation", {
    sourcePath: `${sourceBase}.${name}`,
    occurrence: 1,
    rigPath,
    sampleRate: 60,
    rawStart: 0,
    rawCount: 120,
    sampleStart: 0,
    sampleCount: 0,
    includeRig: false,
    includeRaw: true,
    includeSamples: false,
    includeMetrics: true,
    parts: joints,
  });
  const frames: Frame[] = (result.rawKeyframes ?? []).map((raw: any) => {
    const poses: Record<string, Pose> = {};
    for (const root of raw.poses ?? []) flattenPose(root, poses);
    return { time: raw.time, poses };
  });
  const scored = frames.map((frame, index) => {
    const previous = frames[Math.max(0, index - 1)]!;
    const energy = joints.reduce((sum, joint) => frame.poses[joint] && previous.poses[joint] ? sum + delta(frame.poses[joint], previous.poses[joint]) : sum, 0);
    const torso = frame.poses.Torso;
    const ra = frame.poses["Right Arm"];
    const la = frame.poses["Left Arm"];
    const rl = frame.poses["Right Leg"];
    const ll = frame.poses["Left Leg"];
    const silhouette = torso && ra && la && rl && ll
      ? Math.abs(ra.rotation.z - la.rotation.z) + Math.abs(rl.rotation.z - ll.rotation.z) + Math.abs(torso.rotation.y) * 0.7 + Math.abs(torso.rotation.z) * 0.8
      : 0;
    return { time: frame.time, energy, silhouette, poses: frame.poses };
  });
  const keyMoments = [...scored]
    .sort((a, b) => (b.energy + b.silhouette * 0.3) - (a.energy + a.silhouette * 0.3))
    .slice(0, 5)
    .sort((a, b) => a.time - b.time)
    .map(({ time, energy, silhouette, poses }) => ({ time, energy: +energy.toFixed(2), silhouette: +silhouette.toFixed(2), poses }));
  summaries.push({
    name,
    duration: result.duration ?? result.summary?.duration,
    rawKeyframes: frames.length,
    metrics: result.metrics ?? result.motionMetrics,
    keyMoments,
  });
}

process.stdout.write(JSON.stringify({ rigPath, summaries }, null, 2));
