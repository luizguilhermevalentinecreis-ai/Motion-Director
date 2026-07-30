import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { AnimationDraft } from "../src/domain.js";

type Rotation = [number, number, number];
type Position = { x: number; y: number; z: number };
type Pose = Partial<Record<Joint, Rotation>>;
type Cue = {
  t: number;
  pose: Pose;
  root?: Position;
  easing?: "linear" | "constant" | "cubic" | "cubicV2";
  direction?: "in" | "out" | "inOut";
};

const joints = [
  "LowerTorso", "UpperTorso", "Head",
  "RightUpperArm", "RightLowerArm", "RightHand",
  "LeftUpperArm", "LeftLowerArm", "LeftHand",
  "RightUpperLeg", "RightLowerLeg", "RightFoot",
  "LeftUpperLeg", "LeftLowerLeg", "LeftFoot",
] as const;
type Joint = (typeof joints)[number];

const neutral: Record<Joint, Rotation> = {
  LowerTorso: [0, 0, 0], UpperTorso: [0, 0, 0], Head: [0, 0, 0],
  RightUpperArm: [4, -2, -5], RightLowerArm: [5, 0, 0], RightHand: [0, 0, 0],
  LeftUpperArm: [4, 2, 5], LeftLowerArm: [5, 0, 0], LeftHand: [0, 0, 0],
  RightUpperLeg: [0, 0, 0], RightLowerLeg: [0, 0, 0], RightFoot: [0, 0, 0],
  LeftUpperLeg: [0, 0, 0], LeftLowerLeg: [0, 0, 0], LeftFoot: [0, 0, 0],
};

const merge = (...poses: Pose[]): Pose => Object.assign({}, ...poses);
const root = (y = 0, x = 0, z = 0): Position => ({ x, y, z });

function mirror(source: Pose): Pose {
  const result: Pose = {};
  for (const [name, rotation] of Object.entries(source) as [Joint, Rotation][]) {
    const mirroredName = name.startsWith("Left")
      ? (`Right${name.slice(4)}` as Joint)
      : name.startsWith("Right")
        ? (`Left${name.slice(5)}` as Joint)
        : name;
    result[mirroredName] = [rotation[0], -rotation[1], -rotation[2]];
  }
  return result;
}

