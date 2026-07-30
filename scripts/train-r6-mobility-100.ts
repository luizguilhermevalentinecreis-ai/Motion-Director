import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { animationDraftSchema, type AnimationDraft, type QualityReport } from "../src/domain.js";
import { reviewDraft } from "../src/quality.js";

type Rotation = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type Family =
  | "dash_forward" | "dash_backward" | "dash_left" | "dash_right"
  | "power_slide" | "forward_roll" | "side_roll"
  | "jump_takeoff" | "hard_land" | "wall_jump";
type Frame = {
  n: number;
  root: [number, number, number];
  rotations: Record<Joint, Rotation>;
};
type Candidate = { family: Family; draft: AnimationDraft; report: QualityReport; score: number };

const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const families: Family[] = [
  "dash_forward", "dash_backward", "dash_left", "dash_right",
  "power_slide", "forward_roll", "side_roll",
  "jump_takeoff", "hard_land", "wall_jump",
];
const labels: Record<Family, string> = {
  dash_forward: "DashForward",
  dash_backward: "DashBackward",
  dash_left: "DashLeft",
  dash_right: "DashRight",
  power_slide: "PowerSlide",
  forward_roll: "ForwardRoll",
  side_roll: "SideRoll",
  jump_takeoff: "JumpTakeoff",
  hard_land: "HardLand",
  wall_jump: "WallJump",
};

function random(index: number, salt: number): number {
  const value = Math.sin((index + 1) * (15.731 + salt * 19.913)) * 53791.378;
  return value - Math.floor(value);
}
function zero(): Rotation { return [0, 0, 0]; }
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
function pose(
  n: number, torso: Rotation, head: Rotation,
  rightArm: Rotation, leftArm: Rotation,
  rightLeg: Rotation, leftLeg: Rotation,
  root: [number, number, number] = [0, 0, 0],
): Frame {
  return {
    n, root,
    rotations: {
      Torso: torso, Head: head,
      "Right Arm": rightArm, "Left Arm": leftArm,
      "Right Leg": rightLeg, "Left Leg": leftLeg,
    },
  };
}
function makeDraft(
  name: string,
  duration: number,
  style: string[],
  frames: Frame[],
  contacts: AnimationDraft["contacts"] = [],
): AnimationDraft {
  return animationDraftSchema.parse({
    name,
    rigId: "selection:1",
    duration,
    framesPerSecond: 30,
    looped: false,
    priority: "action",
    beats: [
      { id: "anticipation", label: "Anticipation", startTime: 0, endTime: duration * 0.18, intention: "Load only enough to make the action readable", energy: 0.62, leadingBodyPart: "Torso" },
      { id: "burst", label: "Burst", startTime: duration * 0.18, endTime: duration * 0.72, intention: "Commit the complete R6 silhouette to one travel direction", energy: 1, leadingBodyPart: "Torso" },
      { id: "recovery", label: "Recovery", startTime: duration * 0.72, endTime: duration, intention: "Recover control without dissolving the impact", energy: 0.58, leadingBodyPart: "Torso" },
    ],
    contacts,
    tracks: joints.map((joint) => ({
      joint,
      space: "parent",
      keys: frames.map((frame) => ({
        time: Number((frame.n * duration).toFixed(6)),
        transform: {
          position: joint === "Torso"
            ? { x: frame.root[0], y: frame.root[1], z: frame.root[2] }
            : { x: 0, y: 0, z: 0 },
          rotation: quaternion(frame.rotations[joint]),
        },
        easing: { style: "cubicV2", direction: "inOut" },
        weight: 1,
      })),
    })),
    metadata: {
      intent: `Temporary R6 mobility candidate: ${style.join(" ")}`,
      rigType: "R6",
      style: ["r6", "training-candidate", "anime-mobility", ...style],
      version: 1,
    },
  });
}

