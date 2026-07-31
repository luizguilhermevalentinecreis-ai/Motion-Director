import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { animationDraftSchema, type AnimationDraft } from "../src/domain.js";

type V3 = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";

const name = "MD_R6_DrifterSurvivalWalk_120";
const duration = 1.6;
const fps = 120;
const timelineFrames = duration * fps;
const globalKeyCount = 39;
const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const frameNumbers = Array.from(
  { length: globalKeyCount },
  (_, index) => Math.round((index * timelineFrames) / (globalKeyCount - 1)),
);

assert.equal(timelineFrames, 192);
assert.equal(frameNumbers.length, 39);
assert.equal(new Set(frameNumbers).size, 39);
assert.equal(frameNumbers[0], 0);
assert.equal(frameNumbers.at(-1), 192);

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const wave = (n: number, cycles = 1, phase = 0) =>
  Math.sin(Math.PI * 2 * (n * cycles + phase));
const cosine = (n: number, cycles = 1, phase = 0) =>
  Math.cos(Math.PI * 2 * (n * cycles + phase));

function quaternion([xDegrees, yDegrees, zDegrees]: V3) {
  const x = radians(xDegrees) * 0.5;
  const y = radians(yDegrees) * 0.5;
  const z = radians(zDegrees) * 0.5;
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

function poseAt(n: number): {
  position: Record<Joint, V3>;
  rotation: Record<Joint, V3>;
} {
  // Two low, delayed compressions per loop: each arrives just after heel contact.
  const contactCompression = Math.max(0, cosine(n, 2, -0.075));
  const vertical =
    -0.074
    - 0.028 * contactCompression
    + 0.008 * cosine(n, 2, 0.19)
    + 0.0025 * wave(n, 4, 0.08);

  // The stride remains restrained and uses a second harmonic to avoid a pendulum look.
  const rightLeg =
    20.5 * cosine(n, 1, 0)
    + 2.4 * wave(n, 2, -0.04)
    + 0.8 * wave(n, 3, 0.11);
  const leftLeg =
    -20.5 * cosine(n, 1, 0)
    - 2.2 * wave(n, 2, 0.02)
    - 0.7 * wave(n, 3, 0.11);

  // Arms counter the legs but trail the hips. Unequal amplitudes imply carried gear.
  const rightArm =
    -15.7 * cosine(n, 1, -0.045)
    - 1.7 * wave(n, 2, -0.08)
    + 2.2;
  const leftArm =
    18.2 * cosine(n, 1, -0.035)
    + 1.9 * wave(n, 2, -0.04)
    + 0.6;

  const torsoYaw = -3.1 * wave(n, 1, 0.015) - 0.45 * wave(n, 2, 0.1);
  const torsoRoll = -1.55 * cosine(n, 1, 0.02) - 0.28 * wave(n, 2, 0.12);
  const torsoPitch =
    -6.15
    - 0.62 * contactCompression
    + 0.33 * wave(n, 2, 0.21)
    + 0.16 * wave(n, 4, -0.1);

  // Head stabilizes the gaze but is not mechanically locked to the torso.
  const headPitch =
    3.35
    + 0.31 * wave(n, 2, -0.03)
    + 0.13 * wave(n, 4, 0.17);
  const headYaw = -0.68 * torsoYaw + 0.22 * wave(n, 2, -0.15);
  const headRoll = -0.56 * torsoRoll + 0.11 * wave(n, 3, 0.08);

  const lateralWeight = 0.017 * wave(n, 1, 0.25) + 0.003 * wave(n, 2, -0.1);
  const foreAft = -0.013 - 0.006 * cosine(n, 2, -0.04);

  return {
    position: {
      Torso: [lateralWeight, vertical, foreAft],
      Head: [0, 0, 0],
      "Right Arm": [0, 0, 0],
      "Left Arm": [0, 0, 0],
      "Right Leg": [0, 0, 0],
      "Left Leg": [0, 0, 0],
    },
    rotation: {
      Torso: [torsoPitch, torsoYaw, torsoRoll],
      Head: [headPitch, headYaw, headRoll],
      "Right Arm": [rightArm, -1.4 + 0.7 * wave(n, 1, 0.12), 3.2 + 0.6 * wave(n, 2, 0.1)],
      "Left Arm": [leftArm, 1.1 + 0.6 * wave(n, 1, -0.08), -2.7 - 0.5 * wave(n, 2, 0.04)],
      "Right Leg": [rightLeg, -0.55 * wave(n, 1), 0.75 - 0.4 * wave(n, 1, 0.25)],
      "Left Leg": [leftLeg, 0.55 * wave(n, 1), -0.75 + 0.4 * wave(n, 1, 0.25)],
    },
  };
}

const samples = frameNumbers.map((frame) => {
  const normalized = frame / timelineFrames;
  return {
    frame,
    time: frame / fps,
    normalized,
    pose: poseAt(frame === timelineFrames ? 0 : normalized),
  };
});

const first = samples[0]!.pose;
const last = samples.at(-1)!.pose;
assert.deepEqual(last, first, "loop must close exactly");
assert.equal(samples.length * joints.length, 234);
for (const sample of samples) {
  assert.ok(sample.pose.rotation["Right Leg"][0] <= 24);
  assert.ok(sample.pose.rotation["Right Leg"][0] >= -24);
  assert.ok(sample.pose.rotation["Left Leg"][0] <= 24);
  assert.ok(sample.pose.rotation["Left Leg"][0] >= -24);
  assert.ok(sample.pose.position.Torso[1] <= -0.035, "center of mass rose too high");
  for (const joint of joints.slice(1)) {
    assert.deepEqual(sample.pose.position[joint]!, [0, 0, 0], `${joint} left its pivot`);
  }
}
for (const normalized of [0, 0.5]) {
  const pose = poseAt(normalized);
  assert.ok(
    pose.rotation["Right Leg"][0] * pose.rotation["Left Leg"][0] < 0,
    "legs must oppose at contact",
  );
  assert.ok(
    pose.rotation["Right Arm"][0] * pose.rotation["Right Leg"][0] < 0,
    "right arm must counter the right leg",
  );
  assert.ok(
    pose.rotation["Left Arm"][0] * pose.rotation["Left Leg"][0] < 0,
    "left arm must counter the left leg",
  );
}

const draft: AnimationDraft = animationDraftSchema.parse({
  name,
  rigId: "selection:1",
  duration,
  framesPerSecond: fps,
  looped: true,
  priority: "movement",
  beats: [
    {
      id: "right_contact_compression",
      label: "Right contact and weighted compression",
      startTime: 0,
      endTime: 0.2,
      intention: "Accept weight without bouncing; keep the feet close to the ground.",
      energy: 0.38,
      leadingBodyPart: "Right Leg",
    },
    {
      id: "left_passage_recovery",
      label: "Left passage and restrained recovery",
      startTime: 0.2,
      endTime: 0.8,
      intention: "Let the left leg pass low while torso and carried weight lag subtly.",
      energy: 0.44,
      leadingBodyPart: "Left Leg",
    },
    {
      id: "left_contact_compression",
      label: "Left contact and weighted compression",
      startTime: 0.8,
      endTime: 1,
      intention: "Mirror support without erasing the equipment-driven asymmetry.",
      energy: 0.38,
      leadingBodyPart: "Left Leg",
    },
    {
      id: "right_passage_loop_recovery",
      label: "Right passage and loop recovery",
      startTime: 1,
      endTime: 1.6,
      intention: "Recover into the exact opening silhouette with continuous micro-motion.",
      energy: 0.44,
      leadingBodyPart: "Right Leg",
    },
  ],
  contacts: [
    {
      id: "right_grounded",
      effector: "Right Leg",
      target: "Ground",
      startTime: 0,
      endTime: 0.26,
      positionWeight: 1,
      rotationWeight: 0.2,
      allowSlideMeters: 0.012,
    },
    {
      id: "left_grounded",
      effector: "Left Leg",
      target: "Ground",
      startTime: 0.8,
      endTime: 1.06,
      positionWeight: 1,
      rotationWeight: 0.2,
      allowSlideMeters: 0.012,
    },
  ],
  tracks: joints.map((joint) => ({
    joint,
    space: "parent",
    keys: samples.map((sample) => ({
      time: sample.time,
      transform: {
        position: {
          x: sample.pose.position[joint][0],
          y: sample.pose.position[joint][1],
          z: sample.pose.position[joint][2],
        },
        rotation: quaternion(sample.pose.rotation[joint]),
      },
      easing: { style: "cubicV2", direction: "inOut" },
      weight: 1,
    })),
  })),
  metadata: {
    intent:
      "Original heavy survival-drama R6 walk inspired by grounded motion-captured third-person locomotion: low COM, low foot clearance, restrained stride, equipment asymmetry, delayed arms, continuous torso and head micro-motion, and exact loop closure.",
    rigType: "R6",
    style: [
      "r6",
      "grounded-survival",
      "motion-capture-inspired",
      "low-center-of-mass",
      "low-foot-clearance",
      "restrained-stride",
      "equipment-weight",
      "continuous-microvariation",
      "cubicV2",
      "human-review-required",
    ],
    version: 1,
  },
});

const environment = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);
const client = new Client({ name: "motion-director-drifter-walk", version: "1.0.0" });
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
    (item): item is { type: "text"; text: string } =>
      Boolean(
        item
          && typeof item === "object"
          && "type" in item
          && item.type === "text"
          && "text" in item
          && typeof item.text === "string",
      ),
  );
  return block?.text ?? "";
}

