import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { animationDraftSchema, type AnimationDraft, type QualityReport } from "../src/domain.js";
import { reviewDraft } from "../src/quality.js";
import {
  visualDirections,
  type FoundationAction,
  type VisualDirection,
} from "../src/visual-directions.js";

type Rotation = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type Sample = { root: [number, number, number]; rotations: Record<Joint, Rotation> };
type Candidate = { direction: VisualDirection; draft: AnimationDraft; report: QualityReport; score: number };

const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const actions: FoundationAction[] = [
  "idle", "walk", "run", "sprint", "start",
  "stop", "turn", "dash", "jump", "land",
];

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}
function mix(left: number, right: number, alpha: number): number {
  return left + (right - left) * alpha;
}
function smooth(value: number): number {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
}
function smoother(value: number): number {
  const x = clamp(value);
  return x * x * x * (x * (x * 6 - 15) + 10);
}
function pulse(time: number, start: number, peak: number, end: number): number {
  if (time <= start || time >= end) return 0;
  if (time < peak) return smoother((time - start) / (peak - start));
  return 1 - smoother((time - peak) / (end - peak));
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
function body(
  torso: Rotation, head: Rotation,
  rightArm: Rotation, leftArm: Rotation,
  rightLeg: Rotation, leftLeg: Rotation,
): Record<Joint, Rotation> {
  return {
    Torso: torso, Head: head,
    "Right Arm": rightArm, "Left Arm": leftArm,
    "Right Leg": rightLeg, "Left Leg": leftLeg,
  };
}
function has(direction: VisualDirection, tag: string): boolean {
  return direction.tags.includes(tag);
}
function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "");
}
function durationFor(direction: VisualDirection): number {
  const ranges: Record<FoundationAction, [number, number]> = {
    idle: [2.8, 1.65],
    walk: [1.05, 0.62],
    run: [0.66, 0.4],
    sprint: [0.54, 0.34],
    start: [0.78, 0.34],
    stop: [0.82, 0.36],
    turn: [0.86, 0.32],
    dash: [0.52, 0.25],
    jump: [0.86, 0.46],
    land: [0.82, 0.38],
  };
  const [slow, fast] = ranges[direction.action];
  return Number(mix(slow, fast, direction.pace).toFixed(3));
}

function armValues(
  direction: VisualDirection,
  rightBase: number,
  leftBase: number,
  phase: number,
): [Rotation, Rotation] {
  const asymmetry = direction.asymmetry;
  let right = rightBase * (1 + asymmetry * 0.18);
  let left = leftBase * (1 - asymmetry * 0.18);
  let rightRoll = -1.5 * Math.sin(phase);
  let leftRoll = 1.5 * Math.sin(phase);
  switch (direction.armCarriage) {
    case "athletic":
      right *= 1.16; left *= 1.16;
      break;
    case "guarded":
      right = right * 0.65 - 18; left = left * 0.65 - 22;
      rightRoll -= 6; leftRoll += 6;
      break;
    case "protective":
      right = right * 0.62 - 34; left = left * 0.38 + 12;
      rightRoll -= 8; leftRoll += 3;
      break;
    case "heavy":
      right *= 0.58; left *= 0.58;
      break;
    case "stealth":
      right = right * 0.5 - 22; left = left * 0.5 - 22;
      rightRoll -= 4; leftRoll += 4;
      break;
    case "open":
      right *= 1.08; left *= 1.08;
      rightRoll -= 9; leftRoll += 9;
      break;
    case "trailing":
      right = Math.abs(right) * 0.45 + 46; left = Math.abs(left) * 0.45 + 46;
      rightRoll -= 8; leftRoll += 8;
      break;
    case "panic":
      right *= 1.32; left *= 1.18;
      rightRoll -= 11 * Math.sin(phase * 0.5); leftRoll += 9 * Math.cos(phase * 0.5);
      break;
    case "stylized":
      right *= 1.38; left *= 1.3;
      rightRoll -= 10; leftRoll += 10;
      break;
    default:
      break;
  }
  return [[right, 0, rightRoll], [left, 0, leftRoll]];
}