function dash(family: Extract<Family, "dash_forward" | "dash_backward" | "dash_left" | "dash_right">, index: number) {
  const duration = 0.3 + random(index, 1) * 0.1;
  if (family === "dash_forward") {
    const lean = 36 + random(index, 2) * 10;
    const arm = 76 + random(index, 3) * 16;
    return makeDraft(`Attempt_Mobility_${family}_${index}`, duration, ["dash", "forward", "arrow-silhouette"], [
      pose(0, zero(), zero(), zero(), zero(), zero(), zero()),
      pose(0.1, [5, 0, 0], [-4, 0, 0], [-18, 0, -3], [-18, 0, 3], [15, 0, -1], [13, 0, 1], [0, -0.05, 0.02]),
      pose(0.24, [-lean * 0.82, -2, -1], [lean * 0.58, 2, 1], [arm * 0.9, 0, -9], [arm * 0.9, 0, 9], [-54, 0, -3], [-34, 0, 3], [0, -0.12, -0.12]),
      pose(0.42, [-lean, -3, -2], [lean * 0.7, 3, 2], [arm, 0, -12], [arm, 0, 12], [-64, 0, -4], [-42, 0, 4], [0, -0.14, -0.21]),
      pose(0.62, [-lean * 0.9, 3, 2], [lean * 0.64, -3, -2], [arm * 0.94, 0, -10], [arm * 0.94, 0, 10], [-40, 0, -3], [-60, 0, 3], [0, -0.12, -0.18]),
      pose(0.82, [-18, 1, 1], [12, -1, -1], [44, 0, -6], [44, 0, 6], [-24, 0, -2], [-32, 0, 2], [0, -0.07, -0.07]),
      pose(1, zero(), zero(), zero(), zero(), zero(), zero()),
    ]);
  }
  if (family === "dash_backward") {
    const lean = 13 + random(index, 4) * 7;
    return makeDraft(`Attempt_Mobility_${family}_${index}`, duration, ["dash", "backward", "evade"], [
      pose(0, zero(), zero(), zero(), zero(), zero(), zero()),
      pose(0.12, [-5, 0, 0], [4, 0, 0], [20, 0, -3], [20, 0, 3], [-16, 0, -1], [-16, 0, 1], [0, -0.04, -0.02]),
      pose(0.28, [lean, -2, 1], [-lean * 0.75, 2, -1], [-48, 0, -8], [-48, 0, 8], [44, 0, -3], [30, 0, 3], [0, -0.1, 0.08]),
      pose(0.48, [lean * 1.2, -4, 2], [-lean * 0.85, 4, -2], [-58, 0, -10], [-58, 0, 10], [52, 0, -4], [38, 0, 4], [0, -0.11, 0.14]),
      pose(0.68, [lean, 4, -2], [-lean * 0.7, -4, 2], [-46, 0, -8], [-46, 0, 8], [34, 0, -3], [48, 0, 3], [0, -0.08, 0.1]),
      pose(0.84, [7, 1, 0], [-5, -1, 0], [-24, 0, -4], [-24, 0, 4], [18, 0, -2], [22, 0, 2], [0, -0.04, 0.04]),
      pose(1, zero(), zero(), zero(), zero(), zero(), zero()),
    ]);
  }
  const left = family === "dash_left";
  const sign = left ? -1 : 1;
  const bank = 18 + random(index, 5) * 8;
  return makeDraft(`Attempt_Mobility_${family}_${index}`, duration, ["dash", left ? "left" : "right", "sidestep"], [
    pose(0, zero(), zero(), zero(), zero(), zero(), zero()),
    pose(0.12, [0, -sign * 5, -sign * 4], [0, sign * 5, sign * 3], [-sign * 12, 0, -sign * 5], [sign * 12, 0, sign * 5], [sign * 10, 0, -sign * 4], [-sign * 10, 0, sign * 4], [-sign * 0.02, -0.03, 0]),
    pose(0.28, [-5, sign * 14, sign * bank * 0.8], [4, -sign * 12, -sign * bank * 0.6], [-sign * 40, 0, -sign * 18], [sign * 46, 0, sign * 18], [sign * 42, 0, -sign * 10], [-sign * 36, 0, sign * 10], [sign * 0.08, -0.09, 0]),
    pose(0.48, [-7, sign * 20, sign * bank], [5, -sign * 17, -sign * bank * 0.75], [-sign * 50, 0, -sign * 24], [sign * 55, 0, sign * 24], [sign * 52, 0, -sign * 14], [-sign * 44, 0, sign * 14], [sign * 0.13, -0.08, 0]),
    pose(0.68, [-5, sign * 13, sign * bank * 0.68], [4, -sign * 11, -sign * bank * 0.5], [sign * 34, 0, -sign * 16], [-sign * 30, 0, sign * 16], [-sign * 34, 0, -sign * 9], [sign * 30, 0, sign * 9], [sign * 0.09, -0.055, 0]),
    pose(0.85, [-2, sign * 5, sign * 6], [2, -sign * 4, -sign * 4], [sign * 14, 0, -sign * 6], [-sign * 12, 0, sign * 6], [-sign * 14, 0, -sign * 4], [sign * 12, 0, sign * 4], [sign * 0.03, -0.025, 0]),
    pose(1, zero(), zero(), zero(), zero(), zero(), zero()),
  ]);
}

