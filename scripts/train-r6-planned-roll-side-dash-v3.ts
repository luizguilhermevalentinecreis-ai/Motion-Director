import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { animationDraftSchema, type AnimationDraft } from "../src/domain.js";

type V3 = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type Support = "both" | "right" | "left" | "shoulder" | "flight";
type Phase = {
  n: number;
  name: string;
  support: Support;
  centerOfMass: string;
  lineOfAction: string;
  torsoPosition: V3;
  rotation: Record<Joint, V3>;
};
type PlannedMotion = {
  name: string;
  duration: number;
  priority: "movement" | "action3";
  intent: string;
  tags: string[];
  phases: Phase[];
  contacts: Array<{
    id: string;
    effector: Joint;
    target: string;
    start: number;
    end: number;
    slide: number;
  }>;
};

const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const R = (
  torso: V3,
  head: V3,
  rightArm: V3,
  leftArm: V3,
  rightLeg: V3,
  leftLeg: V3,
): Record<Joint, V3> => ({
  Torso: torso, Head: head,
  "Right Arm": rightArm, "Left Arm": leftArm,
  "Right Leg": rightLeg, "Left Leg": leftLeg,
});

const roll: PlannedMotion = {
  name: "MD_PLANNED_R6_02_DiagonalShoulderRoll",
  duration: 0.62,
  priority: "action3",
  intent: "A diagonal shoulder roll that preserves joint pivots, tucks the rigid R6 limbs around the torso and exits through one planted foot",
  tags: ["roll", "forward-roll", "parkour", "continuous-rotation", "diagonal-shoulder"],
  phases: [
    {
      n: 0, name: "approach_load", support: "both",
      centerOfMass: "low and slightly ahead of both feet",
      lineOfAction: "forward diagonal aimed toward the right shoulder",
      torsoPosition: [0, -0.10, -0.03],
      rotation: R([-16, -5, -8], [6, 4, 4], [52, -4, 7], [42, 4, -6], [18, -2, 2], [-12, 2, -2]),
    },
    {
      n: 0.13, name: "hand_shoulder_entry", support: "shoulder",
      centerOfMass: "moving below the shoulder line",
      lineOfAction: "right hand and shoulder guide a diagonal arc across the upper back",
      torsoPosition: [-0.05, -0.42, -0.18],
      rotation: R([-58, -8, -14], [18, 7, 7], [104, -8, 12], [78, 6, -9], [34, -3, 3], [22, 3, -3]),
    },
    {
      n: 0.29, name: "compact_tuck", support: "shoulder",
      centerOfMass: "inside the compact torso-leg shape",
      lineOfAction: "rounded arc from shoulder through hips with limbs folded toward the rotation",
      torsoPosition: [-0.09, -0.82, -0.38],
      rotation: R([-128, -10, -18], [32, 8, 8], [128, -10, 14], [116, 8, -11], [48, -4, 4], [42, 4, -4]),
    },
    {
      n: 0.47, name: "inverted_transfer", support: "shoulder",
      centerOfMass: "directly above the rolling shoulder-back contact",
      lineOfAction: "continuous circular path with hips following the sternum",
      torsoPosition: [-0.11, -1.02, -0.52],
      rotation: R([-202, -9, -16], [40, 7, 7], [122, -8, 12], [126, 8, -12], [50, -3, 4], [48, 3, -4]),
    },
    {
      n: 0.64, name: "hip_uncoil", support: "shoulder",
      centerOfMass: "moving from the back toward the exit foot",
      lineOfAction: "hips open after the shoulders clear the floor",
      torsoPosition: [-0.08, -0.82, -0.54],
      rotation: R([-274, -6, -11], [34, 5, 5], [92, -5, 8], [100, 5, -8], [35, -2, 3], [42, 2, -3]),
    },
    {
      n: 0.80, name: "right_foot_exit", support: "right",
      centerOfMass: "stacking above the right exit foot",
      lineOfAction: "right foot catches the body while the left leg follows",
      torsoPosition: [-0.03, -0.36, -0.34],
      rotation: R([-336, -3, -5], [18, 2, 2], [38, -2, 5], [48, 2, -5], [18, -1, 2], [26, 1, -2]),
    },
    {
      n: 1, name: "running_recovery", support: "right",
      centerOfMass: "forward and stable above the right side",
      lineOfAction: "upright forward diagonal ready to continue moving",
      torsoPosition: [0, -0.10, -0.08],
      rotation: R([-370, 0, 0], [6, 0, 0], [-20, -2, 4], [24, 2, -4], [22, -1, 2], [-26, 1, -2]),
    },
  ],
  contacts: [
    { id: "roll_entry", effector: "Right Arm", target: "ground", start: 0.08, end: 0.17, slide: 0.08 },
    { id: "roll_exit", effector: "Right Leg", target: "ground", start: 0.48, end: 0.62, slide: 0.04 },
  ],
};

