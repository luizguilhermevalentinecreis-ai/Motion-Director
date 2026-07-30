import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { animationDraftSchema, type AnimationDraft, type QualityReport } from "../src/domain.js";
import { reviewDraft } from "../src/quality.js";

type Rotation = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type Frame = {
  n: number;
  root?: [number, number, number];
  rotations: Record<Joint, Rotation>;
  easing?: "in" | "out" | "inOut";
};
type Candidate = {
  family: "dash" | "backflip";
  draft: AnimationDraft;
  report: QualityReport;
  score: number;
};

const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const zero: Rotation = [0, 0, 0];

function random(index: number, salt: number): number {
  const value = Math.sin((index + 1) * (12.9898 + salt * 17.137)) * 43758.5453;
  return value - Math.floor(value);
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

function frame(
  n: number,
  torso: Rotation,
  head: Rotation,
  rightArm: Rotation,
  leftArm: Rotation,
  rightLeg: Rotation,
  leftLeg: Rotation,
  root: [number, number, number] = [0, 0, 0],
  easing: Frame["easing"] = "inOut",
): Frame {
  return {
    n,
    root,
    rotations: { Torso: torso, Head: head, "Right Arm": rightArm, "Left Arm": leftArm, "Right Leg": rightLeg, "Left Leg": leftLeg },
    easing,
  };
}

function draftFromFrames(
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
      { id: "load", label: "Load", startTime: 0, endTime: duration * 0.18, intention: "Create a short readable preparation", energy: 0.65, leadingBodyPart: "Torso" },
      { id: "commit", label: "Commit", startTime: duration * 0.18, endTime: duration * 0.72, intention: "Commit the entire silhouette to the action", energy: 1, leadingBodyPart: "Torso" },
      { id: "recover", label: "Recover", startTime: duration * 0.72, endTime: duration, intention: "Return control without a soft or weightless finish", energy: 0.58, leadingBodyPart: "Torso" },
    ],
    contacts,
    tracks: joints.map((joint) => ({
      joint,
      space: "parent",
      keys: frames.map((pose) => ({
        time: Number((pose.n * duration).toFixed(6)),
        transform: {
          position: joint === "Torso"
            ? { x: pose.root?.[0] ?? 0, y: pose.root?.[1] ?? 0, z: pose.root?.[2] ?? 0 }
            : { x: 0, y: 0, z: 0 },
          rotation: quaternion(pose.rotations[joint]),
        },
        easing: { style: "cubicV2", direction: pose.easing ?? "inOut" },
        weight: 1,
      })),
    })),
    metadata: {
      intent: `Temporary R6 training candidate for ${style.join(" ")}`,
      rigType: "R6",
      style: ["r6", "training-candidate", ...style],
      version: 1,
    },
  });
}

function makeDash(index: number): AnimationDraft {
  const duration = 0.27 + random(index, 1) * 0.1;
  const lean = 34 + random(index, 2) * 12;
  const arm = 72 + random(index, 3) * 20;
  const rearLeg = 46 + random(index, 4) * 18;
  const nearLeg = 27 + random(index, 5) * 17;
  const depth = 0.16 + random(index, 6) * 0.08;
  const drop = 0.1 + random(index, 7) * 0.06;
  const asymmetry = 1.5 + random(index, 8) * 4;
  return draftFromFrames(
    `Attempt_Foundations_Dash_${String(index + 1).padStart(3, "0")}`,
    duration,
    ["anime", "dash", "forward", "arrow-silhouette", "in-place"],
    [
      frame(0, zero, zero, zero, zero, zero, zero),
      frame(0.1, [5, 0, 0], [-4, 0, 0], [-18, 0, -3], [-18, 0, 3], [16, 0, 1], [13, 0, -1], [0, -0.05, 0.02], "in"),
      frame(0.22, [-lean * 0.84, -asymmetry, -1], [lean * 0.58, asymmetry, 1], [arm * 0.88, 0, -9], [arm * 0.88, 0, 9], [-rearLeg * 0.82, 0, -3], [-nearLeg * 0.85, 0, 3], [0, -drop * 0.9, -depth * 0.58], "out"),
      frame(0.38, [-lean, -asymmetry, -2], [lean * 0.7, asymmetry, 2], [arm, 0, -12], [arm, 0, 12], [-rearLeg, 0, -4], [-nearLeg, 0, 4], [0, -drop, -depth], "out"),
      frame(0.58, [-lean * 0.94, asymmetry, 2], [lean * 0.66, -asymmetry, -2], [arm * 0.95, 0, -10], [arm * 0.95, 0, 10], [-nearLeg * 1.06, 0, -3], [-rearLeg * 0.94, 0, 3], [0, -drop * 0.88, -depth * 0.9]),
      frame(0.75, [-lean * 0.58, 2, 1], [lean * 0.4, -2, -1], [arm * 0.64, 0, -7], [arm * 0.64, 0, 7], [-nearLeg * 0.65, 0, -2], [-rearLeg * 0.62, 0, 2], [0, -drop * 0.55, -depth * 0.45]),
      frame(0.9, [-8, 0, 0], [5, 0, 0], [20, 0, -3], [20, 0, 3], [-12, 0, -1], [-14, 0, 1], [0, -0.025, -0.02]),
      frame(1, [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], "out"),
    ],
  );
}

