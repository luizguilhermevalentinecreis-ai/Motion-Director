import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type Quaternion = { x: number; y: number; z: number; w: number };
type Position = { x: number; y: number; z: number };

const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const client = new Client({ name: "motion-director-live-author", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/src/index.js"],
  cwd: process.cwd(),
  env: environment,
  stderr: "pipe",
});
transport.stderr?.on("data", (chunk: Buffer | string) => process.stderr.write(chunk));

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function textResult(result: unknown): string {
  const content =
    result && typeof result === "object" && "content" in result
      ? (result as { content?: unknown }).content
      : undefined;
  const block = Array.isArray(content)
    ? content.find(
        (item): item is { type: "text"; text: string } =>
          Boolean(
            item &&
              typeof item === "object" &&
              "type" in item &&
              item.type === "text" &&
              "text" in item &&
              typeof item.text === "string",
          ),
      )
    : undefined;
  return block?.text ?? "";
}

function quaternionFromEulerDegrees(xDegrees: number, yDegrees: number, zDegrees: number): Quaternion {
  const x = (xDegrees * Math.PI) / 360;
  const y = (yDegrees * Math.PI) / 360;
  const z = (zDegrees * Math.PI) / 360;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };
}

const pose = (
  time: number,
  rotation: [number, number, number],
  position: Position = { x: 0, y: 0, z: 0 },
  style: "linear" | "constant" | "cubic" | "cubicV2" | "elastic" | "bounce" = "cubicV2",
  direction: "in" | "out" | "inOut" = "inOut",
) => ({
  time,
  transform: {
    position,
    rotation: quaternionFromEulerDegrees(...rotation),
  },
  easing: { style, direction },
  weight: 1,
});

const framesPerSecond = 60;
const controlFrames = [
  0, 42, 50, 56, 61, 64, 66, 70, 74, 78, 82, 86, 89,
  150, 158, 166, 174, 178, 186, 198, 215,
  300, 306, 312, 320, 328, 336, 344, 348, 352, 360,
  450, 458, 466, 474, 478, 486, 500,
  600, 606, 610, 614, 620, 626, 632, 636, 640, 644, 650, 670, 900,
];
const controlTimes = controlFrames.map((frame) =>
  Number((frame / framesPerSecond).toFixed(6)),
);
const duration = controlTimes.at(-1)!;
const burstRanges: Array<[number, number]> = [
  [50, 89],
  [150, 215],
  [300, 360],
  [450, 500],
  [600, 670],
];
const sampledFrames = Array.from(
  new Set([
    ...Array.from({ length: Math.round(duration * framesPerSecond) + 1 }, (_, frame) => frame).filter(
      (frame) =>
        frame % 2 === 0 ||
        burstRanges.some(([start, end]) => frame >= start && frame <= end),
    ),
    ...controlFrames,
  ]),
).sort((left, right) => left - right);
const sampledTimes = sampledFrames.map((frame) =>
  Number((frame / framesPerSecond).toFixed(6)),
);

function sampleTuple(
  values: Array<[number, number, number]>,
  time: number,
): [number, number, number] {
  if (time <= controlTimes[0]!) return values[0]!;
  if (time >= controlTimes.at(-1)!) return values.at(-1)!;

  const segment = controlTimes.findIndex(
    (segmentEnd, index) => index > 0 && time <= segmentEnd,
  );
  const startIndex = segment - 1;
  const endIndex = segment;
  const range = controlTimes[endIndex]! - controlTimes[startIndex]!;
  const alpha = (time - controlTimes[startIndex]!) / range;
  const start = values[startIndex]!;
  const end = values[endIndex]!;

  // Deliberately do not spline fight poses. A spline overshoots shoulders,
  // elbows and hips, producing the rubbery motion the previous pass had.
  return [0, 1, 2].map(
    (axis) => start[axis]! + (end[axis]! - start[axis]!) * alpha,
  ) as [number, number, number];
}

function samplePosition(values: Position[] | undefined, time: number): Position {
  if (!values) return { x: 0, y: 0, z: 0 };
  const sampled = sampleTuple(
    values.map(({ x, y, z }) => [x, y, z]),
    time,
  );
  return { x: sampled[0], y: sampled[1], z: sampled[2] };
}