function locomotionSample(
  direction: VisualDirection,
  normalizedTime: number,
  mode: "walk" | "run" | "sprint",
  frameCount: number,
): Sample {
  const phase = normalizedTime * Math.PI * 2;
  const lag = direction.overlapFrames / frameCount * Math.PI * 2;
  const modeEnergy = mode === "walk" ? 0.72 : mode === "run" ? 1 : 1.18;
  const legAmplitude = (mode === "walk" ? 27 : mode === "run" ? 47 : 60)
    * mix(0.78, 1.18, direction.energy);
  const armAmplitude = (mode === "walk" ? 29 : mode === "run" ? 42 : 56)
    * mix(0.75, 1.2, direction.energy);
  const injuredLeft = has(direction, "injured-left");
  const injuredRight = has(direction, "injured-right");
  const rightScale = injuredRight ? 0.52 : 1 + direction.asymmetry * 0.13;
  const leftScale = injuredLeft ? 0.52 : 1 - direction.asymmetry * 0.13;
  const rightPhase = phase + (injuredRight ? 0.18 : 0);
  const leftPhase = phase + Math.PI + (injuredLeft ? 0.18 : 0);
  const strideShape = 0.1 + direction.energy * 0.08;
  const rightLeg = legAmplitude * rightScale
    * (Math.sin(rightPhase) + strideShape * Math.sin(rightPhase * 2));
  const leftLeg = legAmplitude * leftScale
    * (Math.sin(leftPhase) + strideShape * Math.sin(leftPhase * 2));
  const torsoWave = Math.sin(phase + 0.07);
  const armWave = Math.sin(phase - lag);
  const [rightArm, leftArm] = armValues(
    direction,
    -armAmplitude * armWave,
    armAmplitude * armWave,
    phase,
  );
  const stealth = has(direction, "stealth") || has(direction, "quiet") || has(direction, "low-profile");
  const heavy = direction.weight > 0.8;
  const verticalScale = stealth ? 0.45 : heavy ? 0.78 : 1;
  const bobBase = mode === "walk" ? 0.045 : mode === "run" ? 0.082 : 0.1;
  const flight = mode === "walk"
    ? 0.5 - 0.5 * Math.cos(phase * 2)
    : Math.pow(0.5 - 0.5 * Math.cos(phase * 2), 0.78);
  const headThreatCheck = (has(direction, "fear") || has(direction, "pursued") || has(direction, "panic"))
    ? 4.5 * Math.sin(phase * 0.5 - lag)
    : 0;
  const torsoYaw = modeEnergy * (2.2 + direction.energy * 1.8) * torsoWave;
  const torsoRoll = (1.3 + direction.lateralBias * 3.2) * torsoWave;
  return {
    root: [
      direction.lateralBias * 0.025 + 0.015 * Math.sin(phase),
      bobBase * verticalScale * flight - bobBase * verticalScale * 0.3,
      0.01 * Math.sin(phase * 2),
    ],
    rotations: body(
      [-direction.forwardLean - 1.1 * Math.cos(phase * 2), torsoYaw, torsoRoll],
      [
        direction.forwardLean * 0.68 + 0.7 * Math.cos(phase * 2 - lag),
        -torsoYaw * 0.74 * Math.sin(phase - lag) + headThreatCheck,
        -torsoRoll * 0.78,
      ],
      rightArm,
      leftArm,
      [rightLeg, 0, -torsoRoll * 0.25],
      [leftLeg, 0, torsoRoll * 0.25],
    ),
  };
}

