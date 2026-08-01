const relay = process.env.MOTION_RELAY_URL ?? "https://motion-director-relay.onrender.com";
const pairingCode = process.env.MOTION_PAIRING_CODE;
if (!pairingCode) throw new Error("MOTION_PAIRING_CODE is required.");

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
type FlatPose = { rotation: V3; position: V3 };
type Frame = { time: number; poses: Record<string, FlatPose> };
const sourcePath = "Workspace.R6 [Dummy].AnimSaves.Sukuna Awake";
const wanted = new Set(["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"]);

function flattenPose(node: any, result: Record<string, FlatPose>) {
  if (wanted.has(node?.name) && node?.cframe?.eulerDegrees && node?.cframe?.position) {
    result[node.name] = {
      rotation: node.cframe.eulerDegrees,
      position: node.cframe.position,
    };
  }
  for (const child of node?.children ?? []) flattenPose(child, result);
}

const frames: Frame[] = [];
for (let page = 1; page <= 25; page += 1) {
  const result = await action("inspectAnimation", {
    sourcePath,
    occurrence: 1,
    rigPath: "Workspace.R6 [Dummy]",
    section: "raw",
    page,
    pageSize: 10,
    sampleRate: 30,
    parts: [...wanted],
  });
  for (const raw of result.rawKeyframes ?? []) {
    const poses: Record<string, FlatPose> = {};
    for (const root of raw.poses ?? []) flattenPose(root, poses);
    frames.push({ time: raw.time, poses });
  }
}

const axes = ["x", "y", "z"] as const;
const ranges: Record<string, unknown> = {};
for (const joint of wanted) {
  ranges[joint] = {
    rotation: Object.fromEntries(axes.map((axis) => {
      const values = frames.flatMap((frame) => frame.poses[joint] ? [frame.poses[joint].rotation[axis]] : []);
      return [axis, { min: Math.min(...values), max: Math.max(...values) }];
    })),
    position: Object.fromEntries(axes.map((axis) => {
      const values = frames.flatMap((frame) => frame.poses[joint] ? [frame.poses[joint].position[axis]] : []);
      return [axis, { min: Math.min(...values), max: Math.max(...values) }];
    })),
  };
}

function openPoseScore(frame: Frame) {
  const r = frame.poses["Right Arm"];
  const l = frame.poses["Left Arm"];
  const torso = frame.poses.Torso;
  const rl = frame.poses["Right Leg"];
  const ll = frame.poses["Left Leg"];
  if (!r || !l || !torso || !rl || !ll) return -Infinity;
  const armOpposition = Math.abs(r.rotation.z - l.rotation.z);
  const armTwist = Math.abs(r.rotation.y) + Math.abs(l.rotation.y);
  const legCross = Math.abs(rl.position.x - ll.position.x) + Math.abs(rl.rotation.z - ll.rotation.z) * 0.02;
  const torsoShape = Math.abs(torso.rotation.z) + Math.abs(torso.rotation.y) * 0.35;
  return armOpposition + armTwist * 0.3 + legCross * 20 + torsoShape * 0.6;
}

const candidates = [...frames]
  .filter((frame) => wanted.size === Object.keys(frame.poses).length)
  .sort((a, b) => openPoseScore(b) - openPoseScore(a))
  .slice(0, 12)
  .map((frame) => ({ time: frame.time, score: openPoseScore(frame), poses: frame.poses }));

process.stdout.write(JSON.stringify({ frameCount: frames.length, ranges, candidates }, null, 2));