const dash: PlannedMotion = {
  name: "MD_PLANNED_R6_03_RightLateralDash",
  duration: 0.34,
  priority: "action3",
  intent: "A fast right lateral dash driven by the left foot, unified into one rightward body line and caught by the right foot",
  tags: ["dash", "lateral", "right", "parkour"],
  phases: [
    {
      n: 0, name: "neutral_read", support: "both",
      centerOfMass: "centered between both feet",
      lineOfAction: "upright neutral line before the direction change",
      torsoPosition: [0, -0.03, 0],
      rotation: R([-3, 0, 0], [1, 0, 0], [4, 0, 3], [4, 0, -3], [2, 0, 1], [2, 0, -1]),
    },
    {
      n: 0.16, name: "left_foot_load", support: "left",
      centerOfMass: "shifted over the left foot, opposite the travel direction",
      lineOfAction: "compressed counter-line preparing a rightward release",
      torsoPosition: [-0.07, -0.12, -0.02],
      rotation: R([-7, -8, -7], [4, 7, 3], [-18, -5, 7], [26, 7, 5], [12, -2, 4], [-18, 3, -5]),
    },
    {
      n: 0.29, name: "rightward_release", support: "left",
      centerOfMass: "crossing outside the left support toward the right",
      lineOfAction: "single rightward diagonal from left push foot through chest and head",
      torsoPosition: [0.06, -0.08, -0.05],
      rotation: R([-10, 9, 18], [5, -7, -8], [-24, -6, 17], [38, 10, 14], [20, -3, 13], [-30, 4, -11]),
    },
    {
      n: 0.48, name: "lateral_flight", support: "flight",
      centerOfMass: "fully projected to the right with both feet free",
      lineOfAction: "long rightward arrow with chest, hips and gaze sharing direction",
      torsoPosition: [0.13, 0.02, -0.06],
      rotation: R([-11, 12, 21], [5, -9, -9], [-28, -7, 20], [42, 12, 17], [24, -4, 17], [-34, 5, -14]),
    },
    {
      n: 0.67, name: "right_foot_catch", support: "right",
      centerOfMass: "arriving above the right foot without collapsing past it",
      lineOfAction: "right foot braces under the projected chest",
      torsoPosition: [0.10, -0.10, -0.05],
      rotation: R([-9, 7, 14], [4, -5, -6], [-18, -4, 13], [30, 8, 11], [16, -2, 10], [-22, 3, -8]),
    },
    {
      n: 0.84, name: "braking_recoil", support: "right",
      centerOfMass: "settling back inside the right support",
      lineOfAction: "short counter-lean prevents a weightless stop",
      torsoPosition: [0.04, -0.08, -0.02],
      rotation: R([-5, 2, 5], [2, -1, -2], [-6, -1, 6], [12, 3, 4], [7, -1, 4], [-8, 1, -3]),
    },
    {
      n: 1, name: "ready_exit", support: "both",
      centerOfMass: "stable between the feet with slight right-side readiness",
      lineOfAction: "compact neutral line ready for locomotion or another action",
      torsoPosition: [0.01, -0.03, 0],
      rotation: R([-3, 0, 1], [1, 0, 0], [3, 0, 3], [5, 0, -3], [2, 0, 1], [1, 0, -1]),
    },
  ],
  contacts: [
    { id: "left_push", effector: "Left Leg", target: "ground", start: 0.025, end: 0.10, slide: 0.025 },
    { id: "right_catch", effector: "Right Leg", target: "ground", start: 0.21, end: 0.30, slide: 0.035 },
  ],
};

