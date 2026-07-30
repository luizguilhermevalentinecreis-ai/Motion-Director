import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type Rotation = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type Config = {
  name: string;
  label: string;
  duration: number;
  pitch: number;
  arm: number;
  leg: number;
  bob: number;
  twist: number;
  roll: number;
  energy: number;
  contactFraction: number;
  style: string[];
};

const configs: Config[] = [
  {
    name: "MD_R6_Locomotion_01_Walk",
    label: "Natural walk",
    duration: 0.84,
    pitch: -2,
    arm: 28,
    leg: 27,
    bob: 0.045,
    twist: 1.5,
    roll: 1.5,
    energy: 0.48,
    contactFraction: 0.29,
    style: ["natural-walk", "grounded", "relaxed"],
  },
  {
    name: "MD_R6_Locomotion_02_FastWalk",
    label: "Urgent fast walk",
    duration: 0.62,
    pitch: -4,
    arm: 36,
    leg: 37,
    bob: 0.055,
    twist: 2,
    roll: 2,
    energy: 0.66,
    contactFraction: 0.23,
    style: ["fast-walk", "urgent", "no-flight-phase"],
  },
  {
    name: "MD_R6_Locomotion_03_Run",
    label: "Sustained run",
    duration: 0.5,
    pitch: -6,
    arm: 40,
    leg: 48,
    bob: 0.07,
    twist: 2.5,
    roll: 2,
    energy: 0.82,
    contactFraction: 0.17,
    style: ["run", "athletic", "airborne-passing"],
  },
  {
    name: "MD_R6_Locomotion_04_PursuitSprint",
    label: "Pursuit sprint",
    duration: 0.42,
    pitch: -10,
    arm: 58,
    leg: 60,
    bob: 0.095,
    twist: 4,
    roll: 3,
    energy: 1,
    contactFraction: 0.12,
    style: ["sprint", "pursuit", "maximum-effort", "fear-driven"],
  },
];

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

