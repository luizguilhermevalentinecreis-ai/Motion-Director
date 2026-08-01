import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { draftFromBlueprint } from "../src/draft-authoring.js";

type V3 = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type Pose = { position: Record<Joint, V3>; rotation: Record<Joint, V3> };

const dryRun = process.env.DRY === "1";
const name = "MD_R6_SignatureRun_60_V1";
const rigId = process.env.MOTION_RIG_ID ?? "Workspace.R6 [Dummy]";
const duration = 0.5;
const fps = 60;
const timelineFrames = duration * fps;
const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];

// One authored key per frame. The curves below are already the finished motion,
// so the bake samples them rather than interpolating between sparse extremes.
const frameNumbers = Array.from({ length: timelineFrames + 1 }, (_, index) => index);
assert.equal(timelineFrames, 30);

const tau = Math.PI * 2;
const sin = (n: number, cycles = 1, phase = 0) => Math.sin(tau * (n * cycles + phase));
const cos = (n: number, cycles = 1, phase = 0) => Math.cos(tau * (n * cycles + phase));

function poseAt(n: number): Pose {
  // Two foot strikes per stride, at n=0 (right) and n=0.5 (left). Squaring a
  // cosine keeps the pulse smooth at both the strike and the flight apex
  // instead of kinking at the valley like a clipped half-wave.
  const strikeBase = 0.5 + 0.5 * cos(n, 2, -0.028);
  const strike = strikeBase * strikeBase;
  const flight = 1 - strike;

  // The first harmonic carries the stride. The second makes swing recovery
  // faster than the stance drive, which is what separates a real run from a
  // walk played at double speed. Its phase is tuned so the harmonics do not
  // sharpen the two swing reversals into a one-frame hitch; a leg reversing
  // this fast is already near the smoothest profile 60 fps can represent.
  // Mirroring by half a cycle keeps even harmonics' sign and flips odd ones.
  const rightLeg = 33.5 * cos(n) + 5 * sin(n, 2, 0.09) + 1.2 * sin(n, 3, 0.05);
  const leftLeg = -32.6 * cos(n) + 4.9 * sin(n, 2, 0.12) - 1.15 * sin(n, 3, 0.05);

  const swing = sin(n, 1, 0.03);
  const rightSwingLift = 0.04 + 0.04 * swing;
  const leftSwingLift = 0.04 - 0.04 * swing;

  // Arms lag the legs by a twentieth of a cycle so the upper body drags behind
  // the drive instead of snapping with it.
  const rightArmPitch = -44 * cos(n, 1, -0.05) - 5.5 * sin(n, 2, -0.07) - 7.5;
  const leftArmPitch = 43 * cos(n, 1, -0.04) + 5.2 * sin(n, 2, -0.02) - 6.5;
  const shoulderFlare = 1.4 * strike;

  const torsoYaw = -4 * sin(n, 1, 0.02) - 0.5 * sin(n, 2, 0.08);
  const torsoRoll = -1.5 * cos(n, 1, 0.03) - 0.25 * sin(n, 2, 0.1);
  const torsoPitch = -9 - 1.5 * strike + 0.55 * sin(n, 2, 0.16) + 0.2 * sin(n, 4, -0.06);

  // The gaze stays level and forward: the head cancels most of the torso lean
  // and counter-rotates the yaw, then lags a beat behind the vertical bob.
  const headPitch = 5.6 + 0.45 * sin(n, 2, -0.05) + 0.15 * sin(n, 4, 0.12);
  const headYaw = -0.45 * torsoYaw + 0.2 * sin(n, 2, -0.1);
  const headRoll = -0.4 * torsoRoll + 0.08 * sin(n, 3, 0.03);

  return {
    position: {
      // R6 legs cannot bend, so the root carries every bit of compression:
      // deepest at each strike, highest at each flight apex.
      Torso: [
        0.016 * sin(n, 1, 0.25) + 0.003 * sin(n, 2, -0.07),
        -0.255 - 0.1 * strike + 0.05 * flight,
        -0.115 - 0.015 * cos(n, 2, -0.03),
      ],
      Head: [0, 0, 0],
      // A small drop and inward tuck reads as a carried, bent running arm on a
      // rigid limb that has no elbow.
      "Right Arm": [
        0.014 + 0.005 * strike,
        -0.165 - 0.03 * strike,
        -0.085 + 0.016 * sin(n, 1, -0.05),
      ],
      "Left Arm": [
        -0.016 - 0.005 * strike,
        -0.17 - 0.032 * strike,
        -0.09 - 0.015 * sin(n, 1, -0.035),
      ],
      "Right Leg": [0, rightSwingLift, -0.1 * cos(n) - 0.014 * sin(n, 2, -0.05)],
      "Left Leg": [0, leftSwingLift, 0.098 * cos(n) + 0.013 * sin(n, 2, 0.03)],
    },
    rotation: {
      Torso: [torsoPitch, torsoYaw, torsoRoll],
      Head: [headPitch, headYaw, headRoll],
      "Right Arm": [rightArmPitch, -14 + 3.2 * sin(n, 1, -0.08), 4.5 + shoulderFlare],
      "Left Arm": [leftArmPitch, 13 + 3 * sin(n, 1, -0.02), -4.8 - shoulderFlare],
      "Right Leg": [rightLeg, -1.2 - 0.6 * sin(n), 1 - 0.5 * sin(n, 1, 0.25)],
      "Left Leg": [leftLeg, 1.2 + 0.6 * sin(n), -1 + 0.5 * sin(n, 1, 0.25)],
    },
  };
}

