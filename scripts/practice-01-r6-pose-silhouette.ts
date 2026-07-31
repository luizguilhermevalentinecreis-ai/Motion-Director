import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { animationDraftSchema, type AnimationDraft } from "../src/domain.js";

type V3 = [number, number, number];
type Joint = "Torso" | "Head" | "Right Arm" | "Left Arm" | "Right Leg" | "Left Leg";

const joints: Joint[] = ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
const zero: V3 = [0, 0, 0];

interface DesignedPose {
  time: number;
  position?: Partial<Record<Joint, V3>>;
  rotation: Record<Joint, V3>;
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

// These are deliberately held thumbnail poses. Their job is communication,
// silhouette, weight, and contrast—not smooth movement.
const poses: DesignedPose[] = [
  {
    time: 0,
    position: {
      Torso: [0.16, -0.13, -0.015],
      "Right Arm": [0.015, 0.035, -0.035],
      "Left Arm": [-0.035, 0.015, -0.075],
      "Right Leg": [0.025, 0.025, -0.015],
      "Left Leg": [-0.085, -0.015, 0.045],
    },
    rotation: {
      // Authority comes from a quiet supporting side and a broad, low shoulder
      // line—not from lifting both arms into an unexplained gesture.
      Torso: [-5, -27, -5],
      Head: [4, 20, 3],
      "Right Arm": [4, -4, 6],
      "Left Arm": [18, 7, -11],
      "Right Leg": [2, -4, 3],
      "Left Leg": [-14, 7, -8],
    },
  },
  {
    time: 1.4,
    position: {
      Torso: [-0.13, -0.3, -0.2],
      "Right Arm": [-0.1, 0.055, -0.18],
      "Left Arm": [0.055, 0.075, 0.015],
      "Right Leg": [0.085, 0.07, -0.115],
      "Left Leg": [-0.085, -0.035, 0.085],
    },
    rotation: {
      // The leading arm, head, chest, and forward leg form one advancing wedge.
      // The trailing arm opens negative space instead of creating a second guard.
      Torso: [-24, 12, -10],
      Head: [15, -12, 7],
      "Right Arm": [43, -14, -24],
      "Left Arm": [10, 8, 24],
      "Right Leg": [29, -7, 8],
      "Left Leg": [-23, 9, -10],
    },
  },
  {
    time: 2.8,
    position: {
      Torso: [0.14, -0.32, -0.24],
      Head: [0, 0, 0],
      "Right Arm": [0, 0, 0],
      "Left Arm": [0, 0, 0],
      "Right Leg": [0, 0, 0],
      "Left Leg": [0, 0, 0],
    },
    rotation: {
      // Roblox-native posing: only the torso/root translates. Connected parts
      // remain on their actual pivots and use rotation to create the silhouette.
      Torso: [-55, -10, 13],
      Head: [35, 9, -13],
      "Right Arm": [53, -5, -11],
      "Left Arm": [63, 8, 17],
      "Right Leg": [55, -4, 8],
      "Left Leg": [90, 10, -15],
    },
  },
  {
    time: 4.2,
    position: {
      Torso: [0.14, -0.32, -0.24],
      Head: [0, 0, 0],
      "Right Arm": [0, 0, 0],
      "Left Arm": [0, 0, 0],
      "Right Leg": [0, 0, 0],
      "Left Leg": [0, 0, 0],
    },
    rotation: {
      Torso: [-55, -10, 13],
      Head: [35, 9, -13],
      "Right Arm": [53, -5, -11],
      "Left Arm": [63, 8, 17],
      "Right Leg": [55, -4, 8],
      "Left Leg": [90, 10, -15],
    },
  },
];

const draft: AnimationDraft = animationDraftSchema.parse({
  name: "MD_Study01_R6_PoseSilhouette_Blocking",
  rigId: "selection:1",
  duration: 4.2,
  framesPerSecond: 24,
  looped: false,
  priority: "action",
  beats: [
    {
      id: "authority",
      label: "Heavy authority",
      startTime: 0,
      endTime: 1.4,
      intention: "Own the space through a relaxed asymmetrical stance and quiet gaze.",
      energy: 0.3,
      leadingBodyPart: "Torso",
      focalTarget: "Forward observer",
    },
    {
      id: "threat",
      label: "Predatory threat",
      startTime: 1.4,
      endTime: 2.8,
      intention: "Invade the target's space through a low forward line and protected center.",
      energy: 0.72,
      leadingBodyPart: "Head",
      focalTarget: "Forward target",
    },
    {
      id: "resolve",
      label: "Cartoon total-body collapse",
      startTime: 2.8,
      endTime: 4.2,
      intention: "Collapse the whole body into a near-horizontal melted shape, with grounded hanging arms and one leg spilling forward.",
      energy: 0.04,
      leadingBodyPart: "Torso",
      focalTarget: "Ground between the feet",
    },
  ],
  contacts: [],
  tracks: joints.map((joint) => ({
    joint,
    space: "parent",
    keys: poses.map((pose) => {
      const position = pose.position?.[joint] ?? zero;
      return {
        time: pose.time,
        transform: {
          position: { x: position[0], y: position[1], z: position[2] },
          rotation: quaternion(pose.rotation[joint]),
        },
        easing: { style: "constant", direction: "inOut" },
        weight: 1,
      };
    }),
  })),
  metadata: {
    intent: "Stage-one R6 posing study: three contrasting thumbnail poses evaluated for meaning, silhouette, line of action, balance, contrapposto, and body language before any spline work.",
    rigType: "R6",
    style: [
      "r6",
      "pose-study",
      "silhouette-study",
      "line-of-action",
      "stepped-blocking",
      "human-review-required",
      "calibrated-r6-translation",
    ],
    version: 1,
  },
});

const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const client = new Client({ name: "motion-director-practice-01", version: "1.0.0" });
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
        Boolean(item && typeof item === "object" && "type" in item
          && item.type === "text" && "text" in item && typeof item.text === "string"))
    : undefined;
  return block?.text ?? "";
}

async function call(tool: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name: tool, arguments: args });
  if (result.isError) throw new Error(text(result));
  return JSON.parse(text(result)) as unknown;
}

try {
  await client.connect(transport);
  let connected = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if ((await call("studio_status", {}) as { connected: boolean }).connected) {
      connected = true;
      break;
    }
    await sleep(500);
  }
  assert.ok(connected, "Motion Director plugin did not connect in LOCAL MCP mode.");

  const validation = await call("validate_animation_draft", { draft });
  const staged = await call("stage_animation_draft", {
    transactionName: "Practice 01 - R6 pose and silhouette blocking",
    draft,
  }) as { transactionId: string };
  const committed = await call("commit_animation_draft", {
    transactionId: staged.transactionId,
    destinationName: draft.name,
  });
  const attached = await call("attach_committed_animations_to_selected_rig_animsaves", {
    namePrefix: draft.name,
  });

  process.stdout.write(JSON.stringify({
    name: draft.name,
    studyOrder: ["meaning", "silhouette", "line of action", "balance and weight", "contrapposto", "anatomy", "detail"],
    poseTimes: poses.map((pose) => pose.time),
    validation,
    committed,
    attached,
  }, null, 2));
} finally {
  await client.close();
}
