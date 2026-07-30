import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { animationDraftSchema, type AnimationDraft, type QualityReport } from "../src/domain.js";
import { reviewDraft } from "../src/quality.js";

type Rotation = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type Family =
  | "walk" | "fast_walk" | "run" | "sprint"
  | "walk_start" | "run_start" | "run_stop" | "sprint_stop"
  | "turn_left" | "turn_right";
type Frame = {
  n: number;
  root: [number, number, number];
  rotations: Record<Joint, Rotation>;
};
type Candidate = { family: Family; draft: AnimationDraft; report: QualityReport; score: number };

const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const families: Family[] = [
  "walk", "fast_walk", "run", "sprint",
  "walk_start", "run_start", "run_stop", "sprint_stop",
  "turn_left", "turn_right",
];
const winnerLabels: Record<Family, string> = {
  walk: "Walk",
  fast_walk: "FastWalk",
  run: "Run",
  sprint: "PursuitSprint",
  walk_start: "WalkStart",
  run_start: "RunStart",
  run_stop: "RunStop",
  sprint_stop: "SprintStop",
  turn_left: "TurnLeft",
  turn_right: "TurnRight",
};

function random(index: number, salt: number): number {
  const value = Math.sin((index + 1) * (12.9898 + salt * 23.417)) * 43758.5453;
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

function pose(
  n: number,
  torso: Rotation,
  head: Rotation,
  rightArm: Rotation,
  leftArm: Rotation,
  rightLeg: Rotation,
  leftLeg: Rotation,
  root: [number, number, number] = [0, 0, 0],
): Frame {
  return {
    n,
    root,
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
  looped: boolean,
  style: string[],
  frames: Frame[],
  transition?: "start" | "stop",
): AnimationDraft {
  return animationDraftSchema.parse({
    name,
    rigId: "selection:1",
    duration,
    framesPerSecond: 30,
    looped,
    priority: "movement",
    beats: looped
      ? [
          { id: "left", label: "Left support", startTime: 0, endTime: duration / 2, intention: "Transfer weight through the left support and preserve forward intent", energy: 0.75, leadingBodyPart: "Torso" },
          { id: "right", label: "Right support", startTime: duration / 2, endTime: duration, intention: "Mirror the stride without changing the performance character", energy: 0.75, leadingBodyPart: "Torso" },
        ]
      : [
          { id: "prepare", label: "Prepare", startTime: 0, endTime: duration * 0.25, intention: transition === "stop" ? "Recognize the need to brake" : "Commit weight toward movement", energy: 0.55, leadingBodyPart: "Torso" },
          { id: "change", label: "Change velocity", startTime: duration * 0.25, endTime: duration * 0.75, intention: transition === "stop" ? "Absorb forward momentum through a firm brace" : "Build stride amplitude and cadence", energy: 0.9, leadingBodyPart: "Torso" },
          { id: "handoff", label: "Handoff", startTime: duration * 0.75, endTime: duration, intention: transition === "stop" ? "Return to a controllable neutral stance" : "Match the target locomotion cycle", energy: 0.65, leadingBodyPart: "Torso" },
        ],
    contacts: looped
      ? [
          { id: "left_support", effector: "LeftFootAttachment", target: "Ground", startTime: 0, endTime: duration * 0.16, positionWeight: 1, rotationWeight: 0.9, allowSlideMeters: 0.015 },
          { id: "right_support", effector: "RightFootAttachment", target: "Ground", startTime: duration / 2, endTime: duration / 2 + duration * 0.16, positionWeight: 1, rotationWeight: 0.9, allowSlideMeters: 0.015 },
        ]
      : [],
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
      intent: `Temporary R6 locomotion training candidate: ${style.join(" ")}`,
      rigType: "R6",
      style: ["r6", "training-candidate", ...style, ...(transition ? [`locomotion-${transition}`] : [])],
      version: 1,
    },
  });
}

function makeCycle(family: Extract<Family, "walk" | "fast_walk" | "run" | "sprint">, index: number) {
  const base = {
    walk: { duration: 0.84, pitch: -2, arm: 28, leg: 27, bob: 0.045, style: "natural-walk" },
    fast_walk: { duration: 0.62, pitch: -4, arm: 36, leg: 37, bob: 0.055, style: "fast-walk" },
    run: { duration: 0.5, pitch: -6, arm: 42, leg: 48, bob: 0.07, style: "run" },
    sprint: { duration: 0.42, pitch: -10, arm: 58, leg: 60, bob: 0.095, style: "sprint" },
  }[family];
  const duration = base.duration * (0.94 + random(index, 1) * 0.12);
  const pitch = base.pitch * (0.9 + random(index, 2) * 0.18);
  const arm = base.arm * (0.9 + random(index, 3) * 0.2);
  const leg = base.leg * (0.9 + random(index, 4) * 0.2);
  const bob = base.bob * (0.85 + random(index, 5) * 0.25);
  const twist = 1.5 + random(index, 6) * (family === "sprint" ? 3 : 1.5);
  const roll = 1.2 + random(index, 7) * 2;
  const phase = (n: number, side: 1 | -1, strength: number, y: number) =>
    pose(
      n,
      [pitch * (1 + (strength < 0.8 ? 0.12 : 0)), twist * side, roll * side],
      [-pitch * 0.72, -twist * side * 0.8, -roll * side * 0.8],
      [-arm * side * strength, 0, -roll * side * 0.55],
      [arm * side * strength, 0, roll * side * 0.55],
      [leg * side * strength, 0, -roll * side * 0.22],
      [-leg * side * strength, 0, roll * side * 0.22],
      [0, y, 0],
    );
  const frames = [
    phase(0, -1, 1, -bob * 0.35),
    phase(0.125, -1, 0.78, -bob * 0.78),
    phase(0.25, -1, 0.15, bob * 0.35),
    phase(0.375, 1, 0.68, bob),
    phase(0.5, 1, 1, -bob * 0.35),
    phase(0.625, 1, 0.78, -bob * 0.78),
    phase(0.75, 1, 0.15, bob * 0.35),
    phase(0.875, -1, 0.68, bob),
  ];
  frames.push({ ...frames[0]!, n: 1 });
  return makeDraft(
    `Attempt_Locomotion_${family}_${index + 1}`,
    duration,
    true,
    [base.style, family === "sprint" ? "pursuit" : "believable-speed-stage"],
    frames,
  );
}

function makeStart(family: "walk_start" | "run_start", index: number) {
  const running = family === "run_start";
  const duration = (running ? 0.42 : 0.55) * (0.93 + random(index, 11) * 0.14);
  const pitch = running ? -7.5 : -3;
  const arm = running ? 42 : 25;
  const leg = running ? 48 : 27;
  const frames = [
    pose(0, [0, 0, 0], zero(), zero(), zero(), zero(), zero()),
    pose(0.12, [2, 0, 0], [-1, 0, 0], [10, 0, -2], [-8, 0, 2], [8, 0, -1], [-6, 0, 1], [0, -0.04, 0.01]),
    pose(0.28, [pitch * 0.65, -2, -1], [-pitch * 0.45, 2, 1], [-arm * 0.5, 0, -3], [arm * 0.5, 0, 3], [leg * 0.58, 0, -2], [-leg * 0.58, 0, 2], [0, -0.07, -0.03]),
    pose(0.48, [pitch, 2, 1], [-pitch * 0.7, -2, -1], [arm * 0.55, 0, -4], [-arm * 0.55, 0, 4], [-leg * 0.48, 0, 2], [leg * 0.48, 0, -2], [0, 0.04, -0.045]),
    pose(0.7, [pitch, 3, 2], [-pitch * 0.7, -3, -2], [arm, 0, -5], [-arm, 0, 5], [-leg, 0, 3], [leg, 0, -3], [0, -0.03, -0.035]),
    pose(0.86, [pitch, 0, 0], [-pitch * 0.7, 0, 0], [arm * 0.2, 0, -2], [-arm * 0.2, 0, 2], [-leg * 0.2, 0, 1], [leg * 0.2, 0, -1], [0, 0.04, -0.02]),
    pose(1, [pitch, -3, -2], [-pitch * 0.7, 3, 2], [-arm, 0, -5], [arm, 0, 5], [leg, 0, -3], [-leg, 0, 3], [0, -0.02, 0]),
  ];
  return makeDraft(`Attempt_Locomotion_${family}_${index + 1}`, duration, false, [running ? "run" : "natural-walk", family], frames, "start");
}

function makeStop(family: "run_stop" | "sprint_stop", index: number) {
  const sprint = family === "sprint_stop";
  const duration = (sprint ? 0.54 : 0.46) * (0.92 + random(index, 21) * 0.16);
  const pitch = sprint ? -10 : -6;
  const arm = sprint ? 56 : 42;
  const leg = sprint ? 60 : 48;
  const brake = 7 + random(index, 22) * 5;
  const frames = [
    pose(0, [pitch, -3, -2], [-pitch * 0.7, 3, 2], [-arm, 0, -5], [arm, 0, 5], [leg, 0, -3], [-leg, 0, 3], [0, -0.02, 0]),
    pose(0.16, [pitch * 0.45, 0, 0], [-pitch * 0.3, 0, 0], [-arm * 0.3, 0, -3], [arm * 0.3, 0, 3], [leg * 0.35, 0, -2], [-leg * 0.4, 0, 2], [0, 0.025, 0.02]),
    pose(0.34, [brake, 2, 1], [-brake * 0.65, -2, -1], [28, 0, -8], [28, 0, 8], [24, 0, -5], [36, 0, 5], [0, -0.11, 0.045]),
    pose(0.52, [brake * 0.8, -2, -1], [-brake * 0.5, 2, 1], [22, 0, -6], [22, 0, 6], [20, 0, -4], [28, 0, 4], [0, -0.09, 0.035]),
    pose(0.7, [4, 0, 0], [-3, 0, 0], [12, 0, -3], [12, 0, 3], [12, 0, -2], [14, 0, 2], [0, -0.045, 0.015]),
    pose(0.86, [1, 0, 0], [-1, 0, 0], [4, 0, -1], [4, 0, 1], [4, 0, -1], [4, 0, 1], [0, -0.015, 0]),
    pose(1, [0, 0, 0], zero(), zero(), zero(), zero(), zero()),
  ];
  return makeDraft(`Attempt_Locomotion_${family}_${index + 1}`, duration, false, [sprint ? "sprint" : "run", family, "braking"], frames, "stop");
}

function zero(): Rotation {
  return [0, 0, 0];
}

function makeTurn(family: "turn_left" | "turn_right", index: number) {
  const sign = family === "turn_left" ? 1 : -1;
  const duration = 0.43 + random(index, 31) * 0.14;
  const torsoYaw = 23 + random(index, 32) * 10;
  const headYaw = 34 + random(index, 33) * 12;
  const roll = 6 + random(index, 34) * 4;
  const frames = [
    pose(0, zero(), zero(), zero(), zero(), zero(), zero()),
    pose(0.13, [1, -sign * 5, -sign * 2], [0, sign * 8, sign * 1], [8, 0, -sign * 3], [-8, 0, sign * 3], [8, 0, -sign * 2], [-8, 0, sign * 2], [0, -0.02, 0]),
    pose(0.3, [-3, sign * torsoYaw * 0.45, sign * roll * 0.6], [2, sign * headYaw, -sign * roll * 0.4], [-24, 0, -sign * 8], [28, 0, sign * 8], [30, 0, -sign * 6], [-34, 0, sign * 6], [sign * 0.025, -0.07, 0]),
    pose(0.5, [-4, sign * torsoYaw, sign * roll], [3, sign * headYaw * 0.82, -sign * roll * 0.55], [-34, 0, -sign * 10], [38, 0, sign * 10], [42, 0, -sign * 8], [-46, 0, sign * 8], [sign * 0.055, -0.08, 0]),
    pose(0.7, [-3, sign * torsoYaw * 0.72, sign * roll * 0.7], [2, sign * headYaw * 0.55, -sign * roll * 0.35], [25, 0, -sign * 7], [-22, 0, sign * 7], [-32, 0, -sign * 5], [29, 0, sign * 5], [sign * 0.035, -0.045, 0]),
    pose(0.87, [-1, sign * 6, sign * 2], [1, sign * 8, -sign], [8, 0, -sign * 2], [-7, 0, sign * 2], [-10, 0, -sign * 2], [9, 0, sign * 2], [sign * 0.01, -0.015, 0]),
    pose(1, zero(), zero(), zero(), zero(), zero(), zero()),
  ];
  return makeDraft(`Attempt_Locomotion_${family}_${index + 1}`, duration, false, [family.replace("_", "-"), "direction-change"], frames);
}

function createCandidate(family: Family, index: number): AnimationDraft {
  if (family === "walk" || family === "fast_walk" || family === "run" || family === "sprint") return makeCycle(family, index);
  if (family === "walk_start" || family === "run_start") return makeStart(family, index);
  if (family === "run_stop" || family === "sprint_stop") return makeStop(family, index);
  return makeTurn(family, index);
}

function metric(report: QualityReport, name: string): number {
  return report.metrics.find((candidate) => candidate.name === name)?.score ?? 0;
}

function rank(family: Family, draft: AnimationDraft): Candidate {
  const report = reviewDraft(draft);
  const fullBody = metric(report, "full_body_participation");
  const semantic =
    family === "walk" || family === "fast_walk" || family === "run" || family === "sprint"
      ? (metric(report, "locomotion_cadence") + metric(report, "locomotion_lean_feasibility") + metric(report, "loop_closure")) / 3
      : family === "turn_left" || family === "turn_right"
        ? metric(report, "turn_direction_readability")
        : metric(report, "locomotion_transition_handoff");
  const score = report.overallScore * 0.45 + semantic * 0.45 + fullBody * 0.1;
  return { family, draft, report, score };
}

const candidates = families.flatMap((family) =>
  Array.from({ length: 10 }, (_, index) => rank(family, createCandidate(family, index))),
);
const winners = families.map((family) =>
  candidates
    .filter((candidate) => candidate.family === family)
    .sort((left, right) => right.score - left.score)[0]!,
);
winners.forEach((winner, index) => {
  winner.draft.name = `MD_TR_R6_Locomotion_${String(index + 1).padStart(2, "0")}_${winnerLabels[winner.family]}`;
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
const client = new Client({ name: "motion-director-r6-locomotion-training", version: "0.1.0" });
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
    const validation = await client.callTool({ name: "validate_animation_draft", arguments: { draft: winner.draft } });
    if (validation.isError) throw new Error(`${winner.draft.name}: ${text(validation)}`);
    const staged = await client.callTool({
      name: "stage_animation_draft",
      arguments: { transactionName: `R6 locomotion winner - ${winner.draft.name}`, draft: winner.draft },
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
    arguments: { namePrefix: "MD_TR_R6_Locomotion_" },
  });
  if (attached.isError) throw new Error(text(attached));
  process.stdout.write(`ATTACHED\n${text(attached)}\n`);
} finally {
  await client.close();
}