function idleSample(direction: VisualDirection, t: number, frameCount: number): Sample {
  const phase = t * Math.PI * 2;
  const lag = direction.overlapFrames / frameCount * Math.PI * 2;
  const breath = Math.sin(phase);
  const breathLate = Math.sin(phase - lag);
  const restless = has(direction, "impatient") ? Math.sin(phase * 3.2) : 0;
  const shiver = has(direction, "cold") ? Math.sin(phase * 7.3) * 2.6 : 0;
  const still = has(direction, "ominous") ? 0.22 : 1;
  const amplitude = mix(1.2, 4.5, direction.energy) * still;
  const [rightArm, leftArm] = armValues(
    direction,
    amplitude * 0.55 * breathLate + shiver,
    amplitude * 0.48 * breathLate - shiver,
    phase,
  );
  return {
    root: [
      direction.lateralBias * 0.04 + 0.012 * restless,
      0.018 * breath * still,
      0.004 * breath,
    ],
    rotations: body(
      [
        direction.forwardLean + amplitude * 0.32 * breath,
        1.2 * restless,
        direction.lateralBias * 6 + amplitude * 0.28 * breathLate,
      ],
      [-direction.forwardLean * 0.65 - amplitude * 0.22 * breathLate, 2.2 * restless, -direction.lateralBias * 4],
      rightArm,
      leftArm,
      [1.8 * breath + restless * 2, 0, -direction.lateralBias * 2],
      [1.5 * breathLate - restless * 2, 0, direction.lateralBias * 2],
    ),
  };
}

function startSample(direction: VisualDirection, t: number): Sample {
  const load = pulse(t, 0, 0.2, 0.34);
  const drive = smoother((t - 0.16) / 0.84);
  const panic = has(direction, "panic");
  const heavy = has(direction, "heavy") || has(direction, "inertia");
  const activePhase = drive * Math.PI * (panic ? 2.4 : 1.7);
  const amplitude = mix(26, 55, direction.energy);
  const [rightArm, leftArm] = armValues(
    direction,
    amplitude * Math.sin(activePhase),
    -amplitude * Math.sin(activePhase),
    activePhase,
  );
  const legRight = amplitude * 1.05 * Math.sin(activePhase + Math.PI);
  const legLeft = amplitude * 1.05 * Math.sin(activePhase);
  const stumble = has(direction, "stumble") ? 7 * Math.sin(t * Math.PI * 2) * (1 - t) : 0;
  return {
    root: [
      direction.lateralBias * 0.05 * load + stumble * 0.004,
      -mix(0.07, 0.2, direction.weight) * load + 0.06 * drive,
      -0.05 * drive,
    ],
    rotations: body(
      [
        8 * load - direction.forwardLean * drive,
        direction.lateralBias * 8 * load + stumble,
        direction.lateralBias * 7 * load,
      ],
      [-5 * load + direction.forwardLean * 0.62 * drive, -stumble * 0.7, -direction.lateralBias * 4],
      rightArm,
      leftArm,
      [legRight * (heavy ? 0.72 : 1), 0, -direction.lateralBias * 3],
      [legLeft * (heavy ? 0.72 : 1), 0, direction.lateralBias * 3],
    ),
  };
}

function stopSample(direction: VisualDirection, t: number): Sample {
  const incoming = 1 - smoother(t / 0.38);
  const brake = pulse(t, 0.16, 0.4, 0.78);
  const settle = 1 - smoother((t - 0.62) / 0.38);
  const phase = t * Math.PI * 1.6;
  const runAmplitude = 45 * incoming;
  const [rightArm, leftArm] = armValues(
    direction,
    -runAmplitude * Math.sin(phase) + 28 * brake,
    runAmplitude * Math.sin(phase) + 24 * brake,
    phase,
  );
  const collapse = has(direction, "collapse") ? 12 * smoother((t - 0.55) / 0.45) : 0;
  return {
    root: [
      direction.lateralBias * 0.06 * brake,
      -mix(0.11, 0.28, direction.weight) * brake - collapse * 0.005,
      0.06 * brake,
    ],
    rotations: body(
      [
        -7 * incoming - direction.forwardLean * brake + collapse,
        direction.lateralBias * 12 * brake,
        direction.lateralBias * 9 * brake,
      ],
      [5 * incoming + direction.forwardLean * 0.55 * brake - collapse * 0.4, -direction.lateralBias * 8, -direction.lateralBias * 6],
      rightArm,
      leftArm,
      [runAmplitude * Math.sin(phase + Math.PI) + 26 * brake, 0, -direction.lateralBias * 5],
      [runAmplitude * Math.sin(phase) + 34 * brake, 0, direction.lateralBias * 5],
    ),
  };
}

