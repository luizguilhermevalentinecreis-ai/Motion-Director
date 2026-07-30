import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type Rotation = [number, number, number];
type Position = { x: number; y: number; z: number };
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";

const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const client = new Client({ name: "motion-director-r6-practice", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/src/index.js"],
  cwd: process.cwd(),
  env: environment,
  stderr: "pipe",
});
const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function textResult(result: unknown): string {
  const content =
    result && typeof result === "object" && "content" in result
      ? (result as { content?: unknown }).content
      : undefined;
  if (!Array.isArray(content)) return "";
  const block = content.find(
    (item) =>
      item &&
      typeof item === "object" &&
      "type" in item &&
      item.type === "text" &&
      "text" in item &&
      typeof item.text === "string",
  ) as { text?: string } | undefined;
  return block?.text ?? "";
}

function quaternion([xDegrees, yDegrees, zDegrees]: Rotation) {
  const x = (xDegrees * Math.PI) / 360;
  const y = (yDegrees * Math.PI) / 360;
  const z = (zDegrees * Math.PI) / 360;
  const cx = Math.cos(x), sx = Math.sin(x);
  const cy = Math.cos(y), sy = Math.sin(y);
  const cz = Math.cos(z), sz = Math.sin(z);
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };
}

const duration = 0.8;
const phases: Array<{
  time: number;
  rootY: number;
  pose: Record<Joint, Rotation>;
  label: string;
}> = [
  {
    time: 0,
    rootY: -0.025,
    label: "left_contact",
    pose: {
      Torso: [3, -2, -2], Head: [-3, 2, 2],
      "Right Arm": [-34, 0, -4], "Left Arm": [34, 0, 4],
      "Right Leg": [30, 0, 1], "Left Leg": [-30, 0, -1],
    },
  },
  {
    time: 0.1,
    rootY: -0.07,
    label: "left_down",
    pose: {
      Torso: [5, -1, -3], Head: [-5, 1, 3],
      "Right Arm": [-25, 0, -3], "Left Arm": [25, 0, 3],
      "Right Leg": [22, 0, 1], "Left Leg": [-22, 0, -1],
    },
  },
  {
    time: 0.2,
    rootY: 0.015,
    label: "left_pass",
    pose: {
      Torso: [4, 0, -1], Head: [-4, 0, 1],
      "Right Arm": [-5, 0, -1], "Left Arm": [5, 0, 1],
      "Right Leg": [4, 0, 0], "Left Leg": [-7, 0, 0],
    },
  },
  {
    time: 0.3,
    rootY: 0.055,
    label: "left_up",
    pose: {
      Torso: [3, 1, 1], Head: [-3, -1, -1],
      "Right Arm": [22, 0, 3], "Left Arm": [-22, 0, -3],
      "Right Leg": [-20, 0, -1], "Left Leg": [20, 0, 1],
    },
  },
  {
    time: 0.4,
    rootY: -0.025,
    label: "right_contact",
    pose: {
      Torso: [3, 2, 2], Head: [-3, -2, -2],
      "Right Arm": [34, 0, 4], "Left Arm": [-34, 0, -4],
      "Right Leg": [-30, 0, -1], "Left Leg": [30, 0, 1],
    },
  },
  {
    time: 0.5,
    rootY: -0.07,
    label: "right_down",
    pose: {
      Torso: [5, 1, 3], Head: [-5, -1, -3],
      "Right Arm": [25, 0, 3], "Left Arm": [-25, 0, -3],
      "Right Leg": [-22, 0, -1], "Left Leg": [22, 0, 1],
    },
  },
  {
    time: 0.6,
    rootY: 0.015,
    label: "right_pass",
    pose: {
      Torso: [4, 0, 1], Head: [-4, 0, -1],
      "Right Arm": [5, 0, 1], "Left Arm": [-5, 0, -1],
      "Right Leg": [-7, 0, 0], "Left Leg": [4, 0, 0],
    },
  },
  {
    time: 0.7,
    rootY: 0.055,
    label: "right_up",
    pose: {
      Torso: [3, -1, -1], Head: [-3, 1, 1],
      "Right Arm": [-22, 0, -3], "Left Arm": [22, 0, 3],
      "Right Leg": [20, 0, 1], "Left Leg": [-20, 0, -1],
    },
  },
];
phases.push({ ...phases[0]!, time: duration, label: "loop_end" });

