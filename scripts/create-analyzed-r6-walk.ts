import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { animationDraftSchema, type AnimationDraft } from "../src/domain.js";

type V3 = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";
type Phase = {
  n: number;
  name: string;
  support: "right" | "left" | "double";
  position: Partial<Record<Joint, V3>>;
  rotation: Record<Joint, V3>;
};

const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const zero = (): Record<Joint, V3> => ({
  Torso: [0, 0, 0],
  Head: [0, 0, 0],
  "Right Arm": [0, 0, 0],
  "Left Arm": [0, 0, 0],
  "Right Leg": [0, 0, 0],
  "Left Leg": [0, 0, 0],
});

// Original walk informed by Walk4's body relationships, not by copying its poses:
// alternating support, short absorption, contralateral swing, quiet COM and exact closure.
const plan: Phase[] = [
  {
    n: 0, name: "right_contact", support: "right",
    position: { Torso: [-0.012, -0.045, -0.012] },
    rotation: {
      Torso: [-3.5, -2.5, -1.5], Head: [1.5, 1.8, 0.8],
      "Right Arm": [-20, -2, 3], "Left Arm": [20, 2, -3],
      "Right Leg": [25, -1, 1], "Left Leg": [-25, 1, -1],
    },
  },
  {
    n: 0.10, name: "right_absorption", support: "double",
    position: { Torso: [-0.016, -0.070, -0.006] },
    rotation: {
      Torso: [-4, -1.5, -1], Head: [1.8, 1, 0.5],
      "Right Arm": [-15, -1, 2], "Left Arm": [15, 1, -2],
      "Right Leg": [17, -0.5, 1], "Left Leg": [-18, 0.5, -1],
    },
  },
  {
    n: 0.25, name: "right_passing", support: "right",
    position: { Torso: [-0.006, -0.012, 0.010] },
    rotation: {
      Torso: [-2.5, 0, -0.5], Head: [1.2, 0, 0.2],
      "Right Arm": [1, 0, 2], "Left Arm": [-1, 0, -2],
      "Right Leg": [-4, 0, 0.5], "Left Leg": [7, 0, -0.5],
    },
  },
  {
    n: 0.39, name: "right_high_point", support: "right",
    position: { Torso: [0.004, 0.008, 0.004] },
    rotation: {
      Torso: [-2, 2, 1], Head: [1, -1.5, -0.5],
      "Right Arm": [15, 1.5, 3], "Left Arm": [-15, -1.5, -3],
      "Right Leg": [-19, 0.5, 1], "Left Leg": [20, -0.5, -1],
    },
  },
  {
    n: 0.50, name: "left_contact", support: "left",
    position: { Torso: [0.012, -0.045, -0.012] },
    rotation: {
      Torso: [-3.5, 2.5, 1.5], Head: [1.5, -1.8, -0.8],
      "Right Arm": [20, 2, 3], "Left Arm": [-20, -2, -3],
      "Right Leg": [-25, 1, 1], "Left Leg": [25, -1, -1],
    },
  },
  {
    n: 0.60, name: "left_absorption", support: "double",
    position: { Torso: [0.016, -0.070, -0.006] },
    rotation: {
      Torso: [-4, 1.5, 1], Head: [1.8, -1, -0.5],
      "Right Arm": [15, 1, 2], "Left Arm": [-15, -1, -2],
      "Right Leg": [-18, 0.5, 1], "Left Leg": [17, -0.5, -1],
    },
  },
  {
    n: 0.75, name: "left_passing", support: "left",
    position: { Torso: [0.006, -0.012, 0.010] },
    rotation: {
      Torso: [-2.5, 0, 0.5], Head: [1.2, 0, -0.2],
      "Right Arm": [-1, 0, 2], "Left Arm": [1, 0, -2],
      "Right Leg": [7, 0, 0.5], "Left Leg": [-4, 0, -0.5],
    },
  },
  {
    n: 0.89, name: "left_high_point", support: "left",
    position: { Torso: [-0.004, 0.008, 0.004] },
    rotation: {
      Torso: [-2, -2, -1], Head: [1, 1.5, 0.5],
      "Right Arm": [-15, -1.5, 3], "Left Arm": [15, 1.5, -3],
      "Right Leg": [20, -0.5, 1], "Left Leg": [-19, 0.5, -1],
    },
  },
  {
    n: 1, name: "right_contact_close", support: "right",
    position: { Torso: [-0.012, -0.045, -0.012] },
    rotation: {
      Torso: [-3.5, -2.5, -1.5], Head: [1.5, 1.8, 0.8],
      "Right Arm": [-20, -2, 3], "Left Arm": [20, 2, -3],
      "Right Leg": [25, -1, 1], "Left Leg": [-25, 1, -1],
    },
  },
];

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const n = clamp(value);
  return n * n * (3 - 2 * n);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function poseAt(n: number) {
  let a = plan[0]!;
  let b = plan[1]!;
  for (let i = 1; i < plan.length; i += 1) {
    b = plan[i]!;
    if (n <= b.n) {
      a = plan[i - 1]!;
      break;
    }
  }
  const t = smooth((n - a.n) / Math.max(1e-6, b.n - a.n));
  const position = zero();
  const rotation = zero();
  for (const joint of joints) {
    const pa = a.position[joint] ?? [0, 0, 0];
    const pb = b.position[joint] ?? [0, 0, 0];
    position[joint] = pa.map((value, axis) => mix(value, pb[axis]!, t)) as V3;
    rotation[joint] = a.rotation[joint].map(
      (value, axis) => mix(value, b.rotation[joint][axis]!, t),
    ) as V3;
  }
  return { position, rotation };
}
function quaternion([xd, yd, zd]: V3) {
  const x = xd * Math.PI / 360;
  const y = yd * Math.PI / 360;
  const z = zd * Math.PI / 360;
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

for (const phase of plan) {
  for (const joint of joints) {
    assert.ok(joint === "Torso" || phase.position[joint] === undefined,
      `${phase.name}: ${joint} cannot translate away from its pivot`);
  }
  assert.ok(Math.abs(phase.rotation.Torso[0]) <= 4, `${phase.name}: excessive torso lean`);
}
for (const phase of [plan[0]!, plan[4]!]) {
  assert.ok(phase.rotation["Right Leg"][0] * phase.rotation["Left Leg"][0] < 0,
    `${phase.name}: legs must oppose`);
  assert.ok(phase.rotation["Right Arm"][0] * phase.rotation["Right Leg"][0] < 0,
    `${phase.name}: right arm must counter right leg`);
  assert.ok(phase.rotation["Left Arm"][0] * phase.rotation["Left Leg"][0] < 0,
    `${phase.name}: left arm must counter left leg`);
}
assert.deepEqual(plan[0]!.position, plan.at(-1)!.position, "position loop closure");
assert.deepEqual(plan[0]!.rotation, plan.at(-1)!.rotation, "rotation loop closure");

const duration = 0.90;
const fps = 60;
const frameCount = Math.round(duration * fps);
const name = "MD_ANALYZED_R6_01_NaturalWalk";
const draft: AnimationDraft = animationDraftSchema.parse({
  name,
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
    intention: `${phase.support} support; preserve gait opposition and a quiet center of mass`,
    energy: phase.support === "double" ? 0.35 : 0.48,
    leadingBodyPart: phase.support === "right" ? "Right Leg" :
      phase.support === "left" ? "Left Leg" : "Torso",
  })),
  contacts: [
    { id: "right_contact", effector: "Right Leg", target: "ground", startTime: 0, endTime: 0.13, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.02 },
    { id: "left_contact", effector: "Left Leg", target: "ground", startTime: 0.45, endTime: 0.58, positionWeight: 1, rotationWeight: 0, allowSlideMeters: 0.02 },
  ],
  tracks: joints.map((joint) => ({
    joint,
    space: "parent",
    keys: Array.from({ length: frameCount + 1 }, (_, index) => {
      const n = index / frameCount;
      const pose = poseAt(n);
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
    intent: "Original restrained R6 walk derived from professional gait relationships, with fixed limb pivots",
    rigType: "R6",
    style: [
      "r6", "analyzed-reference", "original", "natural-walk", "parent-space",
      "fixed-limb-pivots", "contralateral-gait", "human-review-required",
    ],
    version: 1,
  },
});

const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const client = new Client({ name: "motion-director-analyzed-r6-walk", version: "0.2.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/src/index.js"],
  cwd: process.cwd(),
  env: environment,
  stderr: "pipe",
});
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function text(result: unknown): string {
  const content = result && typeof result === "object" && "content" in result
    ? (result as { content?: unknown }).content : undefined;
  const block = Array.isArray(content)
    ? content.find((item): item is { type: "text"; text: string } =>
        Boolean(item && typeof item === "object" && "type" in item &&
          item.type === "text" && "text" in item && typeof item.text === "string"))
    : undefined;
  return block?.text ?? "";
}
async function call(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(text(result));
  return JSON.parse(text(result)) as unknown;
}

try {
  await client.connect(transport);
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await call("studio_status", {}) as { connected: boolean };
    if (status.connected) {
      ready = true;
      break;
    }
    await sleep(500);
  }
  assert.ok(ready, "Motion Director did not connect to Studio");

  const validation = await call("validate_animation_draft", { draft });
  process.stdout.write(`VALIDATION ${JSON.stringify(validation)}\n`);
  const staged = await call("stage_animation_draft", {
    transactionName: "Analyzed original R6 natural walk",
    draft,
  }) as { transactionId: string };
  const committed = await call("commit_animation_draft", {
    transactionId: staged.transactionId,
    destinationName: name,
  });
  const attached = await call("attach_committed_animations_to_selected_rig_animsaves", {
    namePrefix: "MD_ANALYZED_R6_",
  });
  process.stdout.write(JSON.stringify({ committed, attached }, null, 2));
} finally {
  await client.close();
}