function turnSample(direction: VisualDirection, t: number): Sample {
  const turnSign = direction.lateralBias < 0 ? -1 : 1;
  const turnRange =
    has(direction, "one-eighty") ? 58 :
    has(direction, "ninety") ? 42 :
    has(direction, "curious") ? 20 :
    32;
  const headProgress = smoother((t - 0.04) / 0.56);
  const torsoProgress = smoother((t - 0.16) / 0.58);
  const recovery = 1 - smoother((t - 0.72) / 0.28);
  const turn = torsoProgress * recovery;
  const headTurn = headProgress * (1 - smoother((t - 0.78) / 0.22));
  const plant = Math.sin(t * Math.PI);
  const flare = has(direction, "panic") ? 1.35 : 1;
  const [rightArm, leftArm] = armValues(
    direction,
    -28 * plant * turnSign * flare,
    32 * plant * turnSign * flare,
    t * Math.PI * 2,
  );
  return {
    root: [turnSign * 0.07 * plant, -0.07 * plant, 0],
    rotations: body(
      [-direction.forwardLean * plant, turnSign * turnRange * turn, turnSign * 9 * plant],
      [direction.forwardLean * 0.6 * plant, turnSign * turnRange * 1.22 * headTurn, -turnSign * 6 * plant],
      rightArm,
      leftArm,
      [34 * plant * turnSign, 0, -turnSign * 8 * plant],
      [-38 * plant * turnSign, 0, turnSign * 8 * plant],
    ),
  };
}

function dashSample(direction: VisualDirection, t: number): Sample {
  const load = pulse(t, 0, 0.15, 0.25);
  const burst = smoother((t - 0.12) / 0.2) * (1 - smoother((t - 0.68) / 0.32));
  const phase = clamp((t - 0.22) / 0.5);
  const forward = has(direction, "forward") || (!has(direction, "backward") && !has(direction, "left") && !has(direction, "right"));
  const backward = has(direction, "backward");
  const sideSign = has(direction, "left") ? -1 : has(direction, "right") ? 1 : 0;
  const lean = forward ? -direction.forwardLean : backward ? Math.abs(direction.forwardLean) : -6;
  const armBack = mix(46, 88, direction.energy);
  const [rightArm, leftArm] = forward
    ? armValues(direction, armBack * burst, (armBack - 4) * burst, phase * Math.PI)
    : armValues(direction, -48 * burst * (sideSign || 1), 46 * burst * (sideSign || -1), phase * Math.PI);
  const panicNoise = has(direction, "panic") ? Math.sin(t * Math.PI * 5) * 6 * burst : 0;
  return {
    root: [
      sideSign * 0.13 * burst + direction.lateralBias * 0.025 * burst,
      -0.05 * load - mix(0.09, 0.16, direction.weight) * burst,
      forward ? -0.2 * burst : backward ? 0.13 * burst : 0,
    ],
    rotations: body(
      [5 * load + lean * burst, sideSign * 18 * burst + panicNoise, sideSign * 22 * burst],
      [-4 * load - lean * 0.68 * burst, -sideSign * 15 * burst - panicNoise * 0.7, -sideSign * 16 * burst],
      rightArm,
      leftArm,
      [
        15 * load + (forward ? -mix(60, 32, phase) : sideSign * 46) * burst,
        0,
        -sideSign * 10 * burst,
      ],
      [
        12 * load + (forward ? -mix(32, 58, phase) : -sideSign * 40) * burst,
        0,
        sideSign * 10 * burst,
      ],
    ),
  };
}