const walkContact: Pose = {
  LowerTorso: [3, -5, 1], UpperTorso: [-2, 7, -2], Head: [-1, -2, 1],
  RightUpperArm: [-30, -4, -7], RightLowerArm: [18, 0, 0],
  LeftUpperArm: [28, 5, 8], LeftLowerArm: [20, 0, 0],
  RightUpperLeg: [30, -2, 2], RightLowerLeg: [-8, 0, 0], RightFoot: [-8, 0, 0],
  LeftUpperLeg: [-26, 2, -2], LeftLowerLeg: [-35, 0, 0], LeftFoot: [12, 0, 0],
};
const walkPass: Pose = {
  LowerTorso: [4, 0, 0], UpperTorso: [-3, 0, 0],
  RightUpperArm: [-3, -2, -5], RightLowerArm: [22, 0, 0],
  LeftUpperArm: [3, 2, 5], LeftLowerArm: [22, 0, 0],
  RightUpperLeg: [4, 0, 0], RightLowerLeg: [-42, 0, 0], RightFoot: [18, 0, 0],
  LeftUpperLeg: [-8, 0, 0], LeftLowerLeg: [-12, 0, 0], LeftFoot: [4, 0, 0],
};
const runContact: Pose = {
  LowerTorso: [15, -8, 2], UpperTorso: [-8, 10, -3], Head: [-4, -3, 1],
  RightUpperArm: [-52, -7, -12], RightLowerArm: [55, 0, 0],
  LeftUpperArm: [48, 8, 13], LeftLowerArm: [62, 0, 0],
  RightUpperLeg: [48, -3, 5], RightLowerLeg: [-18, 0, 0], RightFoot: [-14, 0, 0],
  LeftUpperLeg: [-38, 3, -5], LeftLowerLeg: [-65, 0, 0], LeftFoot: [24, 0, 0],
};
const runPass: Pose = {
  LowerTorso: [18, 0, 0], UpperTorso: [-10, 0, 0], Head: [-5, 0, 0],
  RightUpperArm: [-12, -5, -9], RightLowerArm: [68, 0, 0],
  LeftUpperArm: [10, 5, 9], LeftLowerArm: [68, 0, 0],
  RightUpperLeg: [12, 0, 0], RightLowerLeg: [-72, 0, 0], RightFoot: [28, 0, 0],
  LeftUpperLeg: [-16, 0, 0], LeftLowerLeg: [-20, 0, 0], LeftFoot: [8, 0, 0],
};
const sprintContact: Pose = merge(runContact, {
  LowerTorso: [28, -10, 2], UpperTorso: [-15, 14, -4], Head: [-8, -4, 1],
  RightUpperArm: [-70, -9, -15], LeftUpperArm: [62, 10, 16],
  RightUpperLeg: [62, -4, 6], LeftUpperLeg: [-48, 4, -6],
});
const sprintPass: Pose = merge(runPass, {
  LowerTorso: [30, 0, 0], UpperTorso: [-16, 0, 0], Head: [-9, 0, 0],
  RightLowerLeg: [-86, 0, 0], LeftLowerLeg: [-24, 0, 0],
});
const dashCoil: Pose = {
  LowerTorso: [38, 0, 0], UpperTorso: [-20, 0, 0], Head: [10, 0, 0],
  RightUpperArm: [-58, -10, -18], LeftUpperArm: [-58, 10, 18],
  RightLowerArm: [25, 0, 0], LeftLowerArm: [25, 0, 0],
  RightUpperLeg: [34, -5, 8], RightLowerLeg: [-92, 0, 0], RightFoot: [26, 0, 0],
  LeftUpperLeg: [30, 5, -8], LeftLowerLeg: [-98, 0, 0], LeftFoot: [28, 0, 0],
};
const dashLine: Pose = merge(dashCoil, {
  LowerTorso: [52, 0, 0], UpperTorso: [-27, 0, 0], Head: [15, 0, 0],
  RightUpperArm: [-82, -7, -13], LeftUpperArm: [-82, 7, 13],
  RightLowerLeg: [-52, 0, 0], LeftLowerLeg: [-55, 0, 0],
});
const jumpCoil: Pose = {
  LowerTorso: [30, 0, 0], UpperTorso: [-17, 0, 0], Head: [10, 0, 0],
  RightUpperArm: [-35, -12, -20], LeftUpperArm: [-35, 12, 20],
  RightUpperLeg: [30, -7, 10], LeftUpperLeg: [32, 7, -10],
  RightLowerLeg: [-108, 0, 0], LeftLowerLeg: [-108, 0, 0],
  RightFoot: [30, 0, 0], LeftFoot: [30, 0, 0],
};
const jumpExtend: Pose = {
  LowerTorso: [-8, 0, 0], UpperTorso: [8, 0, 0], Head: [-5, 0, 0],
  RightUpperArm: [42, -14, -24], LeftUpperArm: [42, 14, 24],
  RightLowerArm: [12, 0, 0], LeftLowerArm: [12, 0, 0],
  RightUpperLeg: [-15, -4, 6], LeftUpperLeg: [-12, 4, -6],
  RightLowerLeg: [-20, 0, 0], LeftLowerLeg: [-18, 0, 0],
  RightFoot: [-15, 0, 0], LeftFoot: [-15, 0, 0],
};
const fallPose: Pose = {
  LowerTorso: [8, 0, 0], UpperTorso: [-4, 0, 0], Head: [-8, 0, 0],
  RightUpperArm: [62, -20, -36], LeftUpperArm: [62, 20, 36],
  RightLowerArm: [48, 0, 0], LeftLowerArm: [48, 0, 0],
  RightUpperLeg: [22, -8, 12], LeftUpperLeg: [-10, 8, -12],
  RightLowerLeg: [-52, 0, 0], LeftLowerLeg: [-28, 0, 0],
  RightFoot: [12, 0, 0], LeftFoot: [8, 0, 0],
};
const landing: Pose = merge(jumpCoil, {
  LowerTorso: [42, 0, 0], UpperTorso: [-26, 0, 0], Head: [18, 0, 0],
  RightUpperArm: [-55, -16, -28], LeftUpperArm: [-55, 16, 28],
});
const wallLeft: Pose = {
  LowerTorso: [16, -8, -24], UpperTorso: [-8, 12, 28], Head: [-5, 16, 8],
  LeftUpperArm: [105, -28, 58], LeftLowerArm: [68, 0, 0], LeftHand: [-12, 0, 10],
  RightUpperArm: [-48, -12, -18], RightLowerArm: [55, 0, 0],
  LeftUpperLeg: [42, 16, -20], LeftLowerLeg: [-78, 0, 0], LeftFoot: [28, 0, -10],
  RightUpperLeg: [-35, -7, 10], RightLowerLeg: [-35, 0, 0], RightFoot: [12, 0, 0],
};
const climbReach: Pose = {
  LowerTorso: [12, -8, 0], UpperTorso: [-8, 12, 0], Head: [-10, 6, 0],
  RightUpperArm: [152, -12, -16], RightLowerArm: [18, 0, 0], RightHand: [-12, 0, 0],
  LeftUpperArm: [108, 12, 18], LeftLowerArm: [76, 0, 0], LeftHand: [-10, 0, 0],
  RightUpperLeg: [38, -5, 7], RightLowerLeg: [-92, 0, 0], RightFoot: [30, 0, 0],
  LeftUpperLeg: [-18, 5, -7], LeftLowerLeg: [-48, 0, 0], LeftFoot: [18, 0, 0],
};
const vaultPlant: Pose = {
  LowerTorso: [42, -18, 12], UpperTorso: [-22, 22, -10], Head: [14, -10, 2],
  RightUpperArm: [120, -18, -24], RightLowerArm: [18, 0, 0],
  LeftUpperArm: [116, 18, 24], LeftLowerArm: [20, 0, 0],
  RightUpperLeg: [75, -12, 20], RightLowerLeg: [-105, 0, 0],
  LeftUpperLeg: [58, 10, -18], LeftLowerLeg: [-85, 0, 0],
};
const slide: Pose = {
  LowerTorso: [58, -12, -8], UpperTorso: [-30, 18, 8], Head: [20, -8, -2],
  RightUpperArm: [-62, -18, -28], LeftUpperArm: [34, 18, 30],
  RightLowerArm: [25, 0, 0], LeftLowerArm: [64, 0, 0],
  RightUpperLeg: [82, -8, 14], RightLowerLeg: [-18, 0, 0], RightFoot: [-12, 0, 0],
  LeftUpperLeg: [25, 8, -14], LeftLowerLeg: [-118, 0, 0], LeftFoot: [32, 0, 0],
};