function makeBackflip(index: number): AnimationDraft {
  const duration = 0.95 + random(index, 11) * 0.2;
  const apex = 0.34 + random(index, 12) * 0.14;
  const tuck = 88 + random(index, 13) * 24;
  const load = 14 + random(index, 14) * 6;
  const armSwing = 122 + random(index, 15) * 22;
  const pitch = [0, load * 0.45, load, 34, 76, 128, 182, 238, 289, 329, 351, 368, 360];
  const heights = [0, -0.09, -0.21, 0.02, apex * 0.56, apex * 0.86, apex, apex * 0.84, apex * 0.53, apex * 0.16, -0.12, -0.2, 0];
  const arm = [0, 28, 58, -armSwing, -105, -48, -30, -35, -72, -25, 18, 38, 0];
  const leg = [0, 10, 22, -12, 46, tuck * 0.84, tuck, tuck * 0.88, 48, 18, 22, 25, 0];
  const frames = pitch.map((angle, poseIndex) =>
    frame(
      poseIndex / (pitch.length - 1),
      [angle, 0, 0],
      [poseIndex >= 3 && poseIndex <= 9 ? -Math.min(24, angle * 0.12) : -angle * 0.08, 0, 0],
      [arm[poseIndex]!, 0, -Math.min(12, poseIndex * 1.4)],
      [arm[poseIndex]!, 0, Math.min(12, poseIndex * 1.4)],
      [leg[poseIndex]!, 0, -Math.min(8, poseIndex)],
      [leg[poseIndex]!, 0, Math.min(8, poseIndex)],
      [0, heights[poseIndex]!, poseIndex < 3 || poseIndex > 9 ? 0.025 : 0],
      poseIndex <= 3 ? (poseIndex < 3 ? "in" : "out") : poseIndex >= 9 ? "out" : "inOut",
    ),
  );
  return draftFromFrames(
    `Attempt_Foundations_Backflip_${String(index + 1).padStart(3, "0")}`,
    duration,
    ["acrobatics", "backflip", "full-rotation", "standing"],
    frames,
    [
      { id: "takeoff", effector: "LeftFootAttachment", target: "Ground", startTime: 0, endTime: duration * 0.18, positionWeight: 1, rotationWeight: 0.8, allowSlideMeters: 0.01 },
      { id: "landing", effector: "RightFootAttachment", target: "Ground", startTime: duration * 0.87, endTime: duration, positionWeight: 1, rotationWeight: 0.85, allowSlideMeters: 0.015 },
    ],
  );
}

function metric(report: QualityReport, name: string): number {
  return report.metrics.find((candidate) => candidate.name === name)?.score ?? 0;
}

function rank(family: Candidate["family"], draft: AnimationDraft): Candidate {
  const report = reviewDraft(draft);
  const semantic =
    family === "dash"
      ? metric(report, "forward_dash_readability")
      : metric(report, "backflip_rotation_continuity");
  const fullBody = metric(report, "full_body_participation");
  const timingTarget = family === "dash" ? 0.31 : 1.04;
  const timingTolerance = family === "dash" ? 0.09 : 0.18;
  const timing = Math.max(0, 1 - Math.abs(draft.duration - timingTarget) / timingTolerance);
  const score = report.overallScore * 0.35 + semantic * 0.4 + fullBody * 0.1 + timing * 0.15;
  return { family, draft, report, score };
}

const candidates: Candidate[] = [
  ...Array.from({ length: 50 }, (_, index) => rank("dash", makeDash(index))),
  ...Array.from({ length: 50 }, (_, index) => rank("backflip", makeBackflip(index))),
];
const winners = (["dash", "backflip"] as const).flatMap((family) =>
  candidates
    .filter((candidate) => candidate.family === family)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5),
);
winners.forEach((winner, index) => {
  const familyIndex = winners
    .slice(0, index + 1)
    .filter((candidate) => candidate.family === winner.family).length;
  winner.draft.name =
    `MD_TR_R6_Foundations_${winner.family === "dash" ? "Dash" : "Backflip"}_${String(familyIndex).padStart(2, "0")}`;
  winner.draft.metadata.style = winner.draft.metadata.style
    .filter((style) => style !== "training-candidate")
    .concat("training-winner");
});

process.stdout.write(
  `GENERATED ${candidates.length}\nSELECTED ${winners.length}\nDISCARDED ${candidates.length - winners.length}\n`,
);
for (const winner of winners) {
  process.stdout.write(
    `RANKED ${winner.draft.name} score=${winner.score.toFixed(4)} quality=${winner.report.overallScore.toFixed(4)}\n`,
  );
}

const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const client = new Client({ name: "motion-director-r6-foundations-training", version: "0.1.0" });
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
    if ((JSON.parse(text(status)) as { connected: boolean }).connected) {
      connected = true;
      break;
    }
    await sleep(500);
  }
  if (!connected) throw new Error("Studio did not connect to Motion Director.");
  const capabilities = await client.callTool({ name: "studio_animation_capabilities", arguments: {} });
  if (capabilities.isError) throw new Error(text(capabilities));

  for (const winner of winners) {
    const validation = await client.callTool({
      name: "validate_animation_draft",
      arguments: { draft: winner.draft },
    });
    if (validation.isError) throw new Error(`${winner.draft.name}: ${text(validation)}`);
    const staged = await client.callTool({
      name: "stage_animation_draft",
      arguments: {
        transactionName: `R6 training winner - ${winner.draft.name}`,
        draft: winner.draft,
      },
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
    arguments: { namePrefix: "MD_TR_R6_Foundations_" },
  });
  if (attached.isError) throw new Error(text(attached));
  process.stdout.write(`ATTACHED\n${text(attached)}\n`);
} finally {
  await client.close();
}
