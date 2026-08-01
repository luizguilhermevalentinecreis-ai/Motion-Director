import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { animationDraftSchema, validateTemporalIntegrity, type AnimationDraft } from "./domain.js";
import { animationBlueprintSchema, draftFromBlueprint } from "./draft-authoring.js";
import { animationEditProgramSchema, applyAnimationEditProgram } from "./draft-editing.js";
import { animationLayerOptionsSchema, composeAnimationLayer } from "./animation-layers.js";
import {
  createGlobalKnowledgeStore,
  type GlobalKnowledgeStore,
  type KnowledgeProposalInput,
} from "./global-knowledge.js";
import { reviewDraft } from "./quality.js";

type JsonObject = Record<string, unknown>;

export type RelayActionName =
  | "createAnimationDraft"
  | "editAnimationDraft"
  | "getAnimationCapabilities"
  | "getSceneSelection"
  | "listDirectorMarkers"
  | "createIkControl"
  | "createFootLocks"
  | "auditIkContacts"
  | "removeIkControls"
  | "inspectRig"
  | "listAnimations"
  | "inspectAnimation"
  | "compareAnimations"
  | "validateAnimationDraft"
  | "stageR6ToR15Retarget"
  | "stageAnimationDraft"
  | "commitAnimationDraft"
  | "discardAnimationDraft"
  | "attachCommittedAnimations"
  | "poseCommittedAnimation"
  | "createAnimationReviewGuides"
  | "clearAnimationReviewGuides"
  | "resetRigPose";

interface ActionDefinition {
  method?: string;
  write: boolean;
  timeoutMs: number;
}

const ACTIONS: Record<RelayActionName, ActionDefinition> = {
  createAnimationDraft: { write: false, timeoutMs: 10_000 },
  editAnimationDraft: { write: false, timeoutMs: 10_000 },
  getAnimationCapabilities: { method: "system.capabilities", write: false, timeoutMs: 10_000 },
  getSceneSelection: { method: "scene.getSelection", write: false, timeoutMs: 30_000 },
  listDirectorMarkers: { method: "timeline.listMarkers", write: false, timeoutMs: 15_000 },
  createIkControl: { method: "animation.createIkControl", write: true, timeoutMs: 120_000 },
  createFootLocks: { method: "animation.createFootLocks", write: true, timeoutMs: 120_000 },
  auditIkContacts: { method: "animation.auditIkContacts", write: false, timeoutMs: 30_000 },
  removeIkControls: { method: "animation.removeIkControls", write: true, timeoutMs: 120_000 },
  inspectRig: { method: "rig.inspect", write: false, timeoutMs: 30_000 },
  listAnimations: { method: "analysis.listAnimations", write: false, timeoutMs: 120_000 },
  inspectAnimation: { method: "analysis.inspectAnimation", write: false, timeoutMs: 180_000 },
  compareAnimations: { method: "analysis.compareAnimations", write: false, timeoutMs: 180_000 },
  validateAnimationDraft: { write: false, timeoutMs: 10_000 },
  stageR6ToR15Retarget: {
    method: "animation.stageR6ToR15Retarget",
    write: true,
    timeoutMs: 300_000,
  },
  stageAnimationDraft: { method: "animation.stageDraft", write: true, timeoutMs: 120_000 },
  commitAnimationDraft: { method: "animation.commitDraft", write: true, timeoutMs: 120_000 },
  discardAnimationDraft: { method: "animation.discardDraft", write: true, timeoutMs: 30_000 },
  attachCommittedAnimations: {
    method: "animation.attachCommittedToAnimSaves",
    write: true,
    timeoutMs: 120_000,
  },
  poseCommittedAnimation: {
    method: "animation.poseCommittedAtTime",
    write: true,
    timeoutMs: 120_000,
  },
  createAnimationReviewGuides: { method: "animation.createReviewGuides", write: true, timeoutMs: 120_000 },
  clearAnimationReviewGuides: { method: "animation.clearReviewGuides", write: true, timeoutMs: 30_000 },
  resetRigPose: { method: "animation.resetSelectedRigPose", write: true, timeoutMs: 120_000 },
};

interface RelayCommand {
  id: string;
  method: string;
  params: JsonObject;
  createdAt: number;
}

interface PluginSession {
  id: string;
  installationId: string;
  launchId: string;
  tokenHash: Buffer;
  pairingCode: string;
  studioUserId?: number;
  placeId?: number;
  placeName?: string;
  pluginVersion?: string;
  connectedAt: number;
  lastSeenAt: number;
  queue: RelayCommand[];
}

interface RelayJob {
  id: string;
  sessionId: string;
  pairingCode: string;
  action: RelayActionName;
  status: "queued" | "running" | "succeeded" | "failed";
  createdAt: number;
  updatedAt: number;
  result?: unknown;
  error?: string;
  timeout?: NodeJS.Timeout;
}

interface StoredAnimationDraft {
  id: string;
  sessionId: string;
  pairingCode: string;
  draft: AnimationDraft;
  createdAt: number;
  updatedAt: number;
}

export interface WebRelayOptions {
  host?: string;
  port?: number;
  publicBaseUrl?: string;
  sessionTtlMs?: number;
  jobTtlMs?: number;
  maxPendingJobsPerSession?: number;
  knowledgeStore?: GlobalKnowledgeStore;
  knowledgeFilePath?: string;
  knowledgeRedisUrl?: string;
  knowledgeRedisToken?: string;
  knowledgeRedisKey?: string;
  developerInstallationIds?: string[];
}

const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_BODY_BYTES = 4 * 1024 * 1024;