function jumpSample(direction: VisualDirection, t: number): Sample {
  const load = pulse(t, 0, 0.2, 0.34);
  const airborne = clamp((t - 0.24) / 0.76);
  const heightScale = mix(0.2, 0.42, direction.energy) * mix(0.72, 1.12, 1 - direction.weight);
  const height = heightScale * Math.sin(airborne * Math.PI);
  const asymmetric = direction.asymmetry;
  const forward = has(direction, "long-jump") || has(direction, "obstacle") || has(direction, "wall-bound");
  const armSwing = mix(80, 142, direction.energy);
  const armsUp = -armSwing * pulse(t, 0.16, 0.34, 0.72);
  const tuck = mix(30, 62, direction.energy) * Math.sin(airborne * Math.PI);
  const [rightArm, leftArm] = armValues(direction, armsUp, armsUp * (1 - asymmetric * 0.22), airborne * Math.PI);
  return {
    root: [
      direction.lateralBias * 0.08 * airborne,
      -0.22 * load + height,
      forward ? -0.16 * airborne : 0,
    ],
    rotations: body(
      [10 * load - direction.forwardLean * Math.sin(airborne * Math.PI), direction.lateralBias * 8 * airborne, direction.lateralBias * 7 * load],
      [-7 * load + direction.forwardLean * 0.65 * Math.sin(airborne * Math.PI), -direction.lateralBias * 6, -direction.lateralBias * 5],
      rightArm,
      leftArm,
      [24 * load + tuck * (1 + asymmetric * 0.2), 0, -direction.lateralBias * 4],
      [24 * load + tuck * (1 - asymmetric * 0.2), 0, direction.lateralBias * 4],
    ),
  };
}

function landSample(direction: VisualDirection, t: number): Sample {
  const impact = pulse(t, 0.14, 0.3, 0.62);
  const settle = 1 - smoother((t - 0.54) / 0.46);
  const falling = 1 - smoother(t / 0.3);
  const depth = mix(0.14, 0.31, direction.weight) * impact;
  const stumble = has(direction, "stumble") ? Math.sin((t - 0.28) * Math.PI * 4) * (1 - smooth((t - 0.3) / 0.7)) : 0;
  const running = has(direction, "running");
  const rollReady = has(direction, "roll-ready");
  const threePoint = has(direction, "three-point");
  const asymmetry = threePoint ? 0.9 : direction.asymmetry;
  const [rightArm, leftArm] = armValues(
    direction,
    -34 * falling + (threePoint ? -68 : 48) * impact,
    -34 * falling + 42 * impact,
    t * Math.PI * 2,
  );
  return {
    root: [
      direction.lateralBias * 0.08 * impact + stumble * 0.008,
      0.18 * falling - depth,
      (rollReady ? -0.1 : 0.025) * impact,
    ],
    rotations: body(
      [
        -5 * falling + direction.forwardLean * impact + stumble * 0.7,
        direction.lateralBias * 10 * impact + stumble,
        direction.lateralBias * 9 * impact,
      ],
      [7 * falling - direction.forwardLean * 0.65 * impact, -stumble * 0.6, -direction.lateralBias * 6],
      rightArm,
      leftArm,
      [
        38 * falling + 30 * impact * (1 + asymmetry * 0.18) + (running ? -32 * (1 - settle) : 0),
        0,
        -direction.lateralBias * 6,
      ],
      [
        38 * falling + 30 * impact * (1 - asymmetry * 0.18) + (running ? 32 * (1 - settle) : 0),
        0,
        direction.lateralBias * 6,
      ],
    ),
  };
}

function sampleFor(direction: VisualDirection, t: number, frameCount: number): Sample {
  switch (direction.action) {
    case "idle": return idleSample(direction, t, frameCount);
    case "walk": return locomotionSample(direction, t, "walk", frameCount);
    case "run": return locomotionSample(direction, t, "run", frameCount);
    case "sprint": return locomotionSample(direction, t, "sprint", frameCount);
    case "start": return startSample(direction, t);
    case "stop": return stopSample(direction, t);
    case "turn": return turnSample(direction, t);
    case "dash": return dashSample(direction, t);
    case "jump": return jumpSample(direction, t);
    case "land": return landSample(direction, t);
  }
}