function roll(family: "forward_roll" | "side_roll", index: number) {
  const side = family === "side_roll";
  const duration = (side ? 0.72 : 0.78) * (0.92 + random(index, 11) * 0.16);
  const sign = side && random(index, 12) > 0.5 ? -1 : 1;
  const angles = [0, 18, 58, 112, 172, 228, 286, 334, 360];
  const frames = angles.map((angle, frameIndex) => {
    const rotation: Rotation = side ? [0, 0, angle * sign] : [-angle, 0, 0];
    const tuck = frameIndex === 0 || frameIndex === angles.length - 1 ? 0 : 70 + random(index, 13) * 18;
    return pose(
      frameIndex / (angles.length - 1),
      rotation,
      side ? [0, 0, -sign * Math.min(18, angle * 0.06)] : [Math.min(16, angle * 0.05), 0, 0],
      [-42, 0, -sign * 8], [-42, 0, sign * 8],
      [tuck, 0, -sign * 5], [tuck, 0, sign * 5],
      [side ? sign * Math.sin(frameIndex / 8 * Math.PI) * 0.08 : 0, -Math.sin(frameIndex / 8 * Math.PI) * 0.16, side ? 0 : -Math.sin(frameIndex / 8 * Math.PI) * 0.08],
    );
  });
  frames[0] = pose(0, zero(), zero(), zero(), zero(), zero(), zero());
  frames[frames.length - 1] = pose(1, side ? [0, 0, 360 * sign] : [-360, 0, 0], zero(), zero(), zero(), zero(), zero());
  return makeDraft(`Attempt_Mobility_${family}_${index}`, duration, [side ? "side-roll" : "forward-roll", "compact"], frames);
}