const requestedMotion = process.argv[2];
const motions = requestedMotion === "dash" ? [dash] : requestedMotion === "roll" ? [roll] : [roll, dash];
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const n = clamp(value);
  return n * n * (3 - 2 * n);
};
const snap = (value: number) => 1 - Math.pow(1 - clamp(value), 3.2);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function sample(motion: PlannedMotion, n: number): { position: Record<Joint, V3>; rotation: Record<Joint, V3> } {
  let previous = motion.phases[0]!;
  let next = motion.phases[1]!;
  for (let index = 1; index < motion.phases.length; index += 1) {
    next = motion.phases[index]!;
    if (n <= next.n) {
      previous = motion.phases[index - 1]!;
      break;
    }
  }
  const local = (n - previous.n) / Math.max(1e-6, next.n - previous.n);
  const t = next.name.includes("release") || next.name.includes("entry") || next.name.includes("catch")
    ? snap(local)
    : smooth(local);
  const position = Object.fromEntries(joints.map((joint) => [joint, [0, 0, 0] as V3])) as Record<Joint, V3>;
  const rotation = Object.fromEntries(joints.map((joint) => [joint, [0, 0, 0] as V3])) as Record<Joint, V3>;
  position.Torso = previous.torsoPosition.map(
    (value, axis) => mix(value, next.torsoPosition[axis]!, t),
  ) as V3;
  for (const joint of joints) {
    rotation[joint] = previous.rotation[joint].map(
      (value, axis) => mix(value, next.rotation[joint][axis]!, t),
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

function assertPlans(): void {
  for (const motion of motions) {
    if (motion.phases[0]!.n !== 0 || motion.phases.at(-1)!.n !== 1) {
      throw new Error(`${motion.name}: phases must cover the full normalized timeline.`);
    }
    for (let index = 1; index < motion.phases.length; index += 1) {
      if (motion.phases[index]!.n <= motion.phases[index - 1]!.n) {
        throw new Error(`${motion.name}: phase times must increase.`);
      }
    }
  }
  const rollAngles = roll.phases.map((phase) => phase.rotation.Torso[0]);
  if (rollAngles.some((angle, index) => index > 0 && angle >= rollAngles[index - 1]!)) {
    throw new Error("Roll torso rotation must remain continuous in one direction.");
  }
  if (Math.abs(rollAngles.at(-1)! - rollAngles[0]!) < 340) {
    throw new Error("Roll does not complete a full turn.");
  }
  const flight = dash.phases.find((phase) => phase.name === "lateral_flight")!;
  if (flight.rotation.Torso[2] < 16 || flight.rotation["Right Leg"][2] < 12) {
    throw new Error("Dash flight does not form a clear rightward line.");
  }
}
assertPlans();

function draftFor(motion: PlannedMotion): AnimationDraft {
  const fps = 60;
  const frameCount = Math.round(motion.duration * fps);
  return animationDraftSchema.parse({
    name: motion.name,
    rigId: "selection:1",
    duration: motion.duration,
    framesPerSecond: fps,
    looped: false,
    priority: motion.priority,
    beats: motion.phases.slice(0, -1).map((phase, index) => ({
      id: phase.name,
      label: phase.name,
      startTime: phase.n * motion.duration,
      endTime: motion.phases[index + 1]!.n * motion.duration,
      intention: `${phase.centerOfMass}; ${phase.lineOfAction}`,
      energy: phase.support === "flight" ? 0.96 : phase.name.includes("load") ? 0.58 : 0.82,
      leadingBodyPart: phase.support === "right" ? "Right Leg"
        : phase.support === "left" ? "Left Leg"
        : phase.support === "shoulder" ? "Torso"
        : "Torso",
    })),
    contacts: motion.contacts.map((contact) => ({
      id: contact.id,
      effector: contact.effector,
      target: contact.target,
      startTime: contact.start,
      endTime: contact.end,
      positionWeight: 1,
      rotationWeight: 0,
      allowSlideMeters: contact.slide,
    })),
    tracks: joints.map((joint) => ({
      joint,
      space: "parent",
      keys: Array.from({ length: frameCount + 1 }, (_, index) => {
        const n = index / frameCount;
        const pose = sample(motion, n);
        return {
          time: Number((n * motion.duration).toFixed(6)),
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
      intent: motion.intent,
      rigType: "R6",
      style: [
        "r6", "planned-body-mechanics", "parent-space", "fixed-limb-pivots",
        "contact-phases", "center-of-mass-authored", "human-review-required", ...motion.tags,
      ],
      version: 1,
    },
  });
}

const drafts = motions.map(draftFor);
process.stdout.write(`PLANNED_MOTIONS ${drafts.length}\nAPPROVED 0\n${motions.flatMap((motion) => [
  motion.name,
  ...motion.phases.map((phase) => `  ${phase.name}: support=${phase.support}; com=${phase.centerOfMass}; line=${phase.lineOfAction}`),
]).join("\n")}\n`);

const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
const client = new Client({ name: "motion-director-planned-roll-side-dash", version: "0.3.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/src/index.js"],
  cwd: process.cwd(),
  env,
  stderr: "pipe",
});
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function resultText(result: unknown): string {
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
    if ((JSON.parse(resultText(status)) as { connected: boolean }).connected) {
      connected = true;
      break;
    }
    await sleep(500);
  }
  if (!connected) throw new Error("Studio did not connect to Motion Director.");
  for (const draft of drafts) {
    const validation = await client.callTool({ name: "validate_animation_draft", arguments: { draft } });
    if (validation.isError) throw new Error(`${draft.name}: ${resultText(validation)}`);
    process.stdout.write(`VALIDATION ${draft.name}\n${resultText(validation)}\n`);
    const staged = await client.callTool({
      name: "stage_animation_draft",
      arguments: { transactionName: `Planned R6 - ${draft.name}`, draft },
    });
    if (staged.isError) throw new Error(`${draft.name}: ${resultText(staged)}`);
    const transactionId = (JSON.parse(resultText(staged)) as { transactionId: string }).transactionId;
    const committed = await client.callTool({
      name: "commit_animation_draft",
      arguments: { transactionId, destinationName: draft.name },
    });
    if (committed.isError) throw new Error(`${draft.name}: ${resultText(committed)}`);
  }
  const attached = await client.callTool({
    name: "attach_committed_animations_to_selected_rig_animsaves",
    arguments: { namePrefix: requestedMotion === "dash" ? "MD_PLANNED_R6_03_" : requestedMotion === "roll" ? "MD_PLANNED_R6_02_" : "MD_PLANNED_R6_" },
  });
  if (attached.isError) throw new Error(resultText(attached));
  process.stdout.write(`ATTACHED\n${resultText(attached)}\n`);
} finally {
  await client.close();
}
