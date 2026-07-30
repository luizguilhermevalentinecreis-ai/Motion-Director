import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { animationDraftSchema, type AnimationDraft } from "../src/domain.js";

type V3 = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type Support = "right" | "left" | "flight";
type PlannedPhase = {
  n: number;
  name: string;
  support: Support;
  centerOfMass: string;
  lineOfAction: string;
  position: Partial<Record<Joint, V3>>;
  rotation: Record<Joint, V3>;
};

const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const zero = (): Record<Joint, V3> => ({
  Torso: [0, 0, 0], Head: [0, 0, 0],
  "Right Arm": [0, 0, 0], "Left Arm": [0, 0, 0],
  "Right Leg": [0, 0, 0], "Left Leg": [0, 0, 0],
});

// Each phase is a whole-body decision. Limbs never receive decorative translation.
// X rotation is the anatomical forward/back swing in parent-part space.
const plan: PlannedPhase[] = [
  {
    n: 0, name: "right_contact", support: "right",
    centerOfMass: "over the right hip, descending into contact",
    lineOfAction: "forward diagonal from planted right foot through sternum",
    position: { Torso: [-0.015, -0.12, -0.06] },
    rotation: {
      Torso: [-11, -4, -2], Head: [6, 3, 1],
      "Right Arm": [-34, -4, 5], "Left Arm": [38, 5, -5],
      "Right Leg": [34, -2, 2], "Left Leg": [-38, 2, -2],
    },
  },
  {
    n: 0.11, name: "right_absorption", support: "right",
    centerOfMass: "lowest point above the right support",
    lineOfAction: "compressed forward diagonal with quiet shoulders",
    position: { Torso: [-0.010, -0.18, -0.07] },
    rotation: {
      Torso: [-12, -2, -1], Head: [6, 2, 0],
      "Right Arm": [-27, -3, 4], "Left Arm": [31, 4, -4],
      "Right Leg": [18, -1, 1], "Left Leg": [-28, 1, -2],
    },
  },
  {
    n: 0.24, name: "right_passing", support: "right",
    centerOfMass: "rising through the planted right side",
    lineOfAction: "hips pass under the chest while the left thigh leads",
    position: { Torso: [-0.004, -0.05, -0.055] },
    rotation: {
      Torso: [-10, 0, 0], Head: [5, 0, 0],
      "Right Arm": [7, 1, 3], "Left Arm": [-9, -1, -3],
      "Right Leg": [-12, 0, 1], "Left Leg": [17, 0, -1],
    },
  },
  {
    n: 0.38, name: "flight_to_left", support: "flight",
    centerOfMass: "highest point between supports",
    lineOfAction: "long forward diagonal aimed toward the left contact",
    position: { Torso: [0.008, 0.035, -0.05] },
    rotation: {
      Torso: [-12, 4, 2], Head: [6, -3, -1],
      "Right Arm": [35, 4, 5], "Left Arm": [-31, -4, -5],
      "Right Leg": [-35, 2, 2], "Left Leg": [38, -2, -2],
    },
  },
  {
    n: 0.5, name: "left_contact", support: "left",
    centerOfMass: "over the left hip, descending into contact",
    lineOfAction: "forward diagonal from planted left foot through sternum",
    position: { Torso: [0.015, -0.12, -0.06] },
    rotation: {
      Torso: [-11, 4, 2], Head: [6, -3, -1],
      "Right Arm": [38, 5, 5], "Left Arm": [-34, -4, -5],
      "Right Leg": [-38, 2, 2], "Left Leg": [34, -2, -2],
    },
  },
  {
    n: 0.61, name: "left_absorption", support: "left",
    centerOfMass: "lowest point above the left support",
    lineOfAction: "compressed forward diagonal with quiet shoulders",
    position: { Torso: [0.010, -0.18, -0.07] },
    rotation: {
      Torso: [-12, 2, 1], Head: [6, -2, 0],
      "Right Arm": [31, 4, 4], "Left Arm": [-27, -3, -4],
      "Right Leg": [-28, 1, 2], "Left Leg": [18, -1, -1],
    },
  },
  {
    n: 0.74, name: "left_passing", support: "left",
    centerOfMass: "rising through the planted left side",
    lineOfAction: "hips pass under the chest while the right thigh leads",
    position: { Torso: [0.004, -0.05, -0.055] },
    rotation: {
      Torso: [-10, 0, 0], Head: [5, 0, 0],
      "Right Arm": [-9, -1, 3], "Left Arm": [7, 1, -3],
      "Right Leg": [17, 0, 1], "Left Leg": [-12, 0, -1],
    },
  },
  {
    n: 0.88, name: "flight_to_right", support: "flight",
    centerOfMass: "highest point between supports",
    lineOfAction: "long forward diagonal aimed toward the right contact",
    position: { Torso: [-0.008, 0.035, -0.05] },
    rotation: {
      Torso: [-12, -4, -2], Head: [6, 3, 1],
      "Right Arm": [-31, -4, 5], "Left Arm": [35, 4, -5],
      "Right Leg": [38, -2, 2], "Left Leg": [-35, 2, -2],
    },
  },
  {
    n: 1, name: "right_contact_close", support: "right",
    centerOfMass: "same right-side contact as the first frame",
    lineOfAction: "exact loop closure",
    position: { Torso: [-0.015, -0.12, -0.06] },
    rotation: {
      Torso: [-11, -4, -2], Head: [6, 3, 1],
      "Right Arm": [-34, -4, 5], "Left Arm": [38, 5, -5],
      "Right Leg": [34, -2, 2], "Left Leg": [-38, 2, -2],
    },
  },
];

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => {
  const n = clamp(value);
  return n * n * (3 - 2 * n);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function phaseAt(n: number): { position: Record<Joint, V3>; rotation: Record<Joint, V3> } {
  let left = plan[0]!;
  let right = plan[1]!;
  for (let index = 1; index < plan.length; index += 1) {
    right = plan[index]!;
    if (n <= right.n) {
      left = plan[index - 1]!;
      break;
    }
  }
  const t = ease((n - left.n) / Math.max(1e-6, right.n - left.n));
  const position = zero();
  const rotation = zero();
  for (const joint of joints) {
    const aPosition = left.position[joint] ?? [0, 0, 0];
    const bPosition = right.position[joint] ?? [0, 0, 0];
    position[joint] = aPosition.map((value, axis) => mix(value, bPosition[axis]!, t)) as V3;
    rotation[joint] = left.rotation[joint].map(
      (value, axis) => mix(value, right.rotation[joint][axis]!, t),
    ) as V3;
  }
  return { position, rotation };
}
function quaternion([xd, yd, zd]: V3) {
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

function assertPlan(): void {
  for (const phase of plan) {
    for (const joint of joints) {
      if (joint !== "Torso" && phase.position[joint] !== undefined) {
        throw new Error(`${phase.name}: ${joint} must remain attached to its real pivot.`);
      }
    }
  }
  for (const phase of [plan[0]!, plan[4]!]) {
    const rightLeg = phase.rotation["Right Leg"][0];
    const leftLeg = phase.rotation["Left Leg"][0];
    const rightArm = phase.rotation["Right Arm"][0];
    const leftArm = phase.rotation["Left Arm"][0];
    if (rightLeg * leftLeg >= 0) throw new Error(`${phase.name}: legs do not oppose.`);
    if (rightArm * rightLeg >= 0 || leftArm * leftLeg >= 0) {
      throw new Error(`${phase.name}: arms do not counter the same-side legs.`);
    }
  }
  if (JSON.stringify(plan[0]!.position) !== JSON.stringify(plan.at(-1)!.position) ||
      JSON.stringify(plan[0]!.rotation) !== JSON.stringify(plan.at(-1)!.rotation)) {
    throw new Error("The run loop does not close exactly.");
  }
}
assertPlan();

const duration = 0.54;
const fps = 60;
const frameCount = Math.round(duration * fps);
const draft: AnimationDraft = animationDraftSchema.parse({
  name: "MD_PLANNED_R6_01_PursuitRun",
  rigId: "selection:1",
  duration,
  framesPerSecond: fps,
  looped: true,
  priority: "movement",
  beats: plan.slice(0, -1).map((phase, index) => ({
    id: phase.name,
    label: phase.name,
    startTime: phase.n * duration,
    endTime: plan[index + 1]!.n * duration,
    intention: `${phase.centerOfMass}; ${phase.lineOfAction}`,
    energy: phase.support === "flight" ? 0.88 : phase.name.includes("absorption") ? 0.72 : 0.82,
    leadingBodyPart: phase.support === "right" ? "Right Leg" : phase.support === "left" ? "Left Leg" : "Torso",
  })),
  contacts: [
    { id: "right_contact", effector: "Right Leg", target: "ground", startTime: 0, endTime: 0.07, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.02 },
    { id: "left_contact", effector: "Left Leg", target: "ground", startTime: 0.29, endTime: 0.36, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.02 },
  ],
  tracks: joints.map((joint) => ({
    joint,
    space: "parent",
    keys: Array.from({ length: frameCount + 1 }, (_, index) => {
      const n = index / frameCount;
      const pose = phaseAt(n);
      return {
        time: Number((n * duration).toFixed(6)),
        transform: {
          position: {
            x: pose.position[joint][0],
            y: pose.position[joint][1],
            z: pose.position[joint][2],
          },
          rotation: quaternion(pose.rotation[joint]),
        },
        easing: { style: "linear", direction: "in" },
        weight: 1,
      };
    }),
  })),
  metadata: {
    intent: "A planned R6 pursuit run built from support, center of mass, line of action, gait opposition and fixed joint pivots",
    rigType: "R6",
    style: [
      "r6", "planned-body-mechanics", "parent-space", "fixed-limb-pivots",
      "contact-phases", "center-of-mass-authored", "human-review-required", "run",
    ],
    version: 1,
  },
});

process.stdout.write(`PLANNED_PHASES ${plan.length}\nAPPROVED 0\n${plan.map((phase) =>
  `${phase.name}: support=${phase.support}; com=${phase.centerOfMass}; line=${phase.lineOfAction}`
).join("\n")}\n`);

const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
const client = new Client({ name: "motion-director-planned-r6-run", version: "0.3.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/src/index.js"],
  cwd: process.cwd(),
  env,
  stderr: "pipe",
});
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function text(result: unknown): string {
  const content = result && typeof result === "object" && "content" in result
    ? (result as { content?: unknown }).content
    : undefined;
  if (!Array.isArray(content)) return "";
  const block = content.find((item) =>
    item && typeof item === "object" && "type" in item && item.type === "text" &&
    "text" in item && typeof item.text === "string"
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
  const validation = await client.callTool({ name: "validate_animation_draft", arguments: { draft } });
  if (validation.isError) throw new Error(text(validation));
  process.stdout.write(`VALIDATION\n${text(validation)}\n`);
  const staged = await client.callTool({
    name: "stage_animation_draft",
    arguments: { transactionName: "Planned R6 pursuit run V3", draft },
  });
  if (staged.isError) throw new Error(text(staged));
  const transactionId = (JSON.parse(text(staged)) as { transactionId: string }).transactionId;
  const committed = await client.callTool({
    name: "commit_animation_draft",
    arguments: { transactionId, destinationName: draft.name },
  });
  if (committed.isError) throw new Error(text(committed));
  const attached = await client.callTool({
    name: "attach_committed_animations_to_selected_rig_animsaves",
    arguments: { namePrefix: "MD_PLANNED_R6_" },
  });
  if (attached.isError) throw new Error(text(attached));
  process.stdout.write(`ATTACHED\n${text(attached)}\n`);
} finally {
  await client.close();
}