function stylesFor(direction: VisualDirection): string[] {
  const styles = ["r6", "dense-sampled", "human-review-required", "visual-direction", ...direction.tags];
  if (direction.action === "walk") styles.push("natural-walk");
  if (direction.action === "run") styles.push("run");
  if (direction.action === "sprint") styles.push("sprint");
  if (direction.action === "start") styles.push("locomotion-start");
  if (direction.action === "stop") styles.push("locomotion-stop");
  if (direction.action === "turn") styles.push(direction.lateralBias < 0 ? "turn-left" : "turn-right");
  if (direction.action === "dash") {
    styles.push("dash");
    if (has(direction, "forward")) styles.push("forward");
    else if (has(direction, "backward")) styles.push("backward");
    else if (has(direction, "left")) styles.push("left");
    else if (has(direction, "right")) styles.push("right");
  }
  return [...new Set(styles)];
}

function draftFor(direction: VisualDirection): AnimationDraft {
  const duration = durationFor(direction);
  const fps = 30;
  const frameCount = Math.max(8, Math.round(duration * fps));
  const looped = direction.action === "idle" || direction.action === "walk" ||
    direction.action === "run" || direction.action === "sprint";
  const samples = Array.from({ length: frameCount + 1 }, (_, index) => ({
    time: index * duration / frameCount,
    sample: sampleFor(direction, index / frameCount, frameCount),
  }));
  const actionBeatEnd = duration * 0.78;
  return animationDraftSchema.parse({
    name: `Attempt_${direction.id}_${slug(direction.name)}`,
    rigId: "selection:1",
    duration,
    framesPerSecond: fps,
    looped,
    priority: direction.action === "idle" ? "idle" : looped ? "movement" : "action",
    beats: looped
      ? [
          { id: "phase_a", label: "Primary phase", startTime: 0, endTime: duration / 2, intention: direction.thesis, energy: direction.energy, leadingBodyPart: "Torso" },
          { id: "phase_b", label: "Complementary phase", startTime: duration / 2, endTime: duration, intention: `Complete the cycle without losing the ${direction.name} acting thesis`, energy: direction.energy, leadingBodyPart: "Torso" },
        ]
      : [
          { id: "anticipation", label: "Anticipation", startTime: 0, endTime: duration * 0.2, intention: `Prepare the ${direction.name} action without generic motion`, energy: direction.energy * 0.62, leadingBodyPart: "Torso" },
          { id: "action", label: "Action", startTime: duration * 0.2, endTime: actionBeatEnd, intention: direction.thesis, energy: direction.energy, leadingBodyPart: "Torso" },
          { id: "recovery", label: "Recovery", startTime: actionBeatEnd, endTime: duration, intention: "Let secondary parts finish on their own timing before handoff", energy: direction.energy * 0.55, leadingBodyPart: "Torso" },
        ],
    contacts: [],
    tracks: joints.map((joint) => ({
      joint,
      space: "parent",
      keys: samples.map(({ time, sample }) => ({
        time: Number(time.toFixed(6)),
        transform: {
          position: joint === "Torso"
            ? { x: sample.root[0], y: sample.root[1], z: sample.root[2] }
            : { x: 0, y: 0, z: 0 },
          rotation: quaternion(sample.rotations[joint]),
        },
        easing: { style: "linear", direction: "inOut" },
        weight: 1,
      })),
    })),
    metadata: {
      intent: `${direction.name}: ${direction.thesis}`,
      rigType: "R6",
      style: stylesFor(direction),
      version: 1,
    },
  });
}

