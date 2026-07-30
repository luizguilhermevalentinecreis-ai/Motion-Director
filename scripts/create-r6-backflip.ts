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

const name = "MD_R6_Acrobatics_01_Backflip";
const duration = 1.05;
const poses: Pose[] = [
  {
    n: 0,
    root: [0, 0, 0],
    torso: [0, 0, 0],
    head: [0, 0, 0],
    rightArm: [0, 0, 0],
    leftArm: [0, 0, 0],
    rightLeg: [0, 0, 0],
    leftLeg: [0, 0, 0],
  },
  {
    n: 0.08,
    root: [0, -0.09, 0.015],
    torso: [7, 0, 0],
    head: [-5, 0, 0],
    rightArm: [28, 0, -4],
    leftArm: [28, 0, 4],
    rightLeg: [10, 0, -2],
    leftLeg: [10, 0, 2],
    easing: "in",
  },
  {
    n: 0.17,
    root: [0, -0.22, 0.035],
    torso: [16, 0, 0],
    head: [-11, 0, 0],
    rightArm: [58, 0, -7],
    leftArm: [58, 0, 7],
    rightLeg: [22, 0, -4],
    leftLeg: [22, 0, 4],
    easing: "in",
  },
  {
    n: 0.24,
    root: [0, 0.02, 0.015],
    torso: [34, 0, 0],
    head: [-20, 0, 0],
    rightArm: [-132, 0, -6],
    leftArm: [-132, 0, 6],
    rightLeg: [-12, 0, -2],
    leftLeg: [-12, 0, 2],
    easing: "out",
  },
  {
    n: 0.34,
    root: [0, 0.24, 0],
    torso: [76, 0, 0],
    head: [-24, 0, 0],
    rightArm: [-105, 0, -6],
    leftArm: [-105, 0, 6],
    rightLeg: [46, 0, -3],
    leftLeg: [46, 0, 3],
    easing: "out",
  },
  {
    n: 0.44,
    root: [0, 0.37, 0],
    torso: [128, 0, 0],
    head: [-18, 0, 0],
    rightArm: [-48, 0, -9],
    leftArm: [-48, 0, 9],
    rightLeg: [88, 0, -6],
    leftLeg: [88, 0, 6],
    easing: "inOut",
  },
  {
    n: 0.54,
    root: [0, 0.43, 0],
    torso: [182, 0, 0],
    head: [-12, 0, 0],
    rightArm: [-30, 0, -12],
    leftArm: [-30, 0, 12],
    rightLeg: [104, 0, -8],
    leftLeg: [104, 0, 8],
  },
  {
    n: 0.64,
    root: [0, 0.36, 0],
    torso: [238, 0, 0],
    head: [-10, 0, 0],
    rightArm: [-35, 0, -10],
    leftArm: [-35, 0, 10],
    rightLeg: [92, 0, -6],
    leftLeg: [92, 0, 6],
  },
  {
    n: 0.74,
    root: [0, 0.23, 0],
    torso: [289, 0, 0],
    head: [-18, 0, 0],
    rightArm: [-72, 0, -7],
    leftArm: [-72, 0, 7],
    rightLeg: [48, 0, -4],
    leftLeg: [48, 0, 4],
    easing: "out",
  },
  {
    n: 0.83,
    root: [0, 0.07, 0.01],
    torso: [329, 0, 0],
    head: [-20, 0, 0],
    rightArm: [-25, 0, -6],
    leftArm: [-25, 0, 6],
    rightLeg: [18, 0, -3],
    leftLeg: [18, 0, 3],
    easing: "out",
  },
  {
    n: 0.89,
    root: [0, -0.13, 0.025],
    torso: [351, 0, 0],
    head: [-5, 0, 0],
    rightArm: [18, 0, -5],
    leftArm: [18, 0, 5],
    rightLeg: [22, 0, -4],
    leftLeg: [22, 0, 4],
    easing: "in",
  },
  {
    n: 0.95,
    root: [0, -0.21, 0.03],
    torso: [368, 0, 0],
    head: [-6, 0, 0],
    rightArm: [38, 0, -6],
    leftArm: [38, 0, 6],
    rightLeg: [25, 0, -5],
    leftLeg: [25, 0, 5],
    easing: "in",
  },
  {
    n: 1,
    root: [0, 0, 0],
    torso: [360, 0, 0],
    head: [0, 0, 0],
    rightArm: [0, 0, 0],
    leftArm: [0, 0, 0],
    rightLeg: [0, 0, 0],
    leftLeg: [0, 0, 0],
    easing: "out",
  },
];