function animationDraftOpenApiSchema(): JsonObject {
  const vector3 = {
    type: "object",
    required: ["x", "y", "z"],
    properties: {
      x: { type: "number" },
      y: { type: "number" },
      z: { type: "number" },
    },
    additionalProperties: false,
  };
  const quaternion = {
    type: "object",
    required: ["x", "y", "z", "w"],
    properties: {
      x: { type: "number" },
      y: { type: "number" },
      z: { type: "number" },
      w: { type: "number" },
    },
    additionalProperties: false,
  };
  const transform = {
    type: "object",
    required: ["position", "rotation"],
    properties: {
      position: vector3,
      rotation: quaternion,
    },
    additionalProperties: false,
  };
  const easing = {
    type: "object",
    required: ["style", "direction"],
    properties: {
      style: {
        type: "string",
        enum: ["linear", "constant", "cubic", "cubicV2", "elastic", "bounce"],
      },
      direction: { type: "string", enum: ["in", "out", "inOut"] },
    },
    additionalProperties: false,
  };
  const poseKey = {
    type: "object",
    required: ["time", "transform", "easing"],
    properties: {
      time: { type: "number", minimum: 0 },
      transform,
      easing,
      weight: { type: "number", minimum: 0, maximum: 1, default: 1 },
      tangentIn: vector3,
      tangentOut: vector3,
    },
    additionalProperties: false,
  };
  const jointTrack = {
    type: "object",
    required: ["joint", "keys"],
    properties: {
      joint: {
        type: "string",
        minLength: 1,
        description:
          "Exact animated child-part or Bone trackName reported by inspectRig; do not substitute the constraint object name.",
      },
      space: {
        type: "string",
        enum: ["local", "motor", "parent", "character", "world"],
        default: "motor",
      },
      keys: { type: "array", minItems: 1, items: poseKey },
    },
    additionalProperties: false,
  };
  const performanceBeat = {
    type: "object",
    required: ["id", "label", "startTime", "endTime", "intention", "energy"],
    properties: {
      id: { type: "string", minLength: 1 },
      label: { type: "string", minLength: 1 },
      startTime: { type: "number", minimum: 0 },
      endTime: { type: "number", minimum: 0 },
      intention: { type: "string", minLength: 1 },
      energy: { type: "number", minimum: 0, maximum: 1 },
      leadingBodyPart: { type: "string" },
      focalTarget: { type: "string" },
    },
    additionalProperties: false,
  };
  const contact = {
    type: "object",
    required: ["id", "effector", "target", "startTime", "endTime"],
    properties: {
      id: { type: "string", minLength: 1 },
      effector: { type: "string", minLength: 1 },
      target: { type: "string", minLength: 1 },
      startTime: { type: "number", minimum: 0 },
      endTime: { type: "number", minimum: 0 },
      positionWeight: { type: "number", minimum: 0, maximum: 1, default: 1 },
      rotationWeight: { type: "number", minimum: 0, maximum: 1, default: 0 },
      allowSlideMeters: { type: "number", minimum: 0, default: 0.005 },
    },
    additionalProperties: false,
  };
  return {
    type: "object",
    required: ["name", "rigId", "duration", "priority", "tracks"],
    description:
      "Complete semantic animation authored after inspecting the selected rig. Quaternion rotations use x, y, z, w.",
    properties: {
      name: { type: "string", minLength: 1 },
      rigId: {
        type: "string",
        minLength: 1,
        description: "Rig identifier or path returned by inspectRig.",
      },
      duration: { type: "number", exclusiveMinimum: 0, maximum: 300 },
      framesPerSecond: {
        type: "integer",
        minimum: 12,
        maximum: 120,
        default: 30,
      },
      bakeMode: { type: "string", enum: ["denseLinear", "poseEasing"], default: "denseLinear" },
      bakeFramesPerSecond: { type: "integer", minimum: 12, maximum: 240, default: 60 },
      looped: { type: "boolean", default: false },
      priority: {
        type: "string",
        enum: ["core", "idle", "movement", "action", "action2", "action3", "action4"],
      },
      authoredHipHeight: { type: "number" },
      beats: { type: "array", items: performanceBeat, default: [] },
      contacts: { type: "array", items: contact, default: [] },
      tracks: { type: "array", items: jointTrack },
      metadata: {
        type: "object",
        required: ["version"],
        properties: {
          intent: { type: "string" },
          rigType: { type: "string", enum: ["R6", "R15", "Custom"] },
          style: { type: "array", items: { type: "string" }, default: [] },
          version: { type: "integer", const: 1 },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  };
}

function animationBlueprintOpenApiSchema(): JsonObject {
  const vector3 = {
    type: "object",
    required: ["x", "y", "z"],
    properties: {
      x: { type: "number" },
      y: { type: "number" },
      z: { type: "number" },
    },
    additionalProperties: false,
  };
  const easing = {
    type: "object",
    required: ["style", "direction"],
    properties: {
      style: { type: "string", enum: ["linear", "constant", "cubic", "cubicV2", "elastic", "bounce"] },
      direction: { type: "string", enum: ["in", "out", "inOut"] },
    },
    additionalProperties: false,
  };
  const key = {
    type: "object",
    required: ["time", "rotationDegrees"],
    properties: {
      time: { type: "number", minimum: 0 },
      position: { ...vector3, default: { x: 0, y: 0, z: 0 } },
      rotationDegrees: {
        ...vector3,
        description: "Roblox XYZ Euler rotation in degrees. The relay converts it to a normalized quaternion.",
      },
      easing: { ...easing, default: { style: "cubicV2", direction: "inOut" } },
      weight: { type: "number", minimum: 0, maximum: 1, default: 1 },
      tangentIn: vector3,
      tangentOut: vector3,
    },
    additionalProperties: false,
  };
  return {
    type: "object",
    required: ["name", "rigId", "rigType", "duration", "priority", "intent", "tracks"],
    description:
      "Compact professional animation blueprint. Supply purposeful pose keys in Euler degrees; the relay creates and stores the complete AnimationDraft.",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      rigId: { type: "string", minLength: 1, description: "Exact selected rig path or ID returned by inspectRig." },
      rigType: { type: "string", enum: ["R6", "R15", "Custom"] },
      duration: { type: "number", exclusiveMinimum: 0, maximum: 300 },
      framesPerSecond: { type: "integer", minimum: 12, maximum: 120, default: 30 },
      bakeMode: { type: "string", enum: ["denseLinear", "poseEasing"], default: "denseLinear" },
      bakeFramesPerSecond: { type: "integer", minimum: 12, maximum: 240, default: 60 },
      looped: { type: "boolean", default: false },
      priority: { type: "string", enum: ["core", "idle", "movement", "action", "action2", "action3", "action4"] },
      authoredHipHeight: { type: "number" },
      intent: { type: "string", minLength: 1 },
      style: { type: "array", items: { type: "string" }, default: [] },
      beats: {
        type: "array",
        items: ((animationDraftOpenApiSchema() as { properties: JsonObject }).properties.beats as JsonObject).items,
        default: [],
      },
      contacts: {
        type: "array",
        items: ((animationDraftOpenApiSchema() as { properties: JsonObject }).properties.contacts as JsonObject).items,
        default: [],
      },
      tracks: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["joint", "keys"],
          properties: {
            joint: { type: "string", minLength: 1, description: "Exact track name returned by inspectRig." },
            space: { type: "string", enum: ["local", "motor", "parent", "character", "world"], default: "parent" },
            keys: { type: "array", minItems: 1, items: key },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  };
}

function actionInputOpenApiSchema(): JsonObject {
  return {
    type: "object",
    description:
      "Action-specific parameters. validateAnimationDraft requires draft. stageAnimationDraft requires transactionName and draft. stageR6ToR15Retarget converts a complete local KeyframeSequence inside Studio.",
    properties: {
      transactionName: {
        type: "string",
        minLength: 1,
        maxLength: 120,
        description:
          "Required by staging actions; names the reversible staging transaction.",
      },
      draftId: {
        type: "string",
        format: "uuid",
        description:
          "Stored draft returned by createMotionDirectorAnimationDraft. validateAnimationDraft and stageAnimationDraft accept this instead of retransmitting input.draft.",
      },
      blueprint: animationBlueprintOpenApiSchema(),
      program: z.toJSONSchema(animationEditProgramSchema, { target: "draft-2020-12" }) as JsonObject,
      draft: animationDraftOpenApiSchema(),
      transactionId: {
        type: "string",
        minLength: 1,
        maxLength: 160,
        description: "Returned by staging and required to commit or discard that draft.",
      },
      destinationName: {
        type: "string",
        minLength: 1,
        maxLength: 120,
        description: "AnimSave destination name used by commitAnimationDraft.",
      },
      namePrefix: {
        type: "string",
        maxLength: 120,
        description: "Optional prefix used when attaching committed animations.",
      },
      animationName: {
        type: "string",
        minLength: 1,
        maxLength: 120,
        description:
          "Animation name used by inspection or the committed animation name used by posing.",
      },
      sourcePath: {
        type: "string",
        description:
          "Exact KeyframeSequence path returned by listAnimations. Prefer this when names are duplicated.",
      },
      sourceRigPath: {
        type: "string",
        description:
          "Exact source R6 Model path for stageR6ToR15Retarget. May be omitted when the source rig is selected.",
      },
      targetRigPath: {
        type: "string",
        description:
          "Exact target R15 Model path for stageR6ToR15Retarget. May be omitted when both rigs are selected.",
      },
      sourceSelectionIndex: {
        type: "integer",
        minimum: 1,
        description: "One-based selected source rig index. Defaults to 1.",
      },
      targetSelectionIndex: {
        type: "integer",
        minimum: 1,
        description: "One-based selected target rig index. Defaults to 2.",
      },
      outputName: {
        type: "string",
        minLength: 1,
        maxLength: 120,
        description: "Name of the staged retargeted KeyframeSequence.",
      },
      legLateralScale: {
        type: "number",
        minimum: 0,
        maximum: 1,
        default: 0.4,
        description:
          "Scales only converted R15 upper-leg X translation after neutral rebasing.",
      },
      maxLegLateralOffset: {
        type: "number",
        minimum: 0,
        maximum: 1,
        default: 0.12,
        description: "Maximum absolute R15 upper-leg X offset in studs.",
      },
      occurrence: { type: "integer", minimum: 1 },
      rigPath: {
        type: "string",
        description: "Rig Model path required only for spatial samples, metrics, or rig topology.",
      },
      section: {
        type: "string",
        enum: ["raw", "samples", "metrics", "rig", "all"],
        default: "raw",
        description:
          "Bounded inspectAnimation response section. Use raw for exact Pose transforms without requiring a selected rig.",
      },
      normalizedTime: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Normalized pose time used by poseCommittedAnimation.",
      },
      normalizedTimes: {
        type: "array", maxItems: 16, items: { type: "number", minimum: 0, maximum: 1 },
        description: "Review times used to create Studio-native ghost poses.",
      },
      effectors: {
        type: "array", maxItems: 16, items: { type: "string", minLength: 1, maxLength: 120 },
        description: "Exact rig part names whose world-space trajectories should be visualized.",
      },
      ghostTransparency: { type: "number", minimum: 0.2, maximum: 0.95, default: 0.72 },
      maxPathSamples: { type: "integer", minimum: 2, maximum: 240, default: 120 },
      controlName: { type: "string", minLength: 1, maxLength: 120, description: "Unique IKControl name." },
      chainRootName: { type: "string", minLength: 1, maxLength: 120, description: "Exact BasePart or Bone name at the root of the IK chain." },
      endEffectorName: { type: "string", minLength: 1, maxLength: 120, description: "Exact foot, hand, part or bone name that must reach the target." },
      controlType: { type: "string", enum: ["position", "transform"], default: "transform" },
      targetPosition: { type: "object", required: ["x", "y", "z"], properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } }, additionalProperties: false },
      targetRotationDegrees: { type: "object", required: ["x", "y", "z"], properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } }, additionalProperties: false },
      poleName: { type: "string", maxLength: 120 },
      weight: { type: "number", minimum: 0, maximum: 1, default: 1 },
      smoothTime: { type: "number", minimum: 0, maximum: 2, default: 0 },
      priority: { type: "integer", minimum: -100, maximum: 100, default: 0 },
      contactKind: { type: "string", enum: ["footLock", "handLock", "aim", "prop", "custom"] },
      feet: {
        type: "array", maxItems: 8,
        items: { type: "object", required: ["controlName", "chainRootName", "endEffectorName"], properties: {
          controlName: { type: "string" }, chainRootName: { type: "string" }, endEffectorName: { type: "string" }, poleName: { type: "string" },
        }, additionalProperties: false },
      },
      raycastDistance: { type: "number", minimum: 0.1, maximum: 100, default: 8 },
      soleOffset: { type: "number", minimum: -2, maximum: 2, default: 0.05 },
      includeDescendants: { type: "boolean" },
      maxDepth: { type: "integer", minimum: 0, maximum: 30 },
      rig: { type: "string", description: "Rig path returned by scene inspection." },
      animation: {
        type: "string",
        description: "Animation or KeyframeSequence path returned by animation listing.",
      },
      animations: {
        type: "array",
        items: { type: "string" },
        description: "Animation paths to compare.",
      },
      page: { type: "integer", minimum: 1 },
      pageSize: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        default: 1,
        description: "Real page size for raw keyframes or sampled frames.",
      },
      rawStart: { type: "integer", minimum: 0 },
      rawCount: { type: "integer", minimum: 0, maximum: 10 },
      sampleStart: { type: "integer", minimum: 0 },
      sampleCount: { type: "integer", minimum: 0, maximum: 10 },
      sampleRate: { type: "number", minimum: 1, maximum: 120 },
      includeRig: { type: "boolean" },
      includeRaw: { type: "boolean" },
      includeSamples: { type: "boolean" },
      includeMetrics: { type: "boolean" },
      parts: {
        type: "array",
        maxItems: 24,
        items: { type: "string" },
        description:
          "Optional animated part names to limit sampled and raw Pose transforms.",
      },
    },
    additionalProperties: true,
  };
}