async function call(nameOfTool: string, argumentsValue: Record<string, unknown>) {
  const result = await client.callTool({ name: nameOfTool, arguments: argumentsValue });
  if (result.isError) throw new Error(textResult(result));
  return JSON.parse(textResult(result)) as unknown;
}

try {
  await client.connect(transport);
  let connected = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await call("studio_status", {}) as { connected: boolean };
    if (status.connected) {
      connected = true;
      break;
    }
    await sleep(500);
  }
  assert.ok(connected, "Motion Director plugin did not connect in LOCAL MCP mode.");

  const capabilities = await call("studio_animation_capabilities", {});
  const validation = await call("validate_animation_draft", { draft });
  const staged = await call("stage_animation_draft", {
    transactionName: "Grounded survival drifter walk 120 FPS",
    draft,
  }) as { transactionId: string };
  const committed = await call("commit_animation_draft", {
    transactionId: staged.transactionId,
    destinationName: name,
  });
  const attached = await call("attach_committed_animations_to_selected_rig_animsaves", {
    namePrefix: name,
  });

  process.stdout.write(JSON.stringify({
    name,
    duration,
    fps,
    globalTimes: samples.length,
    tracks: joints.length,
    totalKeys: samples.length * joints.length,
    frameNumbers,
    torsoPitchRange: [
      Math.min(...samples.map((sample) => sample.pose.rotation.Torso[0])),
      Math.max(...samples.map((sample) => sample.pose.rotation.Torso[0])),
    ].map((value) => Number(value.toFixed(3))),
    legSwingRange: [
      Math.min(...samples.flatMap((sample) => [
        sample.pose.rotation["Right Leg"][0],
        sample.pose.rotation["Left Leg"][0],
      ])),
      Math.max(...samples.flatMap((sample) => [
        sample.pose.rotation["Right Leg"][0],
        sample.pose.rotation["Left Leg"][0],
      ])),
    ].map((value) => Number(value.toFixed(3))),
    capabilities,
    validation,
    staged,
    committed,
    attached,
  }, null, 2));
} finally {
  await client.close();
}
