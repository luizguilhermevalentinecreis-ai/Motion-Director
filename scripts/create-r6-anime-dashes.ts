import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type Rotation = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type Pose = {
  n: number;
  root: [number, number, number];
  torso: Rotation;
  head: Rotation;
  rightArm: Rotation;
  leftArm: Rotation;
  rightLeg: Rotation;
  leftLeg: Rotation;
  easing?: "in" | "out" | "inOut";
};
type Dash = {
  name: string;
  label: string;
  direction: "forward" | "backward" | "left" | "right";
  duration: number;
  poses: Pose[];
};

function quaternion([xd, yd, zd]: Rotation) {
  const x = xd * Math.PI / 360;
  const y = yd * Math.PI / 360;
  const z = zd * Math.PI / 360;
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y);
  const cz = Math.cos(z), sz = Math.sin(z);
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };
}

const neutral: Pose = {
  n: 0,
  root: [0, 0, 0],
  torso: [0, 0, 0],
  head: [0, 0, 0],
  rightArm: [0, 0, 0],
  leftArm: [0, 0, 0],
  rightLeg: [0, 0, 0],
  leftLeg: [0, 0, 0],
};

const dashes: Dash[] = [
  {
    name: "MD_R6_Dash_01_Forward_V3",
    label: "Anime forward arrow burst",
    direction: "forward",
    duration: 0.3,
    poses: [
      neutral,
      { n: 0.1, root: [0, -0.055, 0.025], torso: [5, 0, 0], head: [-4, 0, 0], rightArm: [-18, 0, -3], leftArm: [-18, 0, 3], rightLeg: [18, 0, 1], leftLeg: [14, 0, -1], easing: "in" },
      { n: 0.22, root: [0, -0.14, -0.13], torso: [-35, -2, -1], head: [25, 2, 1], rightArm: [76, 0, -9], leftArm: [76, 0, 9], rightLeg: [-52, 0, -3], leftLeg: [-32, 0, 3], easing: "out" },
      { n: 0.38, root: [0, -0.155, -0.22], torso: [-42, -3, -2], head: [30, 3, 2], rightArm: [86, 0, -12], leftArm: [86, 0, 12], rightLeg: [-64, 0, -4], leftLeg: [-40, 0, 4], easing: "out" },
      { n: 0.58, root: [0, -0.13, -0.2], torso: [-39, 3, 2], head: [28, -3, -2], rightArm: [82, 0, -10], leftArm: [82, 0, 10], rightLeg: [-42, 0, -3], leftLeg: [-60, 0, 3] },
      { n: 0.75, root: [0, -0.085, -0.1], torso: [-24, 2, 1], head: [17, -2, -1], rightArm: [55, 0, -7], leftArm: [55, 0, 7], rightLeg: [-28, 0, -2], leftLeg: [-40, 0, 2], easing: "inOut" },
      { n: 0.9, root: [0, -0.03, -0.025], torso: [-9, 0, 0], head: [6, 0, 0], rightArm: [22, 0, -3], leftArm: [22, 0, 3], rightLeg: [-10, 0, -1], leftLeg: [-14, 0, 1], easing: "inOut" },
      { ...neutral, n: 1, easing: "out" },
    ],
  },
  {
    name: "MD_R6_Dash_02_Backward",
    label: "Anime backward evade",
    direction: "backward",
    duration: 0.42,
    poses: [
      neutral,
      { n: 0.1, root: [0, -0.025, -0.02], torso: [-5, 2, 0], head: [4, -2, 0], rightArm: [22, 0, -3], leftArm: [-18, 0, 3], rightLeg: [-20, 0, 0], leftLeg: [16, 0, 0], easing: "in" },
      { n: 0.2, root: [0, -0.09, 0.055], torso: [13, -3, 2], head: [-10, 3, -2], rightArm: [-46, 0, -8], leftArm: [-38, 0, 8], rightLeg: [48, 0, 2], leftLeg: [-42, 0, -2], easing: "out" },
      { n: 0.38, root: [0, -0.07, 0.085], torso: [17, -5, 3], head: [-13, 5, -3], rightArm: [-54, 0, -10], leftArm: [-47, 0, 10], rightLeg: [42, 0, 3], leftLeg: [-50, 0, -3] },
      { n: 0.58, root: [0, -0.06, 0.065], torso: [14, 4, -2], head: [-10, -4, 2], rightArm: [-42, 0, -7], leftArm: [-50, 0, 7], rightLeg: [-38, 0, -2], leftLeg: [35, 0, 2] },
      { n: 0.78, root: [0, -0.035, 0.025], torso: [8, 2, -1], head: [-6, -2, 1], rightArm: [-24, 0, -4], leftArm: [-30, 0, 4], rightLeg: [-18, 0, -1], leftLeg: [16, 0, 1], easing: "inOut" },
      { ...neutral, n: 1, easing: "out" },
    ],
  },
  {
    name: "MD_R6_Dash_03_Left",
    label: "Anime left sidestep",
    direction: "left",
    duration: 0.4,
    poses: [
      neutral,
      { n: 0.1, root: [0.025, -0.025, 0], torso: [0, 5, 5], head: [0, -5, -4], rightArm: [-15, 0, -6], leftArm: [18, 0, 8], rightLeg: [10, 0, 5], leftLeg: [-14, 0, -6], easing: "in" },
      { n: 0.2, root: [-0.075, -0.085, 0], torso: [-5, -15, -17], head: [4, 13, 13], rightArm: [42, 0, -20], leftArm: [-30, 0, 15], rightLeg: [-34, 0, -10], leftLeg: [45, 0, 12], easing: "out" },
      { n: 0.4, root: [-0.11, -0.065, 0], torso: [-7, -20, -21], head: [5, 17, 16], rightArm: [50, 0, -25], leftArm: [-38, 0, 19], rightLeg: [-42, 0, -13], leftLeg: [52, 0, 15] },
      { n: 0.62, root: [-0.075, -0.05, 0], torso: [-5, -13, -15], head: [4, 11, 12], rightArm: [36, 0, -18], leftArm: [-26, 0, 14], rightLeg: [31, 0, -8], leftLeg: [-36, 0, 10] },
      { n: 0.82, root: [-0.03, -0.025, 0], torso: [-2, -5, -7], head: [2, 4, 5], rightArm: [16, 0, -8], leftArm: [-12, 0, 7], rightLeg: [14, 0, -4], leftLeg: [-16, 0, 5], easing: "inOut" },
      { ...neutral, n: 1, easing: "out" },
    ],
  },
  {
    name: "MD_R6_Dash_04_Right",
    label: "Anime right sidestep",
    direction: "right",
    duration: 0.4,
    poses: [
      neutral,
      { n: 0.1, root: [-0.025, -0.025, 0], torso: [0, -5, -5], head: [0, 5, 4], rightArm: [18, 0, -8], leftArm: [-15, 0, 6], rightLeg: [-14, 0, 6], leftLeg: [10, 0, -5], easing: "in" },
      { n: 0.2, root: [0.075, -0.085, 0], torso: [-5, 15, 17], head: [4, -13, -13], rightArm: [-30, 0, -15], leftArm: [42, 0, 20], rightLeg: [45, 0, -12], leftLeg: [-34, 0, 10], easing: "out" },
      { n: 0.4, root: [0.11, -0.065, 0], torso: [-7, 20, 21], head: [5, -17, -16], rightArm: [-38, 0, -19], leftArm: [50, 0, 25], rightLeg: [52, 0, -15], leftLeg: [-42, 0, 13] },
      { n: 0.62, root: [0.075, -0.05, 0], torso: [-5, 13, 15], head: [4, -11, -12], rightArm: [-26, 0, -14], leftArm: [36, 0, 18], rightLeg: [-36, 0, -10], leftLeg: [31, 0, 8] },
      { n: 0.82, root: [0.03, -0.025, 0], torso: [-2, 5, 7], head: [2, -4, -5], rightArm: [-12, 0, -7], leftArm: [16, 0, 8], rightLeg: [-16, 0, -5], leftLeg: [14, 0, 4], easing: "inOut" },
      { ...neutral, n: 1, easing: "out" },
    ],
  },
];