function utility(family: Exclude<Family, "dash_forward" | "dash_backward" | "dash_left" | "dash_right" | "forward_roll" | "side_roll">, index: number) {
  if (family === "power_slide") {
    const duration = 0.58 + random(index, 21) * 0.16;
    return makeDraft(`Attempt_Mobility_${family}_${index}`, duration, ["power-slide", "braking"], [
      pose(0, [-8, -3, -2], [6, 3, 2], [-48, 0, -6], [48, 0, 6], [52, 0, -3], [-52, 0, 3]),
      pose(0.18, [-12, 4, 3], [8, -4, -3], [34, 0, -10], [18, 0, 12], [24, 0, -8], [58, 0, 8], [0, -0.12, 0.04]),
      pose(0.38, [-16, 8, 5], [11, -8, -5], [42, 0, -14], [24, 0, 16], [18, 0, -12], [68, 0, 12], [0, -0.28, 0.08]),
      pose(0.62, [-13, -5, -4], [9, 5, 4], [28, 0, -10], [38, 0, 12], [58, 0, -9], [22, 0, 9], [0, -0.25, 0.06]),
      pose(0.82, [-6, 0, 0], [4, 0, 0], [14, 0, -5], [14, 0, 5], [22, 0, -4], [16, 0, 4], [0, -0.1, 0.02]),
      pose(1, zero(), zero(), zero(), zero(), zero(), zero()),
    ]);
  }
  if (family === "jump_takeoff") {
    const duration = 0.42 + random(index, 22) * 0.1;
    return makeDraft(`Attempt_Mobility_${family}_${index}`, duration, ["jump-takeoff", "vertical"], [
      pose(0, zero(), zero(), zero(), zero(), zero(), zero()),
      pose(0.18, [8, 0, 0], [-6, 0, 0], [45, 0, -5], [45, 0, 5], [20, 0, -3], [20, 0, 3], [0, -0.18, 0.02]),
      pose(0.34, [12, 0, 0], [-8, 0, 0], [70, 0, -7], [70, 0, 7], [28, 0, -4], [28, 0, 4], [0, -0.24, 0.03]),
      pose(0.5, [-5, 0, 0], [4, 0, 0], [-118, 0, -6], [-118, 0, 6], [-18, 0, -3], [-18, 0, 3], [0, 0.04, 0]),
      pose(0.7, [-8, 0, 0], [6, 0, 0], [-95, 0, -5], [-95, 0, 5], [35, 0, -4], [35, 0, 4], [0, 0.2, 0]),
      pose(1, [-6, 0, 0], [5, 0, 0], [-42, 0, -4], [-42, 0, 4], [48, 0, -5], [48, 0, 5], [0, 0.28, 0]),
    ], [{ id: "takeoff", effector: "LeftFootAttachment", target: "Ground", startTime: 0, endTime: duration * 0.36, positionWeight: 1, rotationWeight: 0.8, allowSlideMeters: 0.01 }]);
  }
  if (family === "hard_land") {
    const duration = 0.48 + random(index, 23) * 0.12;
    return makeDraft(`Attempt_Mobility_${family}_${index}`, duration, ["landing", "impact-absorption"], [
      pose(0, [-5, 0, 0], [8, 0, 0], [-35, 0, -6], [-35, 0, 6], [38, 0, -4], [38, 0, 4], [0, 0.2, 0]),
      pose(0.22, [2, 0, 0], [4, 0, 0], [18, 0, -8], [18, 0, 8], [14, 0, -5], [14, 0, 5], [0, 0.03, 0]),
      pose(0.34, [18, 0, 0], [-12, 0, 0], [62, 0, -12], [62, 0, 12], [32, 0, -8], [32, 0, 8], [0, -0.28, 0.04]),
      pose(0.54, [14, 0, 0], [-9, 0, 0], [48, 0, -10], [48, 0, 10], [26, 0, -6], [26, 0, 6], [0, -0.22, 0.03]),
      pose(0.76, [6, 0, 0], [-4, 0, 0], [22, 0, -5], [22, 0, 5], [14, 0, -3], [14, 0, 3], [0, -0.08, 0.01]),
      pose(1, zero(), zero(), zero(), zero(), zero(), zero()),
    ], [{ id: "land", effector: "RightFootAttachment", target: "Ground", startTime: duration * 0.22, endTime: duration, positionWeight: 1, rotationWeight: 0.9, allowSlideMeters: 0.012 }]);
  }
  const duration = 0.55 + random(index, 24) * 0.12;
  const side = random(index, 25) > 0.5 ? 1 : -1;
  return makeDraft(`Attempt_Mobility_${family}_${index}`, duration, ["wall-jump", side > 0 ? "wall-right" : "wall-left"], [
    pose(0, [-8, side * 15, side * 10], [6, -side * 12, -side * 8], [-side * 42, 0, -side * 18], [side * 30, 0, side * 14], [side * 38, 0, -side * 10], [-side * 30, 0, side * 10], [side * 0.08, 0, 0]),
    pose(0.18, [-4, side * 22, side * 16], [3, -side * 18, -side * 12], [-side * 58, 0, -side * 25], [side * 42, 0, side * 20], [side * 52, 0, -side * 14], [-side * 38, 0, side * 14], [side * 0.12, -0.08, 0]),
    pose(0.34, [10, -side * 8, -side * 8], [-7, side * 12, side * 6], [side * 64, 0, side * 18], [-side * 54, 0, -side * 18], [-side * 62, 0, side * 12], [side * 52, 0, -side * 12], [-side * 0.04, 0.12, 0]),
    pose(0.56, [-10, -side * 18, -side * 12], [7, side * 22, side * 9], [side * 48, 0, side * 14], [-side * 44, 0, -side * 14], [-side * 48, 0, side * 10], [side * 44, 0, -side * 10], [-side * 0.11, 0.24, 0]),
    pose(0.78, [-7, -side * 10, -side * 6], [5, side * 14, side * 5], [side * 26, 0, side * 8], [-side * 24, 0, -side * 8], [-side * 30, 0, side * 6], [side * 28, 0, -side * 6], [-side * 0.08, 0.2, 0]),
    pose(1, [-4, 0, 0], [3, 0, 0], [12, 0, -3], [-12, 0, 3], [-16, 0, -3], [16, 0, 3], [0, 0.1, 0]),
  ]);
}