const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const zero: Position = { x: 0, y: 0, z: 0 };
const draft = {
  name: "MD_R6_Practice_Walk_01",
  rigId: "selection:1",
  duration,
  framesPerSecond: 30,
  looped: true,
  priority: "movement" as const,
  beats: [
    {
      id: "left_step",
      label: "Left support step",
      startTime: 0,
      endTime: 0.4,
      intention: "Transfer body weight over the left support while the rigid limbs counter-swing clearly",
      energy: 0.58,
      leadingBodyPart: "Torso",
    },
    {
      id: "right_step",
      label: "Right support step",
      startTime: 0.4,
      endTime: 0.8,
      intention: "Mirror the support and return exactly to the first contact pose for a seamless loop",
      energy: 0.58,
      leadingBodyPart: "Torso",
    },
  ],
  contacts: [
    {
      id: "left_foot_support",
      effector: "LeftFootAttachment",
      target: "Ground",
      startTime: 0,
      endTime: 0.18,
      positionWeight: 1,
      rotationWeight: 1,
      allowSlideMeters: 0.01,
    },
    {
      id: "right_foot_support",
      effector: "RightFootAttachment",
      target: "Ground",
      startTime: 0.4,
      endTime: 0.58,
      positionWeight: 1,
      rotationWeight: 1,
      allowSlideMeters: 0.01,
    },
  ],
  tracks: joints.map((joint) => ({
    joint,
    space: "parent" as const,
    keys: phases.map((phase) => ({
      time: phase.time,
      transform: {
        position: joint === "Torso" ? { x: 0, y: phase.rootY, z: 0 } : zero,
        rotation: quaternion(phase.pose[joint]),
      },
      easing: { style: "cubicV2" as const, direction: "inOut" as const },
      weight: 1,
    })),
  })),
  metadata: {
    intent:
      "First R6 mastery study: a clean in-place walk built from contact, down, passing, and up poses with rigid-limb readability and a closed loop",
    rigType: "R6" as const,
    style: ["r6", "practice", "grounded", "clean-silhouette", "locomotion"],
    version: 1 as const,
  },
};

try {
  await client.connect(transport);
  let connected = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await client.callTool({ name: "studio_status", arguments: {} });
    if ((JSON.parse(textResult(status)) as { connected: boolean }).connected) {
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
  if (capabilities.isError) throw new Error(textResult(capabilities));

  const validation = await client.callTool({
    name: "validate_animation_draft",
    arguments: { draft },
  });
  if (validation.isError) throw new Error(textResult(validation));
  process.stdout.write(`VALIDATION\n${textResult(validation)}\n`);

  const staged = await client.callTool({
    name: "stage_animation_draft",
    arguments: {
      transactionName: "R6 Mastery Study 01 - Walk",
      draft,
    },
  });
  if (staged.isError) throw new Error(textResult(staged));
  const stagedData = JSON.parse(textResult(staged)) as { transactionId: string };
  process.stdout.write(`STAGED\n${textResult(staged)}\n`);

  const preview = await client.callTool({
    name: "preview_animation_draft",
    arguments: {
      transactionId: stagedData.transactionId,
      looped: true,
      playbackSpeed: 1,
    },
  });
  process.stdout.write(
    `PREVIEW\n${preview.isError ? `Unavailable: ${textResult(preview)}` : textResult(preview)}\n`,
  );

  const committed = await client.callTool({
    name: "commit_animation_draft",
    arguments: {
      transactionId: stagedData.transactionId,
      destinationName: "MD_R6_Practice_Walk_01",
    },
  });
  if (committed.isError) throw new Error(textResult(committed));
  process.stdout.write(`COMMITTED\n${textResult(committed)}\n`);

  const attached = await client.callTool({
    name: "attach_committed_animations_to_selected_rig_animsaves",
    arguments: { namePrefix: "MD_R6_Practice_Walk_01" },
  });
  process.stdout.write(
    `ANIMSAVES\n${attached.isError ? `Unavailable: ${textResult(attached)}` : textResult(attached)}\n`,
  );
} finally {
  await client.close();
}