function createDraft(dash: Dash) {
  const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
  const rotations = (pose: Pose): Record<Joint, Rotation> => ({
    Torso: pose.torso,
    Head: pose.head,
    "Right Arm": pose.rightArm,
    "Left Arm": pose.leftArm,
    "Right Leg": pose.rightLeg,
    "Left Leg": pose.leftLeg,
  });
  return {
    name: dash.name,
    rigId: "selection:1",
    duration: dash.duration,
    framesPerSecond: 30,
    looped: false,
    priority: "action" as const,
    beats: [
      {
        id: "anticipation",
        label: "Compressed anticipation",
        startTime: 0,
        endTime: dash.duration * 0.16,
        intention: "Load against the travel direction without broadcasting a long windup",
        energy: 0.68,
        leadingBodyPart: "Torso",
      },
      {
        id: "burst",
        label: dash.label,
        startTime: dash.duration * 0.16,
        endTime: dash.duration * 0.68,
        intention: `Commit the whole R6 silhouette into a fast ${dash.direction} burst`,
        energy: 1,
        leadingBodyPart: "Torso",
      },
      {
        id: "recovery",
        label: "Controlled recovery",
        startTime: dash.duration * 0.68,
        endTime: dash.duration,
        intention: "Bleed off the pose quickly and return control to locomotion",
        energy: 0.55,
        leadingBodyPart: "Torso",
      },
    ],
    contacts: [],
    tracks: joints.map((joint) => ({
      joint,
      space: "parent" as const,
      keys: dash.poses.map((pose) => ({
        time: Number((pose.n * dash.duration).toFixed(6)),
        transform: {
          position: joint === "Torso"
            ? { x: pose.root[0], y: pose.root[1], z: pose.root[2] }
            : { x: 0, y: 0, z: 0 },
          rotation: quaternion(rotations(pose)[joint]),
        },
        easing: {
          style: "cubicV2" as const,
          direction: pose.easing ?? "inOut" as const,
        },
        weight: 1,
      })),
    })),
    metadata: {
      intent: `${dash.label}; in-place animation intended to accompany code-driven character velocity`,
      rigType: "R6" as const,
      style: ["r6", "anime", "dash", dash.direction, "snappy", "in-place"],
      version: 1 as const,
    },
  };
}