function create(family: Family, index: number): AnimationDraft {
  if (family.startsWith("dash_")) return dash(family as Extract<Family, `dash_${string}`>, index);
  if (family === "forward_roll" || family === "side_roll") return roll(family, index);
  return utility(
    family as Exclude<Family, "dash_forward" | "dash_backward" | "dash_left" | "dash_right" | "forward_roll" | "side_roll">,
    index,
  );
}
function metric(report: QualityReport, name: string): number {
  return report.metrics.find((candidate) => candidate.name === name)?.score ?? 0;
}
function rank(family: Family, draft: AnimationDraft): Candidate {
  const report = reviewDraft(draft);
  const fullBody = metric(report, "full_body_participation");
  const semantic =
    family === "dash_forward" ? metric(report, "forward_dash_readability") :
    family === "dash_backward" || family === "dash_left" || family === "dash_right"
      ? metric(report, "directional_dash_readability") :
    family === "forward_roll" || family === "side_roll"
      ? metric(report, "roll_rotation_continuity") :
    fullBody;
  const score = report.overallScore * 0.48 + semantic * 0.42 + fullBody * 0.1;
  return { family, draft, report, score };
}

const candidates = families.flatMap((family) =>
  Array.from({ length: 10 }, (_, index) => rank(family, create(family, index))),
);
const winners = families.map((family) =>
  candidates.filter((candidate) => candidate.family === family)
    .sort((left, right) => right.score - left.score)[0]!,
);
winners.forEach((winner, index) => {
  winner.draft.name = `MD_TR_R6_Mobility_${String(index + 1).padStart(2, "0")}_${labels[winner.family]}`;
  winner.draft.metadata.style = winner.draft.metadata.style
    .filter((style) => style !== "training-candidate")
    .concat("training-winner");
});
process.stdout.write(`GENERATED ${candidates.length}\nSELECTED ${winners.length}\nDISCARDED ${candidates.length - winners.length}\n`);
for (const winner of winners) {
  process.stdout.write(`RANKED ${winner.draft.name} score=${winner.score.toFixed(4)} quality=${winner.report.overallScore.toFixed(4)}\n`);
}

const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const client = new Client({ name: "motion-director-r6-mobility-training", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/src/index.js"],
  cwd: process.cwd(),
  env: environment,
  stderr: "pipe",
});
const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
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
    if ((JSON.parse(text(status)) as { connected: boolean }).connected) { connected = true; break; }
    await sleep(500);
  }
  if (!connected) throw new Error("Studio did not connect to Motion Director.");
  const capabilities = await client.callTool({ name: "studio_animation_capabilities", arguments: {} });
  if (capabilities.isError) throw new Error(text(capabilities));
  for (const winner of winners) {
    const validation = await client.callTool({ name: "validate_animation_draft", arguments: { draft: winner.draft } });
    if (validation.isError) throw new Error(`${winner.draft.name}: ${text(validation)}`);
    const staged = await client.callTool({
      name: "stage_animation_draft",
      arguments: { transactionName: `R6 mobility winner - ${winner.draft.name}`, draft: winner.draft },
    });
    if (staged.isError) throw new Error(`${winner.draft.name}: ${text(staged)}`);
    const transactionId = (JSON.parse(text(staged)) as { transactionId: string }).transactionId;
    const committed = await client.callTool({
      name: "commit_animation_draft",
      arguments: { transactionId, destinationName: winner.draft.name },
    });
    if (committed.isError) throw new Error(`${winner.draft.name}: ${text(committed)}`);
    process.stdout.write(`COMMITTED ${winner.draft.name}\n`);
  }
  const attached = await client.callTool({
    name: "attach_committed_animations_to_selected_rig_animsaves",
    arguments: { namePrefix: "MD_TR_R6_Mobility_" },
  });
  if (attached.isError) throw new Error(text(attached));
  process.stdout.write(`ATTACHED\n${text(attached)}\n`);
} finally {
  await client.close();
}