const track = (
  joint: string,
  rotations: Array<[number, number, number]>,
  positions?: Position[],
) => ({
  joint,
  space: "parent",
  keys: sampledTimes.map((time) =>
    pose(
      time,
      sampleTuple(rotations, time),
      samplePosition(positions, time),
      // The curve is already baked into the dense samples. Linear playback
      // follows that curve faithfully instead of smoothing it a second time.
      "linear",
      "inOut",
    ),
  ),
});

const jointNames = [
  "LowerTorso",
  "UpperTorso",
  "Head",
  "RightUpperArm",
  "RightLowerArm",
  "RightHand",
  "LeftUpperArm",
  "LeftLowerArm",
  "LeftHand",
  "RightUpperLeg",
  "RightLowerLeg",
  "RightFoot",
  "LeftUpperLeg",
  "LeftLowerLeg",
  "LeftFoot",
] as const;
type JointName = (typeof jointNames)[number];
type Rotation = [number, number, number];
type FightFrame = {
  root: Position;
  joints: Record<JointName, Rotation>;
};

const guard: Record<JointName, Rotation> = {
  LowerTorso: [11, 0, 0],
  UpperTorso: [-8, 0, 0],
  Head: [-3, 0, 0],
  RightUpperArm: [26, -12, -28],
  RightLowerArm: [34, 0, 0],
  RightHand: [4, -2, -6],
  LeftUpperArm: [22, 12, 28],
  LeftLowerArm: [40, 0, 0],
  LeftHand: [4, 2, 6],
  RightUpperLeg: [-15, -4, 10],
  RightLowerLeg: [-34, 0, 0],
  RightFoot: [10, 0, 0],
  LeftUpperLeg: [18, 4, -10],
  LeftLowerLeg: [-28, 0, 0],
  LeftFoot: [7, 0, 0],
};

const fightFrame = (
  root: [number, number, number],
  overrides: Partial<Record<JointName, Rotation>> = {},
): FightFrame => ({
  root: { x: root[0], y: root[1], z: root[2] },
  joints: { ...guard, ...overrides },
});

