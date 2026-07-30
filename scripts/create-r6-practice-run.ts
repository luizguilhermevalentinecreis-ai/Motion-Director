import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type Rotation = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type Phase = { time: number; rootY: number; pose: Record<Joint, Rotation> };

const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const client = new Client({ name: "motion-director-r6-run-study", version: "0.1.0" });
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
function quaternion([xd, yd, zd]: Rotation) {
  const x = xd * Math.PI / 360, y = yd * Math.PI / 360, z = zd * Math.PI / 360;
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y);
  const cz = Math.cos(z), sz = Math.sin(z);
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };
}

const duration = 0.48;
const phases: Phase[] = [
  { time: 0, rootY: -0.035, pose: {
    Torso: [-6, -2, -1], Head: [4, 2, 1],
    "Right Arm": [-38, 0, -3], "Left Arm": [38, 0, 3],
    "Right Leg": [50, 0, 1], "Left Leg": [-50, 0, -1],
  }},
  { time: 0.06, rootY: -0.065, pose: {
    Torso: [-8, -1, -2], Head: [6, 1, 2],
    "Right Arm": [-30, 0, -2], "Left Arm": [30, 0, 2],
    "Right Leg": [38, 0, 1], "Left Leg": [-38, 0, -1],
  }},
  { time: 0.12, rootY: 0.03, pose: {
    Torso: [-7, 0, 0], Head: [5, 0, 0],
    "Right Arm": [-5, 0, 0], "Left Arm": [5, 0, 0],
    "Right Leg": [8, 0, 0], "Left Leg": [-12, 0, 0],
  }},
  { time: 0.18, rootY: 0.065, pose: {
    Torso: [-6, 1, 1], Head: [4, -1, -1],
    "Right Arm": [25, 0, 2], "Left Arm": [-25, 0, -2],
    "Right Leg": [-36, 0, -1], "Left Leg": [36, 0, 1],
  }},
  { time: 0.24, rootY: -0.035, pose: {
    Torso: [-6, 2, 1], Head: [4, -2, -1],
    "Right Arm": [38, 0, 3], "Left Arm": [-38, 0, -3],
    "Right Leg": [-50, 0, -1], "Left Leg": [50, 0, 1],
  }},
  { time: 0.3, rootY: -0.065, pose: {
    Torso: [-8, 1, 2], Head: [6, -1, -2],
    "Right Arm": [30, 0, 2], "Left Arm": [-30, 0, -2],
    "Right Leg": [-38, 0, -1], "Left Leg": [38, 0, 1],
  }},
  { time: 0.36, rootY: 0.03, pose: {
    Torso: [-7, 0, 0], Head: [5, 0, 0],
    "Right Arm": [5, 0, 0], "Left Arm": [-5, 0, 0],
    "Right Leg": [-12, 0, 0], "Left Leg": [8, 0, 0],
  }},
  { time: 0.42, rootY: 0.065, pose: {
    Torso: [-6, -1, -1], Head: [4, 1, 1],
    "Right Arm": [-25, 0, -2], "Left Arm": [25, 0, 2],
    "Right Leg": [36, 0, 1], "Left Leg": [-36, 0, -1],
  }},
];
phases.push({ ...phases[0]!, time: duration });

const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const draft = {
  name: "MD_R6_Practice_Run_03",
  rigId: "selection:1",
  duration,
  framesPerSecond: 30,
  looped: true,
  priority: "movement" as const,
  beats: [
    {
      id: "left_stride", label: "Left drive", startTime: 0, endTime: 0.24,
      intention: "Drive the rigid body forward from the torso with a short compression and clear airborne passing pose",
      energy: 0.82, leadingBodyPart: "Torso",
    },
    {
      id: "right_stride", label: "Right drive", startTime: 0.24, endTime: 0.48,
      intention: "Mirror the stride and recover exactly into the first force line",
      energy: 0.82, leadingBodyPart: "Torso",
    },
  ],
  contacts: [
    {
      id: "left_contact", effector: "LeftFootAttachment", target: "Ground",
      startTime: 0, endTime: 0.1, positionWeight: 1, rotationWeight: 1,
      allowSlideMeters: 0.015,
    },
    {
      id: "right_contact", effector: "RightFootAttachment", target: "Ground",
      startTime: 0.24, endTime: 0.34, positionWeight: 1, rotationWeight: 1,
      allowSlideMeters: 0.015,
    },
  ],
  tracks: joints.map((joint) => ({
    joint,
    space: "parent" as const,
    keys: phases.map((phase) => ({
      time: phase.time,
      transform: {
        position: joint === "Torso" ? { x: 0, y: phase.rootY, z: 0 } : { x: 0, y: 0, z: 0 },
        rotation: quaternion(phase.pose[joint]),
      },
      easing: { style: "cubicV2" as const, direction: "inOut" as const },
      weight: 1,
    })),
  })),
  metadata: {
    intent: "Second R6 mastery study: a forceful in-place run with short contacts, airborne passing poses, rigid-limb clarity, and a closed loop",
    rigType: "R6" as const,
    style: ["r6", "practice", "athletic", "run-cycle", "grounded"],
    version: 1 as const,
  },
};

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
    name: "studio_animation_capabilities", arguments: {},
  });
  if (capabilities.isError) throw new Error(text(capabilities));
  const validation = await client.callTool({
    name: "validate_animation_draft", arguments: { draft },
  });
  if (validation.isError) throw new Error(text(validation));
  process.stdout.write(`VALIDATION\n${text(validation)}\n`);
  const staged = await client.callTool({
    name: "stage_animation_draft",
    arguments: { transactionName: "R6 Mastery Study 03 - Corrected Run", draft },
  });
  if (staged.isError) throw new Error(text(staged));
  const transactionId = (JSON.parse(text(staged)) as { transactionId: string }).transactionId;
  process.stdout.write(`STAGED\n${text(staged)}\n`);
  const preview = await client.callTool({
    name: "preview_animation_draft",
    arguments: { transactionId, looped: true, playbackSpeed: 1 },
  });
  process.stdout.write(`PREVIEW\n${preview.isError ? `Unavailable: ${text(preview)}` : text(preview)}\n`);
  const committed = await client.callTool({
    name: "commit_animation_draft",
    arguments: { transactionId, destinationName: draft.name },
  });
  if (committed.isError) throw new Error(text(committed));
  process.stdout.write(`COMMITTED\n${text(committed)}\n`);
  const attached = await client.callTool({
    name: "attach_committed_animations_to_selected_rig_animsaves",
    arguments: { namePrefix: draft.name },
  });
  process.stdout.write(`ANIMSAVES\n${attached.isError ? `Unavailable: ${text(attached)}` : text(attached)}\n`);
} finally {
  await client.close();
}