function tokenHash(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

function secureEqual(left: Buffer, right: Buffer): boolean {
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

function pairingCode(): string {
  const bytes = randomBytes(10);
  let value = "";
  for (const byte of bytes) value += PAIRING_ALPHABET[byte! % PAIRING_ALPHABET.length];
  return `${value.slice(0, 5)}-${value.slice(5)}`;
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizePairingCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(normalized) ? normalized : undefined;
}

export class MotionDirectorWebRelay {
  readonly host: string;
  readonly port: number;
  readonly publicBaseUrl: string;
  private readonly sessionTtlMs: number;
  private readonly jobTtlMs: number;
  private readonly maxPendingJobsPerSession: number;
  private readonly knowledgeStore: GlobalKnowledgeStore;
  private readonly developerInstallationIds: Set<string>;
  private server: ReturnType<typeof createServer> | undefined;
  private readonly sessions = new Map<string, PluginSession>();
  private readonly sessionByInstallation = new Map<string, string>();
  private readonly sessionByPairingCode = new Map<string, string>();
  private readonly jobs = new Map<string, RelayJob>();
  private readonly jobByCommand = new Map<string, string>();
  private readonly authoredDrafts = new Map<string, StoredAnimationDraft>();

  constructor(options: WebRelayOptions = {}) {
    this.host = options.host ?? "0.0.0.0";
    this.port = options.port ?? 34719;
    this.publicBaseUrl = (options.publicBaseUrl ?? `http://127.0.0.1:${this.port}`).replace(/\/+$/, "");
    this.sessionTtlMs = options.sessionTtlMs ?? 5 * 60_000;
    this.jobTtlMs = options.jobTtlMs ?? 15 * 60_000;
    this.maxPendingJobsPerSession = options.maxPendingJobsPerSession ?? 8;
    this.knowledgeStore = options.knowledgeStore ?? createGlobalKnowledgeStore({
      ...(options.knowledgeFilePath ? { filePath: options.knowledgeFilePath } : {}),
      ...(options.knowledgeRedisUrl ? { redisUrl: options.knowledgeRedisUrl } : {}),
      ...(options.knowledgeRedisToken ? { redisToken: options.knowledgeRedisToken } : {}),
      ...(options.knowledgeRedisKey ? { redisKey: options.knowledgeRedisKey } : {}),
    });
    this.developerInstallationIds = new Set(options.developerInstallationIds ?? []);
  }

  async start(): Promise<void> {
    if (this.server) return;
    this.server = createServer((request, response) => void this.route(request, response));
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.port, this.host, resolve);
    });
  }

  async stop(): Promise<void> {
    for (const job of this.jobs.values()) {
      if (job.timeout) clearTimeout(job.timeout);
    }
    if (!this.server) return;
    await new Promise<void>((resolve, reject) =>
      this.server!.close((error) => (error ? reject(error) : resolve())),
    );
    this.server = undefined;
  }

  private async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    this.applyHeaders(response);
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    this.cleanup();
    const url = new URL(request.url ?? "/", this.publicBaseUrl);
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        this.json(response, 200, {
          ok: true,
          service: "motion-director-web-relay",
          activeStudios: this.activeSessions().length,
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/openapi.json") {
        this.json(response, 200, this.openApiDocument());
        return;
      }
      if (request.method === "GET" && url.pathname === "/privacy") {
        this.html(response, 200, this.privacyPolicy());
        return;
      }
      if (request.method === "POST" && url.pathname === "/plugin/connect") {
        await this.pluginConnect(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/plugin/poll") {
        await this.pluginPoll(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/plugin/result") {
        await this.pluginResult(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/plugin/knowledge/resolve") {
        await this.pluginResolveKnowledge(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/knowledge/global") {
        await this.actionGlobalKnowledge(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/knowledge/propose") {
        await this.actionProposeKnowledge(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/actions/studio-status") {
        await this.actionStudioStatus(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/drafts/create") {
        await this.actionCreateAnimationDraft(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/drafts/edit") {
        await this.actionEditAnimationDraft(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/drafts/compose-layer") {
        await this.actionComposeAnimationLayer(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/actions/execute") {
        await this.actionExecute(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/actions/job") {
        await this.actionJob(request, response);
        return;
      }
      this.json(response, 404, { error: "Not found." });
    } catch (error) {
      this.json(response, 400, {
        error: error instanceof Error ? error.message : "Invalid request.",
      });
    }
  }

  private async pluginConnect(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await this.readJson(request);
    const installationId = this.requiredString(body.installationId, "installationId", 160);
    const launchId =
      typeof body.launchId === "string" && body.launchId.trim() !== ""
        ? body.launchId.trim().slice(0, 160)
        : `legacy:${installationId}`;
    const requestedPairingCode = normalizePairingCode(body.pairingCode);
    const oldId = this.sessionByInstallation.get(installationId);
    const token = randomBytes(32).toString("base64url");
    const oldSession = oldId ? this.sessions.get(oldId) : undefined;
    if (oldSession?.launchId === launchId) {
      oldSession.tokenHash = tokenHash(token);
      oldSession.lastSeenAt = Date.now();
      Object.assign(oldSession, this.optionalSessionMetadata(body));
      this.pluginConnectionResponse(response, oldSession, token);
      return;
    }
    if (oldId) this.removeSession(oldId);

    const code =
      requestedPairingCode && !this.sessionByPairingCode.has(requestedPairingCode)
        ? requestedPairingCode
        : pairingCode();
    const session: PluginSession = {
      id: randomUUID(),
      installationId,
      launchId,
      tokenHash: tokenHash(token),
      pairingCode: code,
      ...this.optionalSessionMetadata(body),
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
      queue: [],
    };
    this.sessions.set(session.id, session);
    this.sessionByInstallation.set(installationId, session.id);
    this.sessionByPairingCode.set(code, session.id);
    this.pluginConnectionResponse(response, session, token);
  }

  private pluginConnectionResponse(
    response: ServerResponse,
    session: PluginSession,
    token: string,
  ): void {
    this.json(response, 200, {
      sessionId: session.id,
      agentToken: token,
      pairingCode: session.pairingCode,
      pollIntervalMs: 500,
      expiresWithoutHeartbeatMs: this.sessionTtlMs,
      knowledgeRole: this.isKnowledgeDeveloper(session) ? "developer" : "reader",
    });
  }

  private async pluginPoll(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await this.readJson(request);
    const session = this.authenticatePlugin(body);
    if (!session) {
      this.json(response, 401, { reconnect: true, error: "Invalid or expired plugin session." });
      return;
    }
    session.lastSeenAt = Date.now();
    const command = session.queue.shift() ?? null;
    if (command) {
      const jobId = this.jobByCommand.get(command.id);
      const job = jobId ? this.jobs.get(jobId) : undefined;
      if (job && job.status === "queued") {
        job.status = "running";
        job.updatedAt = Date.now();
      }
    }
    const pendingKnowledge = this.isKnowledgeDeveloper(session)
      ? (await this.knowledgeStore.pending())[0] ?? null
      : null;
    this.json(response, 200, { command, pendingKnowledge });
  }

  private async actionGlobalKnowledge(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    await this.readJson(request);
    const snapshot = await this.knowledgeStore.snapshot();
    this.json(response, 200, {
      scope: "global",
      publicationPolicy: "developer-approved",
      schemaVersion: snapshot.schemaVersion,
      version: snapshot.version,
      updatedAt: snapshot.updatedAt,
      entries: snapshot.entries.map(({ publishedBy: _publishedBy, ...entry }) => entry),
    });
  }

  private async actionProposeKnowledge(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const body = await this.readJson(request);
    const code = normalizePairingCode(body.pairingCode);
    const session = code ? this.sessionForPairingCode(code) : undefined;
    if (!code || !session) {
      this.json(response, 404, { error: "No active Studio matches that connection code." });
      return;
    }
    const input = this.knowledgeProposalInput(body);
    const proposal = await this.knowledgeStore.propose(input, `studio-session:${session.id}`);
    this.json(response, 202, {
      status: "pending_developer_approval",
      proposal,
      instruction:
        "A developer installation must approve this proposal in the Motion Director Studio plugin before it becomes global.",
    });
  }

  private async pluginResolveKnowledge(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const body = await this.readJson(request);
    const session = this.authenticatePlugin(body);
    if (!session) {
      this.json(response, 401, { reconnect: true, error: "Invalid or expired plugin session." });
      return;
    }
    if (!this.isKnowledgeDeveloper(session)) {
      this.json(response, 403, { error: "This plugin installation cannot publish global knowledge." });
      return;
    }
    const proposalId = this.requiredString(body.proposalId, "proposalId", 160);
    const decision = body.decision;
    if (decision !== "commit" && decision !== "reject") {
      throw new Error("decision must be commit or reject.");
    }
    const result = await this.knowledgeStore.resolve(
      proposalId,
      decision,
      `installation:${session.installationId}`,
    );
    this.json(response, 200, {
      status: decision === "commit" ? "globally_published" : "rejected",
      ...result,
    });
  }

  private async pluginResult(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await this.readJson(request);
    const session = this.authenticatePlugin(body);
    if (!session) {
      this.json(response, 401, { reconnect: true, error: "Invalid or expired plugin session." });
      return;
    }
    session.lastSeenAt = Date.now();
    const commandId = this.requiredString(body.id, "id", 100);
    const jobId = this.jobByCommand.get(commandId);
    const job = jobId ? this.jobs.get(jobId) : undefined;
    if (!job || job.sessionId !== session.id) {
      this.json(response, 404, { error: "Unknown or expired command." });
      return;
    }
    if (job.timeout) clearTimeout(job.timeout);
    delete job.timeout;
    job.updatedAt = Date.now();
    if (body.ok === true) {
      job.status = "succeeded";
      job.result = body.result;
    } else {
      job.status = "failed";
      job.error = this.extractPluginError(body.error);
    }
    this.jobByCommand.delete(commandId);
    this.json(response, 200, { accepted: true, jobId: job.id });
  }

  private async actionStudioStatus(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const body = await this.readJson(request);
    const code = normalizePairingCode(body.pairingCode);
    const session = code ? this.sessionForPairingCode(code) : undefined;
    if (!code || !session) {
      this.json(response, 404, {
        connected: false,
        error: "Pairing code is invalid, expired, or the Studio plugin is offline.",
      });
      return;
    }
    this.json(response, 200, {
      connected: true,
      pairingCode: code,
      studio: this.publicSession(session),
      availableActions: Object.keys(ACTIONS),
    });
  }

  private async actionExecute(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await this.readJson(request);
    const code = normalizePairingCode(body.pairingCode);
    const session = code ? this.sessionForPairingCode(code) : undefined;
    if (!code || !session) {
      this.json(response, 404, {
        error: "Pairing code is invalid, expired, or the Studio plugin is offline.",
      });
      return;
    }
    const action = this.actionName(body.action);
    const definition = ACTIONS[action];
    const input = body.input === undefined ? {} : body.input;
    if (!isJsonObject(input)) throw new Error("input must be a JSON object.");
    if (definition.write && body.confirmWrite !== true) {
      this.json(response, 409, {
        error: "This action changes the open Roblox place. Ask the user for confirmation, then retry with confirmWrite=true.",
        action,
        requiresConfirmation: true,
      });
      return;
    }
    if (action === "createAnimationDraft") {
      this.json(response, 200, this.createAnimationDraftResult(session, input.blueprint));
      return;
    }
    if (action === "editAnimationDraft") {
      this.json(response, 200, this.editAnimationDraftResult(session, input.draftId, input.program));
      return;
    }
    if (action === "validateAnimationDraft") {
      const draft = this.draftFromInput(session, input);
      this.json(response, 200, {
        status: "succeeded",
        action,
        result: {
          valid: validateTemporalIntegrity(draft).length === 0,
          report: reviewDraft(draft),
        },
      });
      return;
    }
    const activeJobs = [...this.jobs.values()].filter(
      (job) =>
        job.sessionId === session.id && (job.status === "queued" || job.status === "running"),
    );
    if (activeJobs.length >= this.maxPendingJobsPerSession) {
      this.json(response, 429, { error: "Too many pending commands for this Studio session." });
      return;
    }
    const params = this.validateActionInput(action, input, session);
    const command: RelayCommand = {
      id: randomUUID(),
      method: definition.method!,
      params,
      createdAt: Date.now(),
    };
    const job: RelayJob = {
      id: randomUUID(),
      sessionId: session.id,
      pairingCode: code,
      action,
      status: "queued",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    job.timeout = setTimeout(() => {
      if (job.status === "queued" || job.status === "running") {
        job.status = "failed";
        job.error = `Studio command timed out after ${definition.timeoutMs}ms.`;
        job.updatedAt = Date.now();
      }
      this.jobByCommand.delete(command.id);
    }, definition.timeoutMs);
    this.jobs.set(job.id, job);
    this.jobByCommand.set(command.id, job.id);
    session.queue.push(command);
    this.json(response, 202, {
      jobId: job.id,
      status: job.status,
      action,
      pollAfterMs: 600,
    });
  }

  private async actionJob(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await this.readJson(request);
    const code = normalizePairingCode(body.pairingCode);
    const jobId = this.requiredString(body.jobId, "jobId", 100);
    const job = this.jobs.get(jobId);
    if (!code || !job || job.pairingCode !== code) {
      this.json(response, 404, { error: "Job not found for this pairing code." });
      return;
    }
    this.json(response, 200, this.publicJob(job));
  }

  private validateActionInput(
    action: RelayActionName,
    input: JsonObject,
    session: PluginSession,
  ): JsonObject {
    if (action === "inspectAnimation") {
      const page = Math.max(1, Math.trunc(Number(input.page) || 1));
      const pageSize = Math.min(10, Math.max(1, Math.trunc(Number(input.pageSize) || 1)));
      const rawStart = Math.max(
        0,
        Math.trunc(
          input.rawStart === undefined ? (page - 1) * pageSize : Number(input.rawStart) || 0,
        ),
      );
      const sampleStart = Math.max(
        0,
        Math.trunc(
          input.sampleStart === undefined
            ? (page - 1) * pageSize
            : Number(input.sampleStart) || 0,
        ),
      );
      const rawCount = Math.min(
        10,
        Math.max(
          0,
          Math.trunc(input.rawCount === undefined ? pageSize : Number(input.rawCount) || 0),
        ),
      );
      const sampleCount = Math.min(
        10,
        Math.max(
          0,
          Math.trunc(input.sampleCount === undefined ? pageSize : Number(input.sampleCount) || 0),
        ),
      );
      const requestedSection =
        typeof input.section === "string" ? input.section : "raw";
      const section = ["raw", "samples", "metrics", "rig", "all"].includes(requestedSection)
        ? requestedSection
        : "raw";
      const parts = Array.isArray(input.parts)
        ? input.parts
            .filter((value): value is string => typeof value === "string" && value.length > 0)
            .slice(0, 24)
        : undefined;
      const params: JsonObject = {
        ...(typeof input.sourcePath === "string" ? { sourcePath: input.sourcePath } : {}),
        ...(typeof input.animationName === "string"
          ? { animationName: input.animationName }
          : {}),
        ...(Number.isFinite(Number(input.occurrence))
          ? { occurrence: Math.max(1, Math.trunc(Number(input.occurrence))) }
          : {}),
        ...(typeof input.rigPath === "string" ? { rigPath: input.rigPath } : {}),
        page,
        pageSize,
        rawStart,
        rawCount,
        sampleStart,
        sampleCount,
        sampleRate: Math.min(120, Math.max(1, Number(input.sampleRate) || 60)),
        ...(parts ? { parts } : {}),
      };
      if (section === "raw") {
        return {
          ...params,
          includeRig: false,
          includeRaw: true,
          includeSamples: false,
          includeMetrics: false,
        };
      }
      if (section === "samples") {
        return {
          ...params,
          includeRig: false,
          includeRaw: false,
          includeSamples: true,
          includeMetrics: false,
        };
      }
      if (section === "metrics") {
        return {
          ...params,
          includeRig: false,
          includeRaw: false,
          includeSamples: false,
          includeMetrics: true,
        };
      }
      if (section === "rig") {
        return {
          ...params,
          includeRig: true,
          includeRaw: false,
          includeSamples: false,
          includeMetrics: false,
        };
      }
      return {
        ...params,
        includeRig: input.includeRig !== false,
        includeRaw: input.includeRaw !== false,
        includeSamples: input.includeSamples !== false,
        includeMetrics: input.includeMetrics !== false,
      };
    }
    if (action === "stageAnimationDraft") {
      const transactionName = this.requiredString(input.transactionName, "transactionName", 120);
      const draft = this.draftFromInput(session, input);
      const problems = validateTemporalIntegrity(draft);
      if (problems.length > 0) throw new Error(problems.join("\n"));
      return { transactionName, draft };
    }
    if (action === "stageR6ToR15Retarget") {
      const transactionName = this.requiredString(
        input.transactionName,
        "transactionName",
        120,
      );
      const sourcePath =
        typeof input.sourcePath === "string" && input.sourcePath.length > 0
          ? input.sourcePath
          : undefined;
      const animationName =
        typeof input.animationName === "string" && input.animationName.length > 0
          ? input.animationName
          : undefined;
      if (!sourcePath && !animationName) {
        throw new Error("stageR6ToR15Retarget requires sourcePath or animationName.");
      }
      const optionalString = (value: unknown, name: string, maximum: number) =>
        value === undefined ? undefined : this.requiredString(value, name, maximum);
      const sourceRigPath = optionalString(input.sourceRigPath, "sourceRigPath", 500);
      const targetRigPath = optionalString(input.targetRigPath, "targetRigPath", 500);
      const outputName = optionalString(input.outputName, "outputName", 120);
      const legLateralScale = Number(input.legLateralScale);
      const maxLegLateralOffset = Number(input.maxLegLateralOffset);
      return {
        transactionName,
        ...(sourcePath ? { sourcePath } : {}),
        ...(animationName ? { animationName } : {}),
        ...(Number.isFinite(Number(input.occurrence))
          ? { occurrence: Math.max(1, Math.trunc(Number(input.occurrence))) }
          : {}),
        ...(sourceRigPath ? { sourceRigPath } : {}),
        ...(targetRigPath ? { targetRigPath } : {}),
        ...(outputName ? { outputName } : {}),
        sourceSelectionIndex: Math.max(
          1,
          Math.trunc(Number(input.sourceSelectionIndex) || 1),
        ),
        targetSelectionIndex: Math.max(
          1,
          Math.trunc(Number(input.targetSelectionIndex) || 2),
        ),
        legLateralScale: Math.min(
          1,
          Math.max(0, Number.isFinite(legLateralScale) ? legLateralScale : 0.4),
        ),
        maxLegLateralOffset: Math.min(
          1,
          Math.max(0, Number.isFinite(maxLegLateralOffset) ? maxLegLateralOffset : 0.12),
        ),
      };
    }
    if (action === "commitAnimationDraft") {
      return {
        transactionId: this.requiredString(input.transactionId, "transactionId", 160),
        destinationName: this.requiredString(input.destinationName, "destinationName", 120),
      };
    }
    if (action === "discardAnimationDraft") {
      return { transactionId: this.requiredString(input.transactionId, "transactionId", 160) };
    }
    if (action === "attachCommittedAnimations") {
      return {
        namePrefix:
          input.namePrefix === undefined
            ? ""
            : this.requiredString(input.namePrefix, "namePrefix", 120),
      };
    }
    if (action === "poseCommittedAnimation") {
      const normalizedTime = Number(input.normalizedTime);
      if (!Number.isFinite(normalizedTime) || normalizedTime < 0 || normalizedTime > 1) {
        throw new Error("normalizedTime must be between 0 and 1.");
      }
      return {
        animationName: this.requiredString(input.animationName, "animationName", 120),
        normalizedTime,
      };
    }
    if (action === "createAnimationReviewGuides") {
      const normalizedTimes = Array.isArray(input.normalizedTimes)
        ? input.normalizedTimes.slice(0, 16).map(Number).filter((value) => Number.isFinite(value) && value >= 0 && value <= 1)
        : [0, 0.25, 0.5, 0.75, 1];
      const effectors = Array.isArray(input.effectors)
        ? input.effectors.slice(0, 16).filter((value): value is string => typeof value === "string" && value.length > 0 && value.length <= 120)
        : ["Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
      return {
        animationName: this.requiredString(input.animationName, "animationName", 120),
        normalizedTimes,
        effectors,
        ghostTransparency: Math.min(0.95, Math.max(0.2, Number(input.ghostTransparency) || 0.72)),
        maxPathSamples: Math.min(240, Math.max(2, Math.trunc(Number(input.maxPathSamples) || 120))),
      };
    }
    if (action === "resetRigPose" || action === "clearAnimationReviewGuides") return {};
    return input;
  }

  private actionName(value: unknown): RelayActionName {
    if (typeof value !== "string" || !(value in ACTIONS)) {
      throw new Error(`Unknown action. Allowed actions: ${Object.keys(ACTIONS).join(", ")}.`);
    }
    return value as RelayActionName;
  }

  private authenticatePlugin(body: JsonObject): PluginSession | undefined {
    if (typeof body.sessionId !== "string" || typeof body.agentToken !== "string") return undefined;
    const session = this.sessions.get(body.sessionId);
    if (!session || Date.now() - session.lastSeenAt >= this.sessionTtlMs) return undefined;
    const candidate = tokenHash(body.agentToken);
    return secureEqual(session.tokenHash, candidate) ? session : undefined;
  }

  private sessionForPairingCode(code: string): PluginSession | undefined {
    const sessionId = this.sessionByPairingCode.get(code);
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    return session && Date.now() - session.lastSeenAt < this.sessionTtlMs ? session : undefined;
  }

  private activeSessions(): PluginSession[] {
    return [...this.sessions.values()].filter(
      (session) => Date.now() - session.lastSeenAt < this.sessionTtlMs,
    );
  }

  private cleanup(): void {
    const now = Date.now();
    for (const session of this.sessions.values()) {
      if (now - session.lastSeenAt >= this.sessionTtlMs) this.removeSession(session.id);
    }
    for (const job of this.jobs.values()) {
      if (now - job.updatedAt >= this.jobTtlMs) {
        if (job.timeout) clearTimeout(job.timeout);
        this.jobs.delete(job.id);
      }
    }
    for (const draft of this.authoredDrafts.values()) {
      if (now - draft.updatedAt >= this.jobTtlMs) this.authoredDrafts.delete(draft.id);
    }
  }

  private removeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(session.id);
    this.sessionByInstallation.delete(session.installationId);
    this.sessionByPairingCode.delete(session.pairingCode);
    for (const draft of this.authoredDrafts.values()) {
      if (draft.sessionId === session.id) this.authoredDrafts.delete(draft.id);
    }
    for (const job of this.jobs.values()) {
      if (job.sessionId === session.id && (job.status === "queued" || job.status === "running")) {
        if (job.timeout) clearTimeout(job.timeout);
        job.status = "failed";
        job.error = "Studio plugin disconnected.";
        job.updatedAt = Date.now();
      }
    }
  }

  private optionalSessionMetadata(body: JsonObject): Partial<PluginSession> {
    return {
      ...(typeof body.studioUserId === "number" && Number.isFinite(body.studioUserId)
        ? { studioUserId: body.studioUserId }
        : {}),
      ...(typeof body.placeId === "number" && Number.isFinite(body.placeId)
        ? { placeId: body.placeId }
        : {}),
      ...(typeof body.placeName === "string" ? { placeName: body.placeName.slice(0, 200) } : {}),
      ...(typeof body.pluginVersion === "string"
        ? { pluginVersion: body.pluginVersion.slice(0, 40) }
        : {}),
    };
  }

  private isKnowledgeDeveloper(session: PluginSession): boolean {
    return this.developerInstallationIds.has(session.installationId);
  }

  private knowledgeProposalInput(body: JsonObject): KnowledgeProposalInput {
    const stringArray = (
      value: unknown,
      name: string,
      maxItems: number,
      maxLength: number,
    ): string[] => {
      if (!Array.isArray(value) || value.length > maxItems) {
        throw new Error(`${name} must be an array with at most ${maxItems} items.`);
      }
      return value.map((item, index) =>
        this.requiredString(item, `${name}[${index}]`, maxLength));
    };
    return {
      category: this.requiredString(body.category, "category", 80),
      title: this.requiredString(body.title, "title", 140),
      principle: this.requiredString(body.principle, "principle", 1_200),
      rationale: this.requiredString(body.rationale, "rationale", 2_000),
      appliesTo: stringArray(body.appliesTo, "appliesTo", 16, 100),
      evidence: stringArray(body.evidence, "evidence", 12, 400),
    };
  }

  private publicSession(session: PluginSession): JsonObject {
    return {
      placeId: session.placeId ?? 0,
      placeName: session.placeName ?? "Unknown place",
      pluginVersion: session.pluginVersion ?? "unknown",
      knowledgeRole: this.isKnowledgeDeveloper(session) ? "developer" : "reader",
      connectedAt: session.connectedAt,
      lastSeenAt: session.lastSeenAt,
    };
  }

  private publicJob(job: RelayJob): JsonObject {
    return {
      jobId: job.id,
      action: job.action,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      ...(job.result === undefined ? {} : { result: job.result }),
      ...(job.error === undefined ? {} : { error: job.error }),
      ...(job.status === "queued" || job.status === "running" ? { pollAfterMs: 600 } : {}),
    };
  }

  private async actionCreateAnimationDraft(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const body = await this.readJson(request);
    const code = normalizePairingCode(body.pairingCode);
    const session = code ? this.sessionForPairingCode(code) : undefined;
    if (!code || !session) {
      this.json(response, 404, { error: "Pairing code is invalid, expired, or the Studio plugin is offline." });
      return;
    }
    this.json(response, 200, this.createAnimationDraftResult(session, body.blueprint));
  }

  private createAnimationDraftResult(session: PluginSession, blueprint: unknown): JsonObject {
    const parsedBlueprint = animationBlueprintSchema.parse(blueprint);
    const draft = draftFromBlueprint(parsedBlueprint);
    const problems = validateTemporalIntegrity(draft);
    if (problems.length > 0) throw new Error(problems.join("\n"));
    const report = reviewDraft(draft);
    if (report.blockingIssues.length > 0) throw new Error(report.blockingIssues.join("\n"));
    const record: StoredAnimationDraft = {
      id: randomUUID(),
      sessionId: session.id,
      pairingCode: session.pairingCode,
      draft,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.authoredDrafts.set(record.id, record);
    return {
      status: "succeeded",
      draftId: record.id,
      summary: {
        name: draft.name,
        rigId: draft.rigId,
        duration: draft.duration,
        framesPerSecond: draft.framesPerSecond,
        trackCount: draft.tracks.length,
        keyCount: draft.tracks.reduce((sum, track) => sum + track.keys.length, 0),
      },
      report,
      next:
        "Call validateAnimationDraft with input.draftId, then stageAnimationDraft with transactionName and the same draftId.",
    };
  }

  private async actionEditAnimationDraft(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await this.readJson(request);
    const code = normalizePairingCode(body.pairingCode);
    const session = code ? this.sessionForPairingCode(code) : undefined;
    if (!code || !session) {
      this.json(response, 404, { error: "Pairing code is invalid, expired, or the Studio plugin is offline." });
      return;
    }
    this.json(response, 200, this.editAnimationDraftResult(session, body.draftId, body.program));
  }

  private editAnimationDraftResult(session: PluginSession, draftIdValue: unknown, programValue: unknown): JsonObject {
    const draftId = this.requiredString(draftIdValue, "draftId", 100);
    const source = this.authoredDrafts.get(draftId);
    if (!source || source.sessionId !== session.id) throw new Error("Unknown, expired, or unauthorized draftId for this Studio session.");
    const program = animationEditProgramSchema.parse(programValue);
    const draft = applyAnimationEditProgram(source.draft, program);
    const problems = validateTemporalIntegrity(draft);
    if (problems.length) throw new Error(problems.join("\n"));
    const record: StoredAnimationDraft = {
      id: randomUUID(), sessionId: session.id, pairingCode: session.pairingCode,
      draft, createdAt: Date.now(), updatedAt: Date.now(),
    };
    this.authoredDrafts.set(record.id, record);
    return {
      status: "succeeded", draftId: record.id, sourceDraftId: draftId,
      summary: {
        name: draft.name, duration: draft.duration, operationCount: program.operations.length,
        trackCount: draft.tracks.length, keyCount: draft.tracks.reduce((sum, track) => sum + track.keys.length, 0),
      },
      report: reviewDraft(draft),
      next: "Validate and stage the returned draftId. The source draft remains unchanged.",
    };
  }

  private async actionComposeAnimationLayer(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await this.readJson(request);
    const code = normalizePairingCode(body.pairingCode);
    const session = code ? this.sessionForPairingCode(code) : undefined;
    if (!code || !session) {
      this.json(response, 404, { error: "Pairing code is invalid, expired, or the Studio plugin is offline." });
      return;
    }
    const baseDraftId = this.requiredString(body.baseDraftId, "baseDraftId", 100);
    const layerDraftId = this.requiredString(body.layerDraftId, "layerDraftId", 100);
    const base = this.authoredDrafts.get(baseDraftId);
    const layer = this.authoredDrafts.get(layerDraftId);
    if (!base || !layer || base.sessionId !== session.id || layer.sessionId !== session.id) {
      throw new Error("Unknown, expired, or unauthorized base/layer draft ID for this Studio session.");
    }
    const options = animationLayerOptionsSchema.parse(body.options);
    const draft = composeAnimationLayer(base.draft, layer.draft, options);
    const record: StoredAnimationDraft = {
      id: randomUUID(), sessionId: session.id, pairingCode: session.pairingCode,
      draft, createdAt: Date.now(), updatedAt: Date.now(),
    };
    this.authoredDrafts.set(record.id, record);
    this.json(response, 200, {
      status: "succeeded", draftId: record.id, baseDraftId, layerDraftId,
      summary: {
        name: draft.name, mode: options.mode, weight: options.weight,
        trackCount: draft.tracks.length, keyCount: draft.tracks.reduce((sum, track) => sum + track.keys.length, 0),
        sampleRate: draft.bakeFramesPerSecond,
      },
      report: reviewDraft(draft),
      next: "Validate and stage the returned draftId. Both source drafts remain unchanged.",
    });
  }

  private draftFromInput(session: PluginSession, input: JsonObject): AnimationDraft {
    if (input.draft !== undefined) return animationDraftSchema.parse(input.draft);
    const draftId = this.requiredString(input.draftId, "draftId", 100);
    const stored = this.authoredDrafts.get(draftId);
    if (!stored || stored.sessionId !== session.id) {
      throw new Error("Unknown, expired, or unauthorized draftId for this Studio session.");
    }
    stored.updatedAt = Date.now();
    return stored.draft;
  }

  private extractPluginError(value: unknown): string {
    if (isJsonObject(value) && typeof value.message === "string") return value.message;
    return typeof value === "string" ? value : "Studio command failed.";
  }

  private async readJson(request: IncomingMessage): Promise<JsonObject> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error("Request exceeds 4 MiB.");
      chunks.push(buffer);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!isJsonObject(parsed)) throw new Error("Expected a JSON object.");
    return parsed;
  }

  private requiredString(value: unknown, name: string, maxLength: number): string {
    if (typeof value !== "string" || value.length < 1 || value.length > maxLength) {
      throw new Error(`${name} must be a string between 1 and ${maxLength} characters.`);
    }
    return value;
  }

  private json(response: ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(body));
  }

  private html(response: ServerResponse, status: number, body: string): void {
    response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
    response.end(body);
  }

  private applyHeaders(response: ServerResponse): void {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Access-Control-Allow-Origin", "https://chatgpt.com");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  openApiDocument(): JsonObject {
    const actionNames = Object.keys(ACTIONS);
    const pairingSchema = {
      type: "string",
      pattern: "^[A-Z2-9]{5}-[A-Z2-9]{5}$",
      description:
        "Persistent personal connection code shown by the Motion Director Roblox Studio plugin.",
    };
    return {
      openapi: "3.1.0",
      info: {
        title: "Motion Director for Roblox Studio",
        version: "0.9.0",
        description:
          "Pairs ChatGPT with Roblox Studio, executes bounded animation-authoring operations, and distributes developer-approved global animation knowledge.",
      },
      servers: [{ url: this.publicBaseUrl }],
      paths: {
        "/v1/knowledge/global": {
          post: {
            operationId: "getMotionDirectorGlobalKnowledge",
            summary: "Load the latest developer-approved global animation knowledge.",
            description:
              "Public read-only knowledge shared by every Motion Director chat and user. Call before planning animation work.",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {},
                    additionalProperties: false,
                  },
                },
              },
            },
            responses: { "200": { description: "Published global knowledge snapshot." } },
          },
        },
        "/v1/knowledge/propose": {
          post: {
            operationId: "proposeMotionDirectorGlobalKnowledge",
            summary: "Propose a generalizable animation lesson for developer review.",
            description:
              "Creates a pending proposal only. It does not become global until an authorized development installation approves it.",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: [
                      "pairingCode",
                      "category",
                      "title",
                      "principle",
                      "rationale",
                      "appliesTo",
                      "evidence",
                    ],
                    properties: {
                      pairingCode: pairingSchema,
                      category: { type: "string", maxLength: 80 },
                      title: { type: "string", maxLength: 140 },
                      principle: { type: "string", maxLength: 1200 },
                      rationale: { type: "string", maxLength: 2000 },
                      appliesTo: {
                        type: "array",
                        maxItems: 16,
                        items: { type: "string", maxLength: 100 },
                      },
                      evidence: {
                        type: "array",
                        maxItems: 12,
                        items: { type: "string", maxLength: 400 },
                      },
                    },
                    additionalProperties: false,
                  },
                },
              },
            },
            responses: {
              "202": { description: "Proposal awaiting approval in the development plugin." },
              "404": { description: "No paired Studio." },
            },
          },
        },
        "/v1/actions/studio-status": {
          post: {
            operationId: "getMotionDirectorStudioStatus",
            summary: "Verify a pairing code and inspect the connected Studio.",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["pairingCode"],
                    properties: { pairingCode: pairingSchema },
                  },
                },
              },
            },
            responses: { "200": { description: "Connected Studio status." } },
          },
        },
        "/v1/drafts/create": {
          post: {
            operationId: "createMotionDirectorAnimationDraft",
            summary: "Create and store a complete animation draft from a compact blueprint.",
            description:
              "Use this after rig inspection. It converts Euler-degree pose keys into the complete quaternion AnimationDraft and returns draftId for validation and staging. This is the authoring operation; never report that draft creation is unavailable while it exists.",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["pairingCode", "blueprint"],
                    properties: {
                      pairingCode: pairingSchema,
                      blueprint: animationBlueprintOpenApiSchema(),
                    },
                    additionalProperties: false,
                  },
                },
              },
            },
            responses: {
              "200": { description: "Stored complete draft ID, summary, and quality report." },
              "400": { description: "Invalid blueprint or blocking draft issue." },
              "404": { description: "No paired Studio." },
            },
          },
        },
        "/v1/drafts/edit": {
          post: {
            operationId: "editMotionDirectorAnimationDraft",
            summary: "Apply precise partial editing operations to a stored animation draft.",
            description:
              "Creates a new draft version without retransmitting or mutating the source. Supports pose insertion, range offset/retime/delete, copying, mirroring, easing and in-between densification.",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["pairingCode", "draftId", "program"],
                    properties: {
                      pairingCode: pairingSchema,
                      draftId: { type: "string", format: "uuid" },
                      program: z.toJSONSchema(animationEditProgramSchema, { target: "draft-2020-12" }) as JsonObject,
                    },
                    additionalProperties: false,
                  },
                },
              },
            },
            responses: {
              "200": { description: "New stored draft version and quality report." },
              "400": { description: "Invalid edit program." },
              "404": { description: "No paired Studio or unknown draft." },
            },
          },
        },
        "/v1/drafts/compose-layer": {
          post: {
            operationId: "composeMotionDirectorAnimationLayer",
            summary: "Blend two stored drafts as a non-destructive animation layer.",
            description: "References stored drafts by ID, applies an additive or override joint-masked layer locally, and returns a new dense-linear draft ID without retransmitting key arrays.",
            requestBody: {
              required: true,
              content: { "application/json": { schema: {
                type: "object", additionalProperties: false,
                required: ["pairingCode", "baseDraftId", "layerDraftId", "options"],
                properties: {
                  pairingCode: pairingSchema,
                  baseDraftId: { type: "string", format: "uuid" },
                  layerDraftId: { type: "string", format: "uuid" },
                  options: z.toJSONSchema(animationLayerOptionsSchema, { target: "draft-2020-12" }) as JsonObject,
                },
              } } },
            },
            responses: { "200": { description: "New layered draft ID and quality report." }, "400": { description: "Invalid layer options." }, "404": { description: "No paired Studio or unknown draft." } },
          },
        },
        "/v1/actions/execute": {
          post: {
            operationId: "executeMotionDirectorAction",
            summary: "Queue one bounded Motion Director action in the paired Studio.",
            description:
              "Write actions require confirmWrite=true only after the user explicitly approves the change.",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["pairingCode", "action", "input"],
                    properties: {
                      pairingCode: pairingSchema,
                      action: { type: "string", enum: actionNames },
                      input: actionInputOpenApiSchema(),
                      confirmWrite: {
                        type: "boolean",
                        default: false,
                        description:
                          "Set true only after the user approved a write action in the current conversation.",
                      },
                    },
                  },
                },
              },
            },
            responses: {
              "200": { description: "Immediate validation result." },
              "202": { description: "Queued asynchronous Studio job." },
              "409": { description: "Explicit confirmation required." },
            },
          },
        },
        "/v1/actions/job": {
          post: {
            operationId: "getMotionDirectorJob",
            summary: "Poll a queued Motion Director Studio job.",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["pairingCode", "jobId"],
                    properties: {
                      pairingCode: pairingSchema,
                      jobId: { type: "string", format: "uuid" },
                    },
                  },
                },
              },
            },
            responses: { "200": { description: "Current job state and eventual result." } },
          },
        },
      },
    };
  }

  private privacyPolicy(): string {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Motion Director Privacy Policy</title></head><body>
<main><h1>Motion Director Privacy Policy</h1>
<p>Motion Director relays commands between ChatGPT and the Roblox Studio session that a user explicitly pairs.</p>
<h2>Data processed</h2><p>Personal connection codes, plugin installation identifiers, plugin version, place identifier and name, animation drafts, selected rig metadata, command results, global knowledge proposals, and operational timestamps.</p>
<h2>Purpose</h2><p>Data is used to route requested animation operations, return results, prevent abuse, diagnose failures, and distribute developer-approved animation guidance.</p>
<h2>Retention</h2><p>Pairing sessions and command jobs expire automatically. Pending proposals and approved global knowledge are retained until rejected, superseded, or removed by the project operator.</p>
<h2>Sharing</h2><p>Motion Director does not sell personal data. Approved global knowledge is intentionally shared with every Motion Director user; connection codes, place data, drafts, and proposal authorship are not included in the public snapshot.</p>
<h2>User control</h2><p>Closing Studio or disabling remote mode makes the connected Studio unavailable. Users can discard staged animations before commit. Knowledge proposals remain unpublished until an authorized development installation approves them.</p>
<h2>Security</h2><p>The relay exposes a fixed allowlist of animation operations and does not provide arbitrary Luau or filesystem execution.</p>
<p>Contact: replace-this-address-before-publication@example.com</p></main></body></html>`;
  }
}