type PoseOverride = Partial<Record<JointName, Rotation>>;
const combine = (...poses: PoseOverride[]): PoseOverride => Object.assign({}, ...poses);
const strongPoses = {
  coilRight: {
    LowerTorso: [22, -24, -8], UpperTorso: [-14, -34, 7], Head: [-4, 18, 2],
    RightUpperArm: [-72, -10, -18], RightLowerArm: [22, 0, 0],
    LeftUpperArm: [48, 14, 36], LeftLowerArm: [72, 0, 0],
  },
  coilLeft: {
    LowerTorso: [22, 24, 8], UpperTorso: [-14, 34, -7], Head: [-4, -18, -2],
    LeftUpperArm: [-72, 10, 18], LeftLowerArm: [22, 0, 0],
    RightUpperArm: [48, -14, -36], RightLowerArm: [72, 0, 0],
  },
  dash: {
    LowerTorso: [34, 0, 0], UpperTorso: [-18, 0, 0], Head: [9, 0, 0],
    RightUpperArm: [-58, -8, -18], LeftUpperArm: [-52, 8, 18],
    RightLowerArm: [18, 0, 0], LeftLowerArm: [20, 0, 0],
    RightUpperLeg: [28, -4, 8], RightLowerLeg: [-70, 0, 0],
    LeftUpperLeg: [-32, 4, -8], LeftLowerLeg: [-18, 0, 0],
  },
  straightRight: {
    LowerTorso: [-3, 32, 4], UpperTorso: [-8, 46, 2], Head: [2, -18, 0],
    RightUpperArm: [122, 5, -10], RightLowerArm: [4, 0, 0], RightHand: [-8, 0, -5],
    LeftUpperArm: [54, 16, 38], LeftLowerArm: [78, 0, 0],
    RightUpperLeg: [-22, -4, 8], LeftUpperLeg: [24, 4, -8],
  },
  straightLeft: {
    LowerTorso: [-3, -32, -4], UpperTorso: [-8, -46, -2], Head: [2, 18, 0],
    LeftUpperArm: [122, -5, 10], LeftLowerArm: [4, 0, 0], LeftHand: [-8, 0, 5],
    RightUpperArm: [54, -16, -38], RightLowerArm: [78, 0, 0],
    LeftUpperLeg: [-22, 4, -8], RightUpperLeg: [24, -4, 8],
  },
  hookRight: {
    LowerTorso: [2, 38, 10], UpperTorso: [-8, 54, 14], Head: [0, -24, -4],
    RightUpperArm: [116, 18, -30], RightLowerArm: [18, 0, 0], RightHand: [-10, 0, -8],
    LeftUpperArm: [50, 12, 35], LeftLowerArm: [70, 0, 0],
  },
  hookLeft: {
    LowerTorso: [2, -38, -10], UpperTorso: [-8, -54, -14], Head: [0, 24, 4],
    LeftUpperArm: [116, -18, 30], LeftLowerArm: [18, 0, 0], LeftHand: [-10, 0, 8],
    RightUpperArm: [50, -12, -35], RightLowerArm: [70, 0, 0],
  },
  highBlock: {
    LowerTorso: [18, 0, 0], UpperTorso: [-14, 0, 0], Head: [12, 0, 0],
    RightUpperArm: [102, 22, -48], RightLowerArm: [112, 0, 0],
    LeftUpperArm: [102, -22, 48], LeftLowerArm: [112, 0, 0],
    RightUpperLeg: [-24, -5, 12], LeftUpperLeg: [25, 5, -12],
    RightLowerLeg: [-58, 0, 0], LeftLowerLeg: [-52, 0, 0],
  },
  lowDodgeRight: {
    LowerTorso: [30, 24, 30], UpperTorso: [-22, -18, -24], Head: [20, -16, -14],
    RightUpperArm: [35, -25, -48], LeftUpperArm: [62, 20, 46],
    RightLowerLeg: [-88, 0, 0], LeftLowerLeg: [-72, 0, 0],
  },
  lowDodgeLeft: {
    LowerTorso: [30, -24, -30], UpperTorso: [-22, 18, 24], Head: [20, 16, 14],
    LeftUpperArm: [35, 25, 48], RightUpperArm: [62, -20, -46],
    LeftLowerLeg: [-88, 0, 0], RightLowerLeg: [-72, 0, 0],
  },
  jumpCoil: {
    LowerTorso: [30, 0, 0], UpperTorso: [-18, 0, 0],
    RightUpperLeg: [24, -8, 12], LeftUpperLeg: [28, 8, -12],
    RightLowerLeg: [-105, 0, 0], LeftLowerLeg: [-105, 0, 0],
    RightUpperArm: [-38, -18, -30], LeftUpperArm: [-38, 18, 30],
  },
  flyingKickRight: {
    LowerTorso: [-18, -28, 18], UpperTorso: [14, 34, -14], Head: [-4, -18, -3],
    RightUpperLeg: [96, 12, -24], RightLowerLeg: [-8, 0, 0], RightFoot: [-18, 0, 0],
    LeftUpperLeg: [-48, -8, 22], LeftLowerLeg: [-118, 0, 0],
    RightUpperArm: [-48, -22, -36], LeftUpperArm: [72, 18, 42],
  },
  flyingKickLeft: {
    LowerTorso: [-18, 28, -18], UpperTorso: [14, -34, 14], Head: [-4, 18, 3],
    LeftUpperLeg: [96, -12, 24], LeftLowerLeg: [-8, 0, 0], LeftFoot: [-18, 0, 0],
    RightUpperLeg: [-48, 8, -22], RightLowerLeg: [-118, 0, 0],
    LeftUpperArm: [-48, 22, 36], RightUpperArm: [72, -18, -42],
  },
  aerialGuard: {
    LowerTorso: [-8, 0, 0], UpperTorso: [8, 0, 0],
    RightUpperArm: [112, 24, -48], RightLowerArm: [105, 0, 0],
    LeftUpperArm: [112, -24, 48], LeftLowerArm: [105, 0, 0],
    RightUpperLeg: [40, -8, 18], LeftUpperLeg: [40, 8, -18],
    RightLowerLeg: [-92, 0, 0], LeftLowerLeg: [-92, 0, 0],
  },
  landing: {
    LowerTorso: [32, 0, 0], UpperTorso: [-20, 0, 0], Head: [14, 0, 0],
    RightUpperLeg: [24, -8, 14], LeftUpperLeg: [28, 8, -14],
    RightLowerLeg: [-100, 0, 0], LeftLowerLeg: [-96, 0, 0],
    RightUpperArm: [-36, -18, -30], LeftUpperArm: [-32, 18, 30],
  },
  recoilRight: {
    LowerTorso: [26, 30, 25], UpperTorso: [-18, -24, -20], Head: [22, -20, -12],
    RightUpperArm: [48, -28, -58], LeftUpperArm: [78, 22, 48],
    RightLowerLeg: [-82, 0, 0], LeftLowerLeg: [-68, 0, 0],
  },
  recoilLeft: {
    LowerTorso: [26, -30, -25], UpperTorso: [-18, 24, 20], Head: [22, 20, 12],
    LeftUpperArm: [48, 28, 58], RightUpperArm: [78, -22, -48],
    LeftLowerLeg: [-82, 0, 0], RightLowerLeg: [-68, 0, 0],
  },
  clashRight: {
    LowerTorso: [-4, 34, 8], UpperTorso: [-12, 48, 10], Head: [5, -22, -3],
    RightUpperArm: [126, 12, -20], RightLowerArm: [8, 0, 0],
    LeftUpperArm: [64, 18, 44], LeftLowerArm: [86, 0, 0],
    RightUpperLeg: [-28, -5, 10], LeftUpperLeg: [30, 5, -10],
  },
  clashLeft: {
    LowerTorso: [-4, -34, -8], UpperTorso: [-12, -48, -10], Head: [5, 22, 3],
    LeftUpperArm: [126, -12, 20], LeftLowerArm: [8, 0, 0],
    RightUpperArm: [64, -18, -44], RightLowerArm: [86, 0, 0],
    LeftUpperLeg: [-28, 5, -10], RightUpperLeg: [30, -5, 10],
  },
  resistance: {
    LowerTorso: [24, 0, 0], UpperTorso: [-18, 0, 0], Head: [10, 0, 0],
    RightUpperArm: [108, 18, -38], RightLowerArm: [96, 0, 0],
    LeftUpperArm: [108, -18, 38], LeftLowerArm: [96, 0, 0],
    RightUpperLeg: [-30, -6, 14], LeftUpperLeg: [32, 6, -14],
    RightLowerLeg: [-58, 0, 0], LeftLowerLeg: [-52, 0, 0],
  },
  knocked: {
    LowerTorso: [-20, 18, 24], UpperTorso: [18, -22, -18], Head: [28, -18, -12],
    RightUpperArm: [-52, -30, -48], LeftUpperArm: [-58, 26, 52],
    RightUpperLeg: [42, -12, 20], LeftUpperLeg: [-36, 10, -18],
    RightLowerLeg: [-60, 0, 0], LeftLowerLeg: [-82, 0, 0],
  },
} satisfies Record<string, PoseOverride>;