const samples = frameNumbers.map((frame) => ({
  time: frame / fps,
  // Sampling n=0 again on the closing frame makes the loop seam exact.
  pose: poseAt(frame === timelineFrames ? 0 : frame / timelineFrames),
}));

assert.deepEqual(samples[0]!.pose, samples.at(-1)!.pose, "loop must close exactly");
for (const n of [0, 0.5]) {
  const pose = poseAt(n);
  assert.ok(pose.rotation["Right Leg"][0] * pose.rotation["Left Leg"][0] < 0, "legs must oppose");
  assert.ok(pose.rotation["Right Arm"][0] * pose.rotation["Right Leg"][0] < 0, "right arm opposes right leg");
  assert.ok(pose.rotation["Left Arm"][0] * pose.rotation["Left Leg"][0] < 0, "left arm opposes left leg");
}

// The lean metric reads pitch off the composed quaternion, not the authored
// Euler value, so the envelope is checked against what the rubric will see.
const worstTorsoPitch = Math.max(...samples.map((sample) => Math.abs(sample.pose.rotation.Torso[0])));
assert.ok(worstTorsoPitch <= 11.5, `torso lean ${worstTorsoPitch} exceeds the run envelope`);
const worstLimbOffset = Math.max(
  ...samples.flatMap((sample) =>
    joints
      .filter((joint) => joint !== "Torso")
      .map((joint) => Math.hypot(...sample.pose.position[joint])),
  ),
);
assert.ok(worstLimbOffset <= 0.5, `limb offset ${worstLimbOffset} exceeds the locomotion envelope`);

const blueprint = {
  name,
  rigId,
  rigType: "R6" as const,
  duration,
  framesPerSecond: fps,
  looped: true,
  priority: "movement" as const,
  intent:
    "A grounded athletic R6 run cycle: two strikes and two flight phases per stride, compression carried entirely by the root because R6 legs are rigid, arms dragging a frame behind the leg drive, and a level forward gaze held through the vertical bob.",
  style: [
    "r6",
    "run",
    "grounded-athletic",
    "flight-phase",
    "root-carried-compression",
    "arm-drag-overlap",
    "stabilized-gaze",
    "dense-sampled",
    "linear-inbetweens",
    "60fps",
    "human-review-required",
  ],
  beats: [
    {
      id: "right-strike-absorb",
      label: "Right strike and absorb",
      startTime: 0,
      endTime: 0.125,
      intention: "Catch the falling mass on the right leg and sink the root to stand in for a knee that cannot bend.",
      energy: 0.72,
      leadingBodyPart: "Right Leg",
      focalTarget: "Forward travel line",
    },
    {
      id: "right-drive-flight",
      label: "Right drive into flight",
      startTime: 0.125,
      endTime: 0.25,
      intention: "Extend off the right leg, lift the root to the apex, and let the left arm reach its forward peak a beat late.",
      energy: 0.85,
      leadingBodyPart: "Torso",
      focalTarget: "Forward travel line",
    },
    {
      id: "left-strike-absorb",
      label: "Left strike and absorb",
      startTime: 0.25,
      endTime: 0.375,
      intention: "Mirror the landing without mirroring the upper body exactly, so the cycle never reads as a rotating machine.",
      energy: 0.72,
      leadingBodyPart: "Left Leg",
      focalTarget: "Forward travel line",
    },
    {
      id: "left-drive-flight",
      label: "Left drive into flight",
      startTime: 0.375,
      endTime: 0.5,
      intention: "Drive off the left leg and close the loop with the same velocity the cycle started with.",
      energy: 0.85,
      leadingBodyPart: "Torso",
      focalTarget: "Forward travel line",
    },
  ],
  contacts: [
    {
      id: "right-stance-a",
      effector: "Right Leg",
      target: "Ground",
      startTime: 0,
      endTime: 0.06,
      positionWeight: 1,
      rotationWeight: 0.35,
      allowSlideMeters: 0.012,
    },
    {
      id: "left-stance",
      effector: "Left Leg",
      target: "Ground",
      startTime: 0.19,
      endTime: 0.31,
      positionWeight: 1,
      rotationWeight: 0.35,
      allowSlideMeters: 0.012,
    },
    {
      id: "right-stance-b",
      effector: "Right Leg",
      target: "Ground",
      startTime: 0.44,
      endTime: 0.5,
      positionWeight: 1,
      rotationWeight: 0.35,
      allowSlideMeters: 0.012,
    },
  ],
  tracks: joints.map((joint) => ({
    joint,
    space: "parent" as const,
    keys: samples.map((sample) => ({
      time: sample.time,
      position: {
        x: sample.pose.position[joint][0],
        y: sample.pose.position[joint][1],
        z: sample.pose.position[joint][2],
      },
      rotationDegrees: {
        x: sample.pose.rotation[joint][0],
        y: sample.pose.rotation[joint][1],
        z: sample.pose.rotation[joint][2],
      },
      // These samples already sit on the intended curve. Linear inbetweens keep
      // the velocity continuous instead of restarting ease-in/out every frame.
      easing: { style: "linear" as const, direction: "inOut" as const },
      weight: 1,
    })),
  })),
};