const q = (angles: Rotation) => {
  const converted = angles.map((value) => (value * Math.PI) / 360);
  const x = converted[0]!;
  const y = converted[1]!;
  const z = converted[2]!;
  const cx = Math.cos(x), sx = Math.sin(x);
  const cy = Math.cos(y), sy = Math.sin(y);
  const cz = Math.cos(z), sz = Math.sin(z);
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };
};

function makeClip(
  name: string,
  duration: number,
  looped: boolean,
  priority: AnimationDraft["priority"],
  cues: Cue[],
  intent: string,
  contacts: AnimationDraft["contacts"] = [],
): AnimationDraft {
  return {
    name,
    rigId: "selection:1",
    duration,
    framesPerSecond: 60,
    looped,
    priority,
    beats: [{
      id: "performance",
      label: name,
      startTime: 0,
      endTime: duration,
      intention: intent,
      energy: priority === "movement" ? 0.72 : 0.92,
      leadingBodyPart: "LowerTorso",
    }],
    contacts,
    tracks: joints.map((joint) => ({
      joint,
      // Pose.CFrame is the animated Transform offset. Supplying it directly
      // avoids applying the AnimationConstraint attachment basis twice.
      space: "motor" as const,
      keys: cues.map((cue) => ({
        time: cue.t,
        transform: {
          // Locomotion is strictly in-place. The character controller owns
          // world/root translation, preventing sinking and double movement.
          position: root(),
          rotation: q((merge(neutral, cue.pose) as Record<Joint, Rotation>)[joint]),
        },
        easing: {
          style: cue.easing ?? "linear",
          direction: cue.direction ?? "inOut",
        },
        weight: 1,
      })),
    })),
    metadata: {
      intent,
      rigType: "R15",
      style: ["parkour", "gameplay-ready", "force-driven", looped ? "seamless-loop" : "action-clip"],
      version: 1,
    },
  };
}