const ff = (
  root: [number, number, number],
  ...poses: PoseOverride[]
): FightFrame => fightFrame(root, combine(...poses));

const actorAFrames: FightFrame[] = [
  ff([0, -0.18, 0]), ff([0, -0.2, 0], strongPoses.coilRight), ff([0, -0.28, 0], strongPoses.coilRight),
  ff([0, -0.2, -1.8], strongPoses.dash), ff([0, -0.05, -3.5], strongPoses.dash),
  ff([0, 0, -4.7], strongPoses.straightRight), ff([0, 0, -4.9], strongPoses.straightRight),
  ff([-0.5, -0.65, -4.35], strongPoses.lowDodgeLeft), ff([-0.2, -0.2, -4.5], strongPoses.coilLeft),
  ff([0, 0, -4.85], strongPoses.straightLeft), ff([0, 0, -4.9], strongPoses.hookRight),
  ff([0, -0.05, -4.8], strongPoses.clashRight), ff([0, -0.08, -4.8], strongPoses.resistance),
  ff([-0.9, -0.1, -3.7], strongPoses.recoilLeft), ff([-0.2, -0.75, -3.9], strongPoses.jumpCoil),
  ff([0, 0.8, -4.25], strongPoses.flyingKickRight), ff([0, 1.75, -4.7], strongPoses.flyingKickRight),
  ff([0, 1.55, -4.85], strongPoses.clashRight), ff([0.4, 0.25, -4.2], strongPoses.recoilRight),
  ff([0.1, -0.75, -3.8], strongPoses.landing), ff([0, -0.2, -3.9]),
  ff([0, -0.15, -5.4], strongPoses.dash), ff([0.9, -0.05, -6.4], strongPoses.dash),
  ff([1.1, 0, -6.5], strongPoses.coilLeft), ff([0.55, 0, -5.6], strongPoses.hookLeft),
  ff([-0.45, -0.45, -5.05], strongPoses.lowDodgeRight), ff([-0.1, 0, -5.2], strongPoses.straightRight),
  ff([0, 0.05, -5.25], strongPoses.clashRight), ff([0, 0.08, -5.25], strongPoses.resistance),
  ff([0.2, 0.05, -5.15], strongPoses.resistance), ff([-0.7, -0.1, -4.5], strongPoses.recoilLeft),
  ff([-0.35, -0.65, -4.3], strongPoses.jumpCoil), ff([0, 0.9, -4.55], strongPoses.aerialGuard),
  ff([0.15, 1.7, -4.8], strongPoses.flyingKickLeft), ff([0, 1.55, -4.9], strongPoses.clashLeft),
  ff([0.5, 0.25, -4.2], strongPoses.recoilRight), ff([0.15, -0.8, -3.9], strongPoses.landing),
  ff([0, -0.2, -4], strongPoses.coilRight), ff([0, -0.1, -5.2], strongPoses.dash),
  ff([0, 0, -5.45], strongPoses.straightRight), ff([-0.35, 0, -5.3], strongPoses.hookLeft),
  ff([0.45, -0.35, -4.8], strongPoses.lowDodgeRight), ff([0, -0.3, -4.7], strongPoses.coilRight),
  ff([0, -0.12, -6.1], strongPoses.dash), ff([0, 0, -6.45], strongPoses.clashRight),
  ff([0, 0, -6.5], strongPoses.clashRight), ff([0, 0, -6.5], strongPoses.resistance),
  ff([-0.8, -0.15, -5.8], strongPoses.recoilLeft), ff([-0.5, -0.2, -5.25], strongPoses.knocked),
  ff([-0.35, -0.3, -5.1], strongPoses.landing), ff([-0.25, -0.2, -5.05]),
];