const draft = draftFromBlueprint(blueprint);


const client = new Client({ name: "motion-director-signature-run", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/src/index.js"],
  cwd: process.cwd(),
  env: Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  ),
  stderr: "pipe",
});

function payload(result: { content?: unknown }): any {
  const first = (result.content as { type: string; text: string }[] | undefined)?.[0];
  if (!first) return undefined;
  try {
    return JSON.parse(first.text);
  } catch {
    return first.text;
  }
}

async function call(tool: string, args: Record<string, unknown>): Promise<any> {
  const result = await client.callTool({ name: tool, arguments: args });
  if (result.isError) throw new Error(`${tool}: ${JSON.stringify(result.content)}`);
  return payload(result as { content?: unknown });
}

try {
  await client.connect(transport);

  const validation = await call("validate_animation_draft", { draft });
  const report = validation.report;
  process.stdout.write(
    `\nvalid=${validation.valid}  overallScore=${report.overallScore.toFixed(4)}\n` +
      `keys=${samples.length * joints.length} (${samples.length} per joint x ${joints.length} joints)\n\n` +
      report.metrics
        .map(
          (metric: any) =>
            `  ${metric.score.toFixed(3)}  ${metric.severity.padEnd(7)} ${metric.name}` +
            (metric.joints.length > 0 ? `  [${metric.joints.join(", ")}]` : "") +
            `\n         ${metric.explanation}` +
            (metric.suggestedAction ? `\n         -> ${metric.suggestedAction}` : ""),
        )
        .join("\n") +
      `\n\nblockingIssues: ${JSON.stringify(report.blockingIssues)}\n`,
  );

  if (dryRun) {
    process.stdout.write("\nDRY run: nothing was sent to Studio.\n");
  } else {
    // This server owns the bridge port, so the plugin has to re-handshake to it.
    let status = await call("studio_status", {});
    for (let attempt = 0; attempt < 20 && !status.connected; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      status = await call("studio_status", {});
    }
    if (!status.connected) throw new Error("Roblox Studio never reconnected to the bridge.");
    process.stdout.write(`\nstudio: ${status.session.placeName} (plugin ${status.session.pluginVersion})\n`);
    const staged = await call("stage_animation_draft", {
      transactionName: "R6 signature run cycle",
      draft,
    });
    process.stdout.write(`\nstaged: ${JSON.stringify(staged)}\n`);

    const committed = await call("commit_animation_draft", {
      transactionId: staged.transactionId,
      destinationName: name,
    });
    process.stdout.write(`committed: ${JSON.stringify(committed)}\n`);

    const attached = await call("attach_committed_animations_to_selected_rig_animsaves", {
      namePrefix: name,
    });
    process.stdout.write(`attached: ${JSON.stringify(attached)}\n`);
  }
} finally {
  await client.close();
}