function createDraft(config: Config) {
  const { duration: d, pitch, arm, leg, bob, twist, roll } = config;
  const isWalking = config.name.includes("Walk");
  const down = isWalking ? -bob : -bob * 0.78;
  const up = isWalking ? bob * 0.72 : bob;
  const phases = [
    { n: 0, y: -bob * 0.35, torso: [pitch, -twist, -roll] as Rotation, arm: [-arm, arm], leg: [leg, -leg] },
    { n: 0.125, y: down, torso: [pitch * 1.18, -twist * 0.65, -roll * 1.25] as Rotation, arm: [-arm * 0.78, arm * 0.78], leg: [leg * 0.76, -leg * 0.76] },
    { n: 0.25, y: isWalking ? bob * 0.18 : bob * 0.42, torso: [pitch * 1.08, 0, -roll * 0.25] as Rotation, arm: [-arm * 0.12, arm * 0.12], leg: [leg * 0.16, -leg * 0.24] },
    { n: 0.375, y: up, torso: [pitch, twist * 0.65, roll * 0.65] as Rotation, arm: [arm * 0.68, -arm * 0.68], leg: [-leg * 0.68, leg * 0.68] },
    { n: 0.5, y: -bob * 0.35, torso: [pitch, twist, roll] as Rotation, arm: [arm, -arm], leg: [-leg, leg] },
    { n: 0.625, y: down, torso: [pitch * 1.18, twist * 0.65, roll * 1.25] as Rotation, arm: [arm * 0.78, -arm * 0.78], leg: [-leg * 0.76, leg * 0.76] },
    { n: 0.75, y: isWalking ? bob * 0.18 : bob * 0.42, torso: [pitch * 1.08, 0, roll * 0.25] as Rotation, arm: [arm * 0.12, -arm * 0.12], leg: [-leg * 0.24, leg * 0.16] },
    { n: 0.875, y: up, torso: [pitch, -twist * 0.65, -roll * 0.65] as Rotation, arm: [-arm * 0.68, arm * 0.68], leg: [leg * 0.68, -leg * 0.68] },
  ];
  phases.push({ ...phases[0]!, n: 1 });

  const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
  return {
    name: config.name,
    rigId: "selection:1",
    duration: d,
    framesPerSecond: 30,
    looped: true,
    priority: "movement" as const,
    beats: [
      {
        id: "left_stride",
        label: `${config.label} - left stride`,
        startTime: 0,
        endTime: d / 2,
        intention: isWalking
          ? "Keep continuous ground support while transferring weight over the left leg"
          : "Strike briefly through the left support and project into an airborne passing phase",
        energy: config.energy,
        leadingBodyPart: "Torso",
      },
      {
        id: "right_stride",
        label: `${config.label} - right stride`,
        startTime: d / 2,
        endTime: d,
        intention: isWalking
          ? "Keep continuous ground support while transferring weight over the right leg"
          : "Mirror the force line without losing forward torso commitment",
        energy: config.energy,
        leadingBodyPart: "Torso",
      },
    ],
    contacts: [
      {
        id: "left_support",
        effector: "LeftFootAttachment",
        target: "Ground",
        startTime: 0,
        endTime: d * config.contactFraction,
        positionWeight: 1,
        rotationWeight: 1,
        allowSlideMeters: isWalking ? 0.008 : 0.018,
      },
      {
        id: "right_support",
        effector: "RightFootAttachment",
        target: "Ground",
        startTime: d / 2,
        endTime: d / 2 + d * config.contactFraction,
        positionWeight: 1,
        rotationWeight: 1,
        allowSlideMeters: isWalking ? 0.008 : 0.018,
      },
    ],
    tracks: joints.map((joint) => ({
      joint,
      space: "parent" as const,
      keys: phases.map((phase) => {
        const rotations: Record<Joint, Rotation> = {
          Torso: phase.torso,
          Head: [-phase.torso[0] * 0.72, -phase.torso[1] * 0.78, -phase.torso[2] * 0.82],
          "Right Arm": [phase.arm[0]!, 0, -phase.torso[2] * 0.65],
          "Left Arm": [phase.arm[1]!, 0, phase.torso[2] * 0.65],
          "Right Leg": [phase.leg[0]!, 0, -phase.torso[2] * 0.24],
          "Left Leg": [phase.leg[1]!, 0, phase.torso[2] * 0.24],
        };
        return {
          time: Number((phase.n * d).toFixed(6)),
          transform: {
            position: joint === "Torso" ? { x: 0, y: phase.y, z: 0 } : { x: 0, y: 0, z: 0 },
            rotation: quaternion(rotations[joint]),
          },
          easing: { style: "cubicV2" as const, direction: "inOut" as const },
          weight: 1,
        };
      }),
    })),
    metadata: {
      intent: `${config.label} as one distinct stage of a believable R6 speed progression`,
      rigType: "R6" as const,
      style: ["r6", "realistic-progression", ...config.style],
      version: 1 as const,
    },
  };
}

const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const client = new Client({ name: "motion-director-r6-locomotion-stages", version: "0.1.0" });
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

  for (const config of configs) {
    const draft = createDraft(config);
    const validation = await client.callTool({
      name: "validate_animation_draft",
      arguments: { draft },
    });
    if (validation.isError) throw new Error(`${config.name}: ${text(validation)}`);
    const staged = await client.callTool({
      name: "stage_animation_draft",
      arguments: { transactionName: `R6 realistic locomotion - ${config.label}`, draft },
    });
    if (staged.isError) throw new Error(`${config.name}: ${text(staged)}`);
    const transactionId = (JSON.parse(text(staged)) as { transactionId: string }).transactionId;
    const committed = await client.callTool({
      name: "commit_animation_draft",
      arguments: { transactionId, destinationName: config.name },
    });
    if (committed.isError) throw new Error(`${config.name}: ${text(committed)}`);
    process.stdout.write(`COMMITTED ${config.name}\n`);
  }

  const attached = await client.callTool({
    name: "attach_committed_animations_to_selected_rig_animsaves",
    arguments: { namePrefix: "MD_R6_Locomotion_" },
  });
  if (attached.isError) throw new Error(text(attached));
  process.stdout.write(`ANIMSAVES\n${text(attached)}\n`);

  const pursuit = await client.callTool({
    name: "preview_committed_animation",
    arguments: {
      animationName: "MD_R6_Locomotion_04_PursuitSprint",
      looped: true,
      playbackSpeed: 1,
    },
  });
  process.stdout.write(`PURSUIT_PREVIEW\n${pursuit.isError ? `Unavailable: ${text(pursuit)}` : text(pursuit)}\n`);
} finally {
  await client.close();
}