const actorBFrames: FightFrame[] = [
  ff([0, -0.18, 0]), ff([0, -0.2, 0]), ff([0, -0.25, 0], strongPoses.highBlock),
  ff([-0.75, -0.55, -0.4], strongPoses.lowDodgeRight), ff([-1.1, -0.35, -0.8], strongPoses.lowDodgeRight),
  ff([-0.9, -0.15, -1.2], strongPoses.coilLeft), ff([-0.25, 0, -2.1], strongPoses.straightLeft),
  ff([0, 0, -3.1], strongPoses.straightLeft), ff([0.2, -0.1, -3.7], strongPoses.highBlock),
  ff([0, -0.1, -4.35], strongPoses.highBlock), ff([0, -0.1, -4.75], strongPoses.clashLeft),
  ff([0, -0.05, -4.8], strongPoses.clashLeft), ff([0, -0.08, -4.8], strongPoses.resistance),
  ff([0.85, -0.1, -3.8], strongPoses.recoilRight), ff([0, -0.1, -4.2], strongPoses.aerialGuard),
  ff([0, 0.65, -4.45], strongPoses.aerialGuard), ff([0, 1.45, -4.75], strongPoses.aerialGuard),
  ff([0, 1.35, -4.85], strongPoses.clashLeft), ff([-0.45, 0.2, -4.15], strongPoses.recoilLeft),
  ff([-0.1, -0.75, -3.85], strongPoses.landing), ff([0, -0.2, -3.9]),
  ff([0, -0.15, -5.25], strongPoses.dash), ff([-0.9, 0, -6.3], strongPoses.dash),
  ff([-1.05, 0, -6.45], strongPoses.coilRight), ff([-0.5, -0.05, -5.55], strongPoses.straightRight),
  ff([0.5, -0.4, -5], strongPoses.lowDodgeLeft), ff([0.1, 0, -5.2], strongPoses.clashLeft),
  ff([0, 0.05, -5.25], strongPoses.clashLeft), ff([0, 0.08, -5.25], strongPoses.resistance),
  ff([-0.2, 0.05, -5.15], strongPoses.resistance), ff([0.7, -0.1, -4.5], strongPoses.recoilRight),
  ff([0.35, -0.65, -4.3], strongPoses.jumpCoil), ff([0, 0.85, -4.55], strongPoses.flyingKickRight),
  ff([-0.15, 1.65, -4.8], strongPoses.aerialGuard), ff([0, 1.55, -4.9], strongPoses.clashRight),
  ff([-0.5, 0.25, -4.2], strongPoses.recoilLeft), ff([-0.15, -0.8, -3.9], strongPoses.landing),
  ff([0, -0.2, -4], strongPoses.coilLeft), ff([0, -0.1, -5.1], strongPoses.dash),
  ff([0, 0, -5.4], strongPoses.highBlock), ff([0.35, 0, -5.25], strongPoses.straightRight),
  ff([-0.45, -0.35, -4.8], strongPoses.lowDodgeLeft), ff([0, -0.3, -4.7], strongPoses.coilLeft),
  ff([0, -0.12, -6], strongPoses.dash), ff([0, 0, -6.4], strongPoses.clashLeft),
  ff([0, 0, -6.5], strongPoses.clashLeft), ff([0, 0, -6.5], strongPoses.resistance),
  ff([0.8, -0.15, -5.8], strongPoses.recoilRight), ff([0.55, -0.2, -5.25], strongPoses.knocked),
  ff([0.35, -0.3, -5.1], strongPoses.landing), ff([0.25, -0.2, -5.05]),
];