const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const rotations = (pose: Pose): Record<Joint, Rotation> => ({
  Torso: pose.torso,
  Head: pose.head,
  "Right Arm": pose.rightArm,
  "Left Arm": pose.leftArm,
  "Right Leg": pose.rightLeg,
  "Left Leg": pose.leftLeg,
});
const draft = {
  name,
  rigId: "selection:1",
  duration,
  framesPerSecond: 30,
  looped: false,
  priority: "action" as const,
  beats: [
    {
      id: "load",
      label: "Load the jump",
      startTime: 0,
      endTime: duration * 0.17,
      intention: "Compress vertically and sweep both arms behind the body",
      energy: 0.72,
      leadingBodyPart: "Torso",
    },
    {
      id: "takeoff",
      label: "Explosive takeoff",
      startTime: duration * 0.17,
      endTime: duration * 0.34,
      intention: "Drive upward first, then initiate backward rotation with the arm swing",
      energy: 1,
      leadingBodyPart: "Torso",
    },
    {
      id: "tuck",
      label: "Compact rotation",
      startTime: duration * 0.34,
      endTime: duration * 0.68,
      intention: "Reduce the R6 silhouette around the center to accelerate the flip",
      energy: 0.92,
      leadingBodyPart: "Torso",
    },
    {
      id: "open",
      label: "Open and spot",
      startTime: duration * 0.68,
      endTime: duration * 0.86,
      intention: "Lengthen the body, slow rotation and bring the feet under the torso",
      energy: 0.78,
      leadingBodyPart: "Head",
    },
    {
      id: "land",
      label: "Absorb landing",
      startTime: duration * 0.86,
      endTime: duration,
      intention: "Meet the ground with both feet and absorb the remaining energy before neutral",
      energy: 0.66,
      leadingBodyPart: "Torso",
    },
  ],
  contacts: [
    {
      id: "takeoff_support",
      effector: "LeftFootAttachment",
      target: "Ground",
      startTime: 0,
      endTime: duration * 0.18,
      positionWeight: 1,
      rotationWeight: 0.85,
      allowSlideMeters: 0.01,
    },
    {
      id: "landing_support",
      effector: "RightFootAttachment",
      target: "Ground",
      startTime: duration * 0.87,
      endTime: duration,
      positionWeight: 1,
      rotationWeight: 0.85,
      allowSlideMeters: 0.015,
    },
  ],
  tracks: joints.map((joint) => ({
    joint,
    space: "parent" as const,
    keys: poses.map((pose) => ({
      time: Number((pose.n * duration).toFixed(6)),
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
    intent: "A readable full-body R6 standing backflip with load, takeoff, tuck, opening and landing",
    rigType: "R6" as const,
    style: ["r6", "acrobatics", "backflip", "grounded-takeoff", "full-rotation"],
    version: 1 as const,
  },
};

const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const client = new Client({ name: "motion-director-r6-backflip", version: "0.1.0" });
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

  const validation = await client.callTool({
    name: "validate_animation_draft",
    arguments: { draft },
  });
  if (validation.isError) throw new Error(text(validation));

  const staged = await client.callTool({
    name: "stage_animation_draft",
    arguments: { transactionName: "R6 acrobatics - standing backflip", draft },
  });
  if (staged.isError) throw new Error(text(staged));
  const transactionId = (JSON.parse(text(staged)) as { transactionId: string }).transactionId;

  const committed = await client.callTool({
    name: "commit_animation_draft",
    arguments: { transactionId, destinationName: name },
  });
  if (committed.isError) throw new Error(text(committed));
  process.stdout.write(`COMMITTED\n${text(committed)}\n`);

  const attached = await client.callTool({
    name: "attach_committed_animations_to_selected_rig_animsaves",
    arguments: { namePrefix: name },
  });
  if (attached.isError) throw new Error(text(attached));
  process.stdout.write(`ANIMSAVES\n${text(attached)}\n`);

  const preview = await client.callTool({
    name: "preview_committed_animation",
    arguments: { animationName: name, looped: false, playbackSpeed: 1 },
  });
  process.stdout.write(`PREVIEW\n${preview.isError ? `Unavailable: ${text(preview)}` : text(preview)}\n`);
} finally {
  await client.close();
}