const groundContact = (id: string, foot: "Left" | "Right", startTime: number, endTime: number) => ({
  id,
  effector: `${foot}FootAttachment`,
  target: "Ground",
  startTime,
  endTime,
  positionWeight: 1,
  rotationWeight: 0.85,
  allowSlideMeters: 0.015,
});

const alternating = (a: Pose, pass: Pose, duration: number): Cue[] => [
  { t: 0, pose: a, root: root(0) },
  { t: duration * 0.125, pose: merge(a, { LowerTorso: [6, -2, 0] }), root: root(-0.04) },
  { t: duration * 0.25, pose: pass, root: root(0.06) },
  { t: duration * 0.375, pose: merge(mirror(a), { LowerTorso: [6, 2, 0] }), root: root(-0.02) },
  { t: duration * 0.5, pose: mirror(a), root: root(0) },
  { t: duration * 0.625, pose: merge(mirror(a), { LowerTorso: [6, 2, 0] }), root: root(-0.04) },
  { t: duration * 0.75, pose: mirror(pass), root: root(0.06) },
  { t: duration * 0.875, pose: merge(a, { LowerTorso: [6, -2, 0] }), root: root(-0.02) },
  { t: duration, pose: a, root: root(0) },
];

const clips: AnimationDraft[] = [
  makeClip("MD_ParkourV2_Walk", 1, true, "movement", alternating(walkContact, walkPass, 1), "Controlled heel-to-toe walk with planted contacts and restrained counter-rotation", [
    groundContact("right-contact", "Right", 0, 0.18), groundContact("left-contact", "Left", 0.5, 0.68),
  ]),
  makeClip("MD_ParkourV2_Run", 0.64, true, "movement", alternating(runContact, runPass, 0.64), "Athletic run cycle driven from hips with compact airborne passing positions"),
  makeClip("MD_ParkourV2_Sprint", 0.5, true, "movement", alternating(sprintContact, sprintPass, 0.5), "Maximum-speed sprint with aggressive forward line and forceful arm drive"),
  makeClip("MD_ParkourV2_DashForward", 0.42, false, "action3", [
    { t: 0, pose: runContact }, { t: 0.07, pose: dashCoil, root: root(-0.12), easing: "cubic", direction: "in" },
    { t: 0.12, pose: dashLine, root: root(0.03) }, { t: 0.26, pose: dashLine, root: root(0.02), easing: "constant" },
    { t: 0.32, pose: sprintPass, root: root(-0.04) }, { t: 0.42, pose: runContact },
  ], "Six-frame explosive forward dash with a compressed launch and stable aerodynamic silhouette"),
  makeClip("MD_ParkourV2_DashLeft", 0.38, false, "action3", [
    { t: 0, pose: neutral }, { t: 0.06, pose: merge(dashCoil, { LowerTorso: [34, 12, -28] }), root: root(-0.1) },
    { t: 0.11, pose: merge(dashLine, { LowerTorso: [42, 18, -36], UpperTorso: [-20, -10, 28] }) },
    { t: 0.25, pose: merge(dashLine, { LowerTorso: [42, 18, -36], UpperTorso: [-20, -10, 28] }), easing: "constant" },
    { t: 0.38, pose: neutral },
  ], "Low lateral evasive dash led by the hips while the chest counters to preserve balance"),
  makeClip("MD_ParkourV2_DashRight", 0.38, false, "action3", [
    { t: 0, pose: neutral }, { t: 0.06, pose: mirror(merge(dashCoil, { LowerTorso: [34, 12, -28] })), root: root(-0.1) },
    { t: 0.11, pose: mirror(merge(dashLine, { LowerTorso: [42, 18, -36], UpperTorso: [-20, -10, 28] })) },
    { t: 0.25, pose: mirror(merge(dashLine, { LowerTorso: [42, 18, -36], UpperTorso: [-20, -10, 28] })), easing: "constant" },
    { t: 0.38, pose: neutral },
  ], "Mirrored low lateral evasive dash with a planted recovery"),
  makeClip("MD_ParkourV2_WallRunLeft", 0.72, true, "movement", alternating(wallLeft, merge(wallLeft, runPass), 0.72), "Left-side wallrun with the inside hand tracking the wall and legs cycling under lateral compression"),
  makeClip("MD_ParkourV2_WallRunRight", 0.72, true, "movement", alternating(mirror(wallLeft), mirror(merge(wallLeft, runPass)), 0.72), "Right-side wallrun mirrored anatomically with stable wall-facing shoulders"),
  makeClip("MD_ParkourV2_JumpStart", 0.48, false, "action2", [
    { t: 0, pose: runContact }, { t: 0.11, pose: jumpCoil, root: root(-0.28), easing: "cubic", direction: "in" },
    { t: 0.16, pose: jumpCoil, root: root(-0.32), easing: "constant" },
    { t: 0.23, pose: jumpExtend, root: root(0.1) }, { t: 0.34, pose: jumpExtend, root: root(0.18) },
    { t: 0.48, pose: merge(jumpExtend, fallPose), root: root(0.12) },
  ], "Compressed takeoff followed by a sharp triple extension through hips knees and ankles"),
  makeClip("MD_ParkourV2_FallLoop", 0.8, true, "movement", [
    { t: 0, pose: fallPose }, { t: 0.2, pose: merge(fallPose, { UpperTorso: [-7, 5, -3], Head: [-5, -4, 2] }) },
    { t: 0.4, pose: mirror(fallPose) }, { t: 0.6, pose: merge(mirror(fallPose), { UpperTorso: [-7, -5, 3], Head: [-5, 4, -2] }) },
    { t: 0.8, pose: fallPose },
  ], "Controlled airborne fall with subtle asymmetry and limbs prepared for impact"),
  makeClip("MD_ParkourV2_Land", 0.46, false, "action3", [
    { t: 0, pose: fallPose, root: root(0.12) }, { t: 0.08, pose: landing, root: root(-0.3) },
    { t: 0.13, pose: landing, root: root(-0.36), easing: "constant" },
    { t: 0.22, pose: merge(landing, { LowerTorso: [34, 0, 0] }), root: root(-0.25) },
    { t: 0.34, pose: runPass, root: root(-0.08) }, { t: 0.46, pose: neutral },
  ], "Hard landing that absorbs force through ankles knees hips and spine before recovery"),
  makeClip("MD_ParkourV2_ClimbLoop", 1.04, true, "movement", alternating(climbReach, mirror(climbReach), 1.04), "Hand-over-hand vertical climb with opposing knee drive and alternating torso torque"),
  makeClip("MD_ParkourV2_Vault", 0.72, false, "action3", [
    { t: 0, pose: sprintContact }, { t: 0.1, pose: vaultPlant, root: root(-0.08) },
    { t: 0.18, pose: vaultPlant, root: root(0.12), easing: "constant" },
    { t: 0.27, pose: merge(vaultPlant, { RightUpperLeg: [105, -18, 28], LeftUpperLeg: [90, 14, -24] }), root: root(0.32) },
    { t: 0.4, pose: jumpExtend, root: root(0.4) }, { t: 0.54, pose: fallPose, root: root(0.16) },
    { t: 0.64, pose: landing, root: root(-0.15) }, { t: 0.72, pose: runContact },
  ], "Two-hand speed vault with a readable plant hip clearance flight and running exit"),
  makeClip("MD_ParkourV2_Slide", 0.82, false, "action3", [
    { t: 0, pose: sprintContact }, { t: 0.1, pose: merge(slide, { LowerTorso: [44, -8, -5] }), root: root(-0.18) },
    { t: 0.18, pose: slide, root: root(-0.42) }, { t: 0.55, pose: slide, root: root(-0.45), easing: "constant" },
    { t: 0.66, pose: landing, root: root(-0.3) }, { t: 0.74, pose: sprintPass, root: root(-0.1) },
    { t: 0.82, pose: runContact },
  ], "Low momentum-preserving slide with one extended leg and a fast running recovery"),
  makeClip("MD_ParkourV2_LedgeGrab", 0.48, false, "action4", [
    { t: 0, pose: jumpExtend, root: root(0.15) },
    { t: 0.1, pose: merge(climbReach, mirror(climbReach), { RightUpperArm: [154, -10, -12], LeftUpperArm: [154, 10, 12] }), root: root(0.25) },
    { t: 0.15, pose: merge(climbReach, mirror(climbReach), { RightUpperArm: [154, -10, -12], LeftUpperArm: [154, 10, 12] }), root: root(0.12), easing: "constant" },
    { t: 0.25, pose: merge(fallPose, { RightUpperArm: [150, -10, -12], LeftUpperArm: [150, 10, 12], RightLowerArm: [24, 0, 0], LeftLowerArm: [24, 0, 0] }), root: root(-0.05) },
    { t: 0.48, pose: merge(fallPose, { RightUpperArm: [150, -10, -12], LeftUpperArm: [150, 10, 12] }), root: root(-0.08) },
  ], "Two-hand ledge catch with a one-frame contact accent and pendulum force absorption"),
  makeClip("MD_ParkourV2_Mantle", 0.9, false, "action3", [
    { t: 0, pose: merge(fallPose, { RightUpperArm: [150, -10, -12], LeftUpperArm: [150, 10, 12] }), root: root(-0.08) },
    { t: 0.14, pose: merge(vaultPlant, { RightUpperArm: [132, -10, -12], LeftUpperArm: [132, 10, 12] }), root: root(0.02) },
    { t: 0.28, pose: vaultPlant, root: root(0.25) }, { t: 0.42, pose: merge(vaultPlant, jumpCoil), root: root(0.42) },
    { t: 0.56, pose: landing, root: root(0.3) }, { t: 0.7, pose: runPass, root: root(0.08) },
    { t: 0.9, pose: neutral },
  ], "Power mantle driven by lat pull elbow extension hip rise and a controlled top-out"),
];