function metric(report: QualityReport, name: string): number | undefined {
  return report.metrics.find((candidate) => candidate.name === name)?.score;
}
function rank(direction: VisualDirection): Candidate {
  const draft = draftFor(direction);
  const report = reviewDraft(draft);
  const fluidMetrics = [
    "dense_temporal_sampling",
    "easing_velocity_continuity",
    "angular_velocity_spike_health",
    "overlap_timing_diversity",
  ].map((name) => metric(report, name) ?? 0);
  const semanticNames = [
    "loop_closure",
    "locomotion_cadence",
    "locomotion_lean_feasibility",
    "locomotion_transition_handoff",
    "turn_direction_readability",
    "forward_dash_readability",
    "directional_dash_readability",
  ];
  const semanticMetrics = semanticNames
    .map((name) => metric(report, name))
    .filter((value): value is number => value !== undefined);
  const fluidity = fluidMetrics.reduce((sum, value) => sum + value, 0) / fluidMetrics.length;
  const semantics = semanticMetrics.length === 0
    ? 1
    : semanticMetrics.reduce((sum, value) => sum + value, 0) / semanticMetrics.length;
  const score = report.overallScore * 0.32 + fluidity * 0.43 + semantics * 0.25;
  return { direction, draft, report, score };
}

const candidates = visualDirections.map(rank);
const reviewQueue = actions.flatMap((action) => {
  const ranked = candidates
    .filter((candidate) => candidate.direction.action === action)
    .sort((left, right) => right.score - left.score);
  const first = ranked[0]!;
  const second = ranked.find((candidate) =>
    candidate.direction.armCarriage !== first.direction.armCarriage &&
    candidate.direction.tags.every((tag) => !first.direction.tags.includes(tag)),
  ) ?? ranked[1]!;
  return [first, second];
});
reviewQueue.forEach((candidate, index) => {
  candidate.draft.name =
    `MD_REVIEW_R6_${String(index + 1).padStart(2, "0")}_${slug(candidate.direction.name)}`;
  candidate.draft.metadata.style = candidate.draft.metadata.style.concat("numeric-shortlist");
});

process.stdout.write(
  `GENERATED ${candidates.length}\nDISTINCT_DIRECTIONS ${new Set(candidates.map((candidate) => candidate.direction.id)).size}\n` +
  `SHORTLISTED ${reviewQueue.length}\nAPPROVED 0\nDISCARDED_FROM_REVIEW ${candidates.length - reviewQueue.length}\n`,
);
for (const candidate of reviewQueue) {
  process.stdout.write(
    `REVIEW ${candidate.draft.name} score=${candidate.score.toFixed(4)} action=${candidate.direction.action} thesis=${candidate.direction.name}\n`,
  );
}

const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const client = new Client({ name: "motion-director-r6-visual-directions", version: "0.1.0" });
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
  const capabilities = await client.callTool({
    name: "studio_animation_capabilities",
    arguments: {},
  });
  if (capabilities.isError) throw new Error(text(capabilities));

  for (const candidate of reviewQueue) {
    const validation = await client.callTool({
      name: "validate_animation_draft",
      arguments: { draft: candidate.draft },
    });
    if (validation.isError) throw new Error(`${candidate.draft.name}: ${text(validation)}`);
    const staged = await client.callTool({
      name: "stage_animation_draft",
      arguments: {
        transactionName: `Human review candidate - ${candidate.direction.name}`,
        draft: candidate.draft,
      },
    });
    if (staged.isError) throw new Error(`${candidate.draft.name}: ${text(staged)}`);
    const transactionId = (JSON.parse(text(staged)) as { transactionId: string }).transactionId;
    const committed = await client.callTool({
      name: "commit_animation_draft",
      arguments: { transactionId, destinationName: candidate.draft.name },
    });
    if (committed.isError) throw new Error(`${candidate.draft.name}: ${text(committed)}`);
    process.stdout.write(`STAGED_FOR_HUMAN_REVIEW ${candidate.draft.name}\n`);
  }
  const attached = await client.callTool({
    name: "attach_committed_animations_to_selected_rig_animsaves",
    arguments: { namePrefix: "MD_REVIEW_R6_" },
  });
  if (attached.isError) throw new Error(text(attached));
  process.stdout.write(`REVIEW_QUEUE_ATTACHED\n${text(attached)}\n`);
} finally {
  await client.close();
}