const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const client = new Client({ name: "motion-director-r6-anime-dashes", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/src/index.js"],
  cwd: process.cwd(),
  env: environment,
  stderr: "pipe",
});
const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
function text(result: unknown): string {
  const content = result && typeof result === "object" && "content" in result
    ? (result as { content?: unknown }).content : undefined;
  if (!Array.isArray(content)) return "";
  const block = content.find((item) =>
    item && typeof item === "object" && "type" in item && item.type === "text" &&
    "text" in item && typeof item.text === "string",
  ) as { text?: string } | undefined;
  return block?.text ?? "";
}

try {
  await client.connect(transport);
  let connected = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await client.callTool({ name: "studio_status", arguments: {} });
    if ((JSON.parse(text(status)) as { connected: boolean }).connected) {
      connected = true;
      break;
    }
    await sleep(500);
  }
  if (!connected) throw new Error("Studio did not connect to Motion Director.");

  const capabilities = await client.callTool({
    name: "studio_animation_capabilities",
    arguments: {},
  });
  if (capabilities.isError) throw new Error(text(capabilities));

  const selectedDashes = process.argv.includes("--forward-only") ? dashes.slice(0, 1) : dashes;
  for (const dash of selectedDashes) {
    const draft = createDraft(dash);
    const validation = await client.callTool({
      name: "validate_animation_draft",
      arguments: { draft },
    });
    if (validation.isError) throw new Error(`${dash.name}: ${text(validation)}`);
    const staged = await client.callTool({
      name: "stage_animation_draft",
      arguments: { transactionName: `R6 anime dash - ${dash.direction}`, draft },
    });
    if (staged.isError) throw new Error(`${dash.name}: ${text(staged)}`);
    const transactionId = (JSON.parse(text(staged)) as { transactionId: string }).transactionId;
    const committed = await client.callTool({
      name: "commit_animation_draft",
      arguments: { transactionId, destinationName: dash.name },
    });
    if (committed.isError) throw new Error(`${dash.name}: ${text(committed)}`);
    process.stdout.write(`COMMITTED ${dash.name}\n`);
  }

  const attached = await client.callTool({
    name: "attach_committed_animations_to_selected_rig_animsaves",
    arguments: {
      namePrefix: process.argv.includes("--forward-only")
        ? "MD_R6_Dash_01_Forward_V3"
        : "MD_R6_Dash_",
    },
  });
  if (attached.isError) throw new Error(text(attached));
  process.stdout.write(`ANIMSAVES\n${text(attached)}\n`);

  const preview = await client.callTool({
    name: "preview_committed_animation",
    arguments: {
      animationName: "MD_R6_Dash_01_Forward_V3",
      looped: false,
      playbackSpeed: 1,
    },
  });
  process.stdout.write(`FORWARD_PREVIEW\n${preview.isError ? `Unavailable: ${text(preview)}` : text(preview)}\n`);
} finally {
  await client.close();
}