const sharedBeats = [
  { id: "standoff", label: "Predatory silence", startTime: 0, endTime: 0.83, intention: "Compress both bodies before the first disappearance", energy: 0.22, leadingBodyPart: "Head" },
  { id: "vanish_entry", label: "Six-frame vanish", startTime: 0.83, endTime: 1.48, intention: "Dash, slip, counter and clash with the fists leading every attack line", energy: 1, leadingBodyPart: "RightHand" },
  { id: "first_air", label: "Aerial collision", startTime: 2.5, endTime: 3.58, intention: "Launch and collide with a sharp airborne kick silhouette", energy: 0.98, leadingBodyPart: "RightFoot" },
  { id: "cross_dash", label: "Cross-screen barrage", startTime: 5, endTime: 6, intention: "Trade straight punches and evasions in a one-second burst", energy: 1, leadingBodyPart: "LowerTorso" },
  { id: "vertical_round", label: "Vertical counter", startTime: 7.5, endTime: 8.33, intention: "Counter above the opponent and land with compressed weight", energy: 0.98, leadingBodyPart: "LeftFoot" },
  { id: "decisive_burst", label: "Supreme-force collision", startTime: 10, endTime: 11.17, intention: "Accelerate through the final barrage into a two-frame held impact", energy: 1, leadingBodyPart: "RightHand" },
  { id: "aftermath", label: "Aftershock", startTime: 11.17, endTime: duration, intention: "Let only the recoil settle; preserve the final powerful silhouettes", energy: 0.3, leadingBodyPart: "LowerTorso" },
];

const contacts = [
  { id: "opening-left-base", effector: "LeftFootAttachment", target: "Ground", startTime: 0, endTime: 1.2, positionWeight: 1, rotationWeight: 0.85, allowSlideMeters: 0.008 },
  { id: "opening-right-drive", effector: "RightFootAttachment", target: "Ground", startTime: 1, endTime: 2.6, positionWeight: 0.92, rotationWeight: 0.75, allowSlideMeters: 0.025 },
  { id: "first-landing", effector: "LeftFootAttachment", target: "Ground", startTime: 4.5, endTime: 5.4, positionWeight: 0.95, rotationWeight: 0.8, allowSlideMeters: 0.02 },
  { id: "lock-base", effector: "RightFootAttachment", target: "Ground", startTime: 6.87, endTime: 8.87, positionWeight: 1, rotationWeight: 0.85, allowSlideMeters: 0.015 },
  { id: "second-landing", effector: "LeftFootAttachment", target: "Ground", startTime: 10.9, endTime: 11.7, positionWeight: 0.95, rotationWeight: 0.8, allowSlideMeters: 0.02 },
  { id: "final-drive", effector: "RightFootAttachment", target: "Ground", startTime: 12.87, endTime: 14.2, positionWeight: 0.95, rotationWeight: 0.78, allowSlideMeters: 0.025 },
  { id: "aftermath-base", effector: "LeftFootAttachment", target: "Ground", startTime: 14.2, endTime: duration, positionWeight: 1, rotationWeight: 0.85, allowSlideMeters: 0.012 },
];