const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const client = new Client({ name: "motion-director-parkour-suite", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/src/index.js"],
  cwd: process.cwd(),
  env: environment,
  stderr: "pipe",
});
const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const textResult = (result: unknown) => {
  const content = result && typeof result === "object" && "content" in result
    ? (result as { content?: unknown }).content : undefined;
  if (!Array.isArray(content)) return "";
  const block = content.find((item) =>
    item && typeof item === "object" && "type" in item && item.type === "text" &&
    "text" in item && typeof item.text === "string",
  ) as { text?: string } | undefined;
  return block?.text ?? "";
};

try {
  await client.connect(transport);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const status = await client.callTool({ name: "studio_status", arguments: {} });
    if ((JSON.parse(textResult(status)) as { connected: boolean }).connected) break;
    await sleep(500);
  }

  const committed: Array<{ name: string; keys: number }> = [];
  for (const draft of clips) {
    const validation = await client.callTool({
      name: "validate_animation_draft",
      arguments: { draft },
    });
    if (validation.isError) throw new Error(`${draft.name}: ${textResult(validation)}`);

    const staged = await client.callTool({
      name: "stage_animation_draft",
      arguments: { transactionName: `Parkour Suite - ${draft.name}`, draft },
    });
    if (staged.isError) throw new Error(`${draft.name}: ${textResult(staged)}`);
    const stagedData = JSON.parse(textResult(staged)) as {
      transactionId: string;
      keyframeCount: number;
    };

    const result = await client.callTool({
      name: "commit_animation_draft",
      arguments: {
        transactionId: stagedData.transactionId,
        destinationName: draft.name,
      },
    });
    if (result.isError) throw new Error(`${draft.name}: ${textResult(result)}`);
    committed.push({ name: draft.name, keys: stagedData.keyframeCount });
    process.stdout.write(`COMMITTED ${draft.name} (${stagedData.keyframeCount} keyframes)\n`);
  }
  process.stdout.write(`${JSON.stringify({ count: committed.length, committed }, null, 2)}\n`);
} finally {
  await client.close();
}