function buildActorDraft(name: string, rigId: string, frames: FightFrame[], role: string) {
  if (frames.length !== controlTimes.length) {
    throw new Error(
      `${name} has ${frames.length} authored poses for ${controlTimes.length} control times.`,
    );
  }
  return {
    name,
    rigId,
    duration,
    framesPerSecond,
    looped: false,
    priority: "action4" as const,
    beats: sharedBeats,
    contacts,
    tracks: jointNames.map((joint) =>
      track(
        joint,
        frames.map((frame) => frame.joints[joint]),
        joint === "LowerTorso" ? frames.map((frame) => frame.root) : undefined,
      ),
    ),
    metadata: {
      intent: `${role} in a fifteen-second synchronized R15 duel built from strong force-aligned silhouettes, grounded mechanics, resisted contacts, selective anime timing, aerial exchanges, and readable aftermath`,
      rigType: "R15" as const,
      style: ["cinematic", "anime-action", "fast", "epic", "synchronized", role],
      version: 1 as const,
    },
  };
}

const actorADraft = buildActorDraft(
  "MCP_CinematicDuel15s_ActorA_V3",
  "selection:1",
  actorAFrames,
  "relentless initiator",
);
const actorBDraft = buildActorDraft(
  "MCP_CinematicDuel15s_ActorB_V3",
  "selection:2",
  actorBFrames,
  "reactive counter-fighter",
);

try {
  await client.connect(transport);
  let connected = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await client.callTool({ name: "studio_status", arguments: {} });
    const parsed = JSON.parse(textResult(status)) as { connected: boolean };
    if (parsed.connected) {
      connected = true;
      break;
    }
    await sleep(500);
  }
  if (!connected) throw new Error("Place2 did not connect to the MCP bridge.");

  const capabilities = await client.callTool({
    name: "studio_animation_capabilities",
    arguments: {},
  });
  if (capabilities.isError) throw new Error(textResult(capabilities));
  const capabilityData = JSON.parse(textResult(capabilities)) as {
    parentSpaceBakerVersion?: number;
    autoCreateAnimator?: boolean;
    synchronizedMultiRig?: boolean;
  };
  if (
    (capabilityData.parentSpaceBakerVersion ?? 0) < 4 ||
    !capabilityData.autoCreateAnimator ||
    !capabilityData.synchronizedMultiRig
  ) {
    throw new Error(
      "The live Studio plugin is not the synchronized multi-rig baker v4; reload the installed plugin before authoring.",
    );
  }
  process.stdout.write(`CAPABILITIES\n${textResult(capabilities)}\n`);

  for (const [actorId, draft] of [
    ["ActorA", actorADraft],
    ["ActorB", actorBDraft],
  ] as const) {
    const validation = await client.callTool({
      name: "validate_animation_draft",
      arguments: { draft },
    });
    if (validation.isError) throw new Error(`${actorId}: ${textResult(validation)}`);
    process.stdout.write(`VALIDATION_${actorId}\n${textResult(validation)}\n`);
  }

  const staged = await client.callTool({
    name: "stage_synchronized_multi_rig_animation",
    arguments: {
      transactionName: "MCP R15 Supreme-Speed Duel 15s V3",
      layout: "faceOff",
      actorSpacing: 10,
      actors: [
        { actorId: "ActorA", selectionIndex: 1, draft: actorADraft },
        { actorId: "ActorB", selectionIndex: 2, draft: actorBDraft },
      ],
    },
  });
  if (staged.isError) throw new Error(textResult(staged));
  const stagedData = JSON.parse(textResult(staged)) as { transactionId: string };
  process.stdout.write(`STAGED\n${textResult(staged)}\n`);

  const preview = await client.callTool({
    name: "preview_synchronized_multi_rig_animation",
    arguments: {
      transactionId: stagedData.transactionId,
      looped: false,
      playbackSpeed: 1,
    },
  });
  process.stdout.write(
    `PREVIEW\n${preview.isError ? `Unavailable: ${textResult(preview)}` : textResult(preview)}\n`,
  );

  const committed = await client.callTool({
    name: "commit_synchronized_multi_rig_animation",
    arguments: {
      transactionId: stagedData.transactionId,
      destinationName: "MCP_R15_SupremeSpeedDuel_15s_V3",
    },
  });
  if (committed.isError) throw new Error(textResult(committed));
  process.stdout.write(`COMMITTED\n${textResult(committed)}\n`);
} finally {
  await client.close();
}
