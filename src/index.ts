import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { StudioBridge } from "./bridge.js";
import { animationEditProgramSchema, applyAnimationEditProgram } from "./draft-editing.js";
import { animationLayerOptionsSchema, composeAnimationLayer } from "./animation-layers.js";
import { animationDraftSchema, validateTemporalIntegrity, vector3Schema } from "./domain.js";
import {
  ANIMATION_CONTRACT_GUIDE,
  PROFESSIONAL_AUTHORING_PROTOCOL,
  PROFESSIONAL_QUALITY_RUBRIC,
} from "./guidance.js";
import { reviewDraft } from "./quality.js";
import { profileForRigType } from "./rig-profiles.js";

const bridge = new StudioBridge(
  process.env.ROBLOX_MOTION_HOST ?? "127.0.0.1",
  Number(process.env.ROBLOX_MOTION_PORT ?? "34718"),
);

const server = new McpServer({
  name: "roblox-motion-director",
  version: "0.9.0",
});

server.registerResource(
  "professional-authoring-protocol",
  "motion-director://guides/professional-authoring-v1",
  {
    title: "Professional animation authoring protocol",
    description:
      "Mandatory reasoning order for deliberate, editable, production-quality character animation.",
    mimeType: "text/markdown",
  },
  async () => ({
    contents: [
      {
        uri: "motion-director://guides/professional-authoring-v1",
        mimeType: "text/markdown",
        text: PROFESSIONAL_AUTHORING_PROTOCOL,
      },
    ],
  }),
);

server.registerResource(
  "professional-quality-rubric",
  "motion-director://guides/quality-rubric-v1",
  {
    title: "Professional animation quality rubric",
    description:
      "Evidence-based blocking checks and quality dimensions with frame-range reporting requirements.",
    mimeType: "text/markdown",
  },
  async () => ({
    contents: [
      {
        uri: "motion-director://guides/quality-rubric-v1",
        mimeType: "text/markdown",
        text: PROFESSIONAL_QUALITY_RUBRIC,
      },
    ],
  }),
);

server.registerResource(
  "animation-contract-guide",
  "motion-director://guides/animation-contract-v1",
  {
    title: "Motion Director animation contract",
    description: "Meaning and lifecycle of beats, contacts, tracks, staging, and commit.",
    mimeType: "text/markdown",
  },
  async () => ({
    contents: [
      {
        uri: "motion-director://guides/animation-contract-v1",
        mimeType: "text/markdown",
        text: ANIMATION_CONTRACT_GUIDE,
      },
    ],
  }),
);

server.registerPrompt(
  "direct-professional-animation",
  {
    title: "Direct a professional Roblox animation",
    description:
      "Starts a disciplined inspect-plan-author-validate-stage-review workflow instead of raw keyframe guessing.",
    argsSchema: {
      intent: z.string().min(1).describe("Narrative action and performance intention."),
      durationSeconds: z.string().describe("Target duration in seconds."),
      style: z.string().describe("Physical and visual style references."),
      hardConstraints: z
        .string()
        .optional()
        .describe("Required contacts, targets, camera requirements, or forbidden changes."),
    },
  },
  async ({ intent, durationSeconds, style, hardConstraints }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Direct a production-quality Roblox animation.

Intent: ${intent}
Target duration: ${durationSeconds} seconds
Style: ${style}
Hard constraints: ${hardConstraints ?? "None supplied; discover constraints from the scene."}

Before authoring, read all three motion-director://guides resources. Check
studio_status, inspect the selection and rig, state the performance thesis,
design semantic beats and non-negotiable contacts, then author purposeful
tracks. Validate the complete draft and fix every blocking issue before staging.
Do not commit until the staged take has been explicitly reviewed.`,
        },
      },
    ],
  }),
);

function jsonContent(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function errorContent(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : "Unknown Motion Director error.",
      },
    ],
  };
}

server.registerTool(
  "studio_status",
  {
    title: "Get Roblox Studio connection status",
    description:
      "Checks whether the local Motion Director Studio plugin is connected. Call this before Studio-dependent tools.",
    inputSchema: {},
  },
  async () => jsonContent(bridge.getStatus()),
);

server.registerTool(
  "studio_animation_capabilities",
  {
    title: "Get the live Studio animation baker capabilities",
    description:
      "Returns the exact baker and preview feature level of the plugin instance that will execute commands. Require parentSpaceBakerVersion >= 7 and animationAnalyzerVersion >= 2 for dual Motor6D/AnimationConstraint R15 support.",
    inputSchema: {},
  },
  async () => {
    try {
      return jsonContent(await bridge.executeAny("system.capabilities", {}, 5_000));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "get_scene_selection",
  {
    title: "Inspect the current Roblox Studio selection",
    description:
      "Returns a bounded structural snapshot of selected instances, including identity, class, hierarchy, transforms, and animation-relevant children.",
    inputSchema: {
      includeDescendants: z.boolean().default(true),
      maxDepth: z.number().int().min(0).max(12).default(6),
    },
  },
  async (input) => {
    try {
      return jsonContent(await bridge.execute("scene.getSelection", input));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "list_shared_director_markers",
  {
    title: "List shared Motion, VFX, camera and audio markers",
    description: "Reads the compact DirectorMarkerBus published inside ReplicatedStorage so all director systems can align impacts, contacts, beats and recoveries to one time source.",
    inputSchema: {},
  },
  async () => {
    try { return jsonContent(await bridge.executeAny("timeline.listMarkers", {}, 15_000)); }
    catch (error) { return errorContent(error); }
  },
);

server.registerTool(
  "create_native_ik_control",
  {
    title: "Create a native Roblox IK control",
    description: "Creates a real IKControl on the selected R15/custom rig with an explicit chain root, end effector, world-space target, optional pole, weight, priority and critically damped smoothing. R6 has only limited single-segment usefulness.",
    inputSchema: {
      controlName: z.string().min(1).max(120), chainRootName: z.string().min(1).max(120), endEffectorName: z.string().min(1).max(120),
      controlType: z.enum(["position", "transform"]).default("transform"),
      targetPosition: vector3Schema, targetRotationDegrees: vector3Schema.default({ x: 0, y: 0, z: 0 }), poleName: z.string().max(120).optional(),
      weight: z.number().min(0).max(1).default(1), smoothTime: z.number().min(0).max(2).default(0), priority: z.number().int().min(-100).max(100).default(0),
      contactKind: z.enum(["footLock", "handLock", "aim", "prop", "custom"]).default("custom"),
    },
  },
  async input => { try { return jsonContent(await bridge.executeAny("animation.createIkControl", input, 120_000)); } catch (error) { return errorContent(error); } },
);

server.registerTool(
  "create_grounded_foot_locks",
  {
    title: "Create grounded foot locks on the selected rig",
    description: "Raycasts from named foot effectors, creates world-space contact targets aligned to surface normals, and configures high-priority Transform IKControls to eliminate foot sliding and floating.",
    inputSchema: {
      feet: z.array(z.object({ controlName: z.string().min(1), chainRootName: z.string().min(1), endEffectorName: z.string().min(1), poleName: z.string().optional() })).min(1).max(8).optional(),
      raycastDistance: z.number().min(0.1).max(100).default(8), soleOffset: z.number().min(-2).max(2).default(0.05),
      weight: z.number().min(0).max(1).default(1), smoothTime: z.number().min(0).max(2).default(0), priority: z.number().int().min(-100).max(100).default(20),
    },
  },
  async input => { try { return jsonContent(await bridge.executeAny("animation.createFootLocks", input, 120_000)); } catch (error) { return errorContent(error); } },
);

server.registerTool(
  "audit_native_ik_contacts",
  {
    title: "Audit IK contact error",
    description: "Measures live world-space end-effector distance to each Motion Director IK target and reports locked, warning or failing contact status.",
    inputSchema: {},
  },
  async () => { try { return jsonContent(await bridge.executeAny("animation.auditIkContacts", {}, 30_000)); } catch (error) { return errorContent(error); } },
);

server.registerTool(
  "remove_native_ik_controls",
  {
    title: "Remove Motion Director IK controls",
    description: "Removes only IKControls and target helpers created by Motion Director from the selected rig, with Studio undo support.",
    inputSchema: {},
  },
  async () => { try { return jsonContent(await bridge.executeAny("animation.removeIkControls", {}, 120_000)); } catch (error) { return errorContent(error); } },
);

server.registerTool(
  "inspect_rig",
  {
    title: "Inspect an animation rig",
    description:
      "Builds a canonical animation-rig description from a selected Model, including Motor6D, AnimationConstraint, Bone topology, attachment bases, track names, hierarchy, effectors, and warnings.",
    inputSchema: {
      rigId: z.string().optional().describe("Stable instance id. Omit to inspect the selected rig."),
      includeGeometryBounds: z.boolean().default(true),
    },
  },
  async (input) => {
    try {
      return jsonContent(await bridge.execute("rig.inspect", input));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "list_analyzable_animations",
  {
    title: "List animation clips available to the analyzer",
    description:
      "Catalogs local KeyframeSequence and CurveAnimation instances across the open place, including References, AnimSaves, and committed Motion Director output. Use the returned exact path with deep inspection tools.",
    inputSchema: {
      nameContains: z.string().max(120).default(""),
      pathContains: z.string().max(300).default(""),
      maxResults: z.number().int().min(1).max(500).default(200),
    },
  },
  async (input) => {
    try {
      return jsonContent(await bridge.execute("analysis.listAnimations", input, 120_000));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "inspect_animation_full",
  {
    title: "Inspect a complete animation as machine-readable motion data",
    description:
      "Exports a lossless, paginated KeyframeSequence view plus the target rig, Motor6D or AnimationConstraint bases, interpolated root-relative spatial samples, center of mass, support feet, velocities, angular velocities, path lengths, pose translation, and support travel. True world foot sliding requires root motion or gameplay displacement. Provide sourcePath from list_analyzable_animations whenever duplicate names exist.",
    inputSchema: {
      sourcePath: z.string().min(1).max(500).optional(),
      animationName: z.string().min(1).max(160).optional(),
      occurrence: z.number().int().min(1).max(100).default(1),
      rigPath: z.string().min(1).max(500).optional(),
      sampleRate: z.number().int().min(1).max(120).default(60),
      rawStart: z.number().int().min(0).default(0),
      rawCount: z.number().int().min(0).max(120).default(30),
      sampleStart: z.number().int().min(0).default(0),
      sampleCount: z.number().int().min(0).max(120).default(30),
      includeRig: z.boolean().default(true),
      includeRaw: z.boolean().default(true),
      includeSamples: z.boolean().default(true),
      includeMetrics: z.boolean().default(true),
      parts: z.array(z.string().min(1).max(120)).max(40).default([]),
    },
  },
  async (input) => {
    try {
      return jsonContent(await bridge.execute("analysis.inspectAnimation", input, 180_000));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "compare_animation_motion",
  {
    title: "Compare two animations after normalized spatial reconstruction",
    description:
      "Reconstructs two KeyframeSequences on the same rig, aligns loop phases when applicable, and compares per-part root-relative position, angular RMS, path length, maximum speed, center-of-mass range, and support travel.",
    inputSchema: {
      sourcePathA: z.string().min(1).max(500).optional(),
      animationNameA: z.string().min(1).max(160).optional(),
      occurrenceA: z.number().int().min(1).max(100).default(1),
      sourcePathB: z.string().min(1).max(500).optional(),
      animationNameB: z.string().min(1).max(160).optional(),
      occurrenceB: z.number().int().min(1).max(100).default(1),
      rigPath: z.string().min(1).max(500).optional(),
      sampleRate: z.number().int().min(1).max(120).default(60),
      normalizedSamples: z.number().int().min(9).max(241).default(61),
      parts: z.array(z.string().min(1).max(120)).max(40).default([]),
    },
  },
  async (input) => {
    try {
      return jsonContent(await bridge.execute("analysis.compareAnimations", input, 180_000));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "stage_r6_animation_as_r15",
  {
    title: "Stage a complete R6 KeyframeSequence retargeted to R15",
    description:
      "Converts the source animation entirely inside Studio using proven world-space C0/C1 reconstruction, root normalization, partial-pose inheritance, R15 joint-base solving, neutral rebasing, rigid neutral lower chains, and bounded upper-leg lateral translation. Returns a reversible transactionId; it does not commit or attach automatically.",
    inputSchema: {
      transactionName: z.string().min(1).max(120),
      sourcePath: z.string().min(1).max(500).optional(),
      animationName: z.string().min(1).max(160).optional(),
      occurrence: z.number().int().min(1).max(100).default(1),
      sourceRigPath: z.string().min(1).max(500).optional(),
      targetRigPath: z.string().min(1).max(500).optional(),
      sourceSelectionIndex: z.number().int().min(1).max(20).default(1),
      targetSelectionIndex: z.number().int().min(1).max(20).default(2),
      outputName: z.string().min(1).max(120).optional(),
      legLateralScale: z.number().min(0).max(1).default(0.4),
      maxLegLateralOffset: z.number().min(0).max(1).default(0.12),
    },
  },
  async (input) => {
    try {
      if (!input.sourcePath && !input.animationName) {
        return errorContent(new Error("Provide sourcePath or animationName."));
      }
      return jsonContent(
        await bridge.execute("animation.stageR6ToR15Retarget", input, 300_000),
      );
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "get_rig_authoring_profile",
  {
    title: "Get the selected rig's anatomical authoring profile",
    description:
      "Returns topology-aware R6, R15, or custom-rig guidance, safe track space, joint roles, and recommended angular envelopes. Call before designing motion.",
    inputSchema: {},
  },
  async () => {
    try {
      const inspected = (await bridge.execute("rig.inspect", {
        includeGeometryBounds: false,
      })) as { rigType?: unknown };
      return jsonContent(profileForRigType(inspected.rigType));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "create_animation_test_rig",
  {
    title: "Create a local animation test rig",
    description:
      "Creates and selects a clearly labeled blockout humanoid rig for Motion Director validation. Use only when the user asked for a test and no suitable selected rig exists.",
    inputSchema: {
      name: z.string().min(1).max(80).default("MotionDirectorTestRig"),
      position: z
        .object({
          x: z.number().finite(),
          y: z.number().finite(),
          z: z.number().finite(),
        })
        .default({ x: 0, y: 3, z: 0 }),
    },
  },
  async (input) => {
    try {
      return jsonContent(await bridge.execute("scene.createTestRig", input));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "validate_animation_draft",
  {
    title: "Validate a professional animation draft",
    description:
      "Validates the complete semantic animation contract before anything is sent to Studio. Checks tracks, curves, beats, contacts, timing, and editability.",
    inputSchema: {
      draft: animationDraftSchema,
    },
  },
  async ({ draft }) => {
    const parsed = animationDraftSchema.parse(draft);
    return jsonContent({
      valid: validateTemporalIntegrity(parsed).length === 0,
      report: reviewDraft(parsed),
    });
  },
);

server.registerTool(
  "edit_animation_draft",
  {
    title: "Edit an animation draft with precise operations",
    description:
      "Applies bounded non-destructive operations to an existing draft: upsert poses, delete/retime/offset ranges, copy or mirror motion between joints, change easing, and densify in-betweens. Returns a complete revised draft without touching Studio.",
    inputSchema: {
      draft: animationDraftSchema,
      program: animationEditProgramSchema,
    },
  },
  async ({ draft, program }) => {
    try {
      const edited = applyAnimationEditProgram(draft, program);
      return jsonContent({
        draft: edited,
        summary: {
          operationCount: program.operations.length,
          trackCount: edited.tracks.length,
          keyCount: edited.tracks.reduce((sum, track) => sum + track.keys.length, 0),
          duration: edited.duration,
        },
        report: reviewDraft(edited),
      });
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "compose_animation_layer",
  {
    title: "Blend a professional animation layer",
    description:
      "Combines a base draft with an additive or override layer using a joint mask, time range, weight and local dense resampling. Use it for recoil, breathing, acting, upper-body attacks and non-destructive polish without resending per-frame edits.",
    inputSchema: {
      baseDraft: animationDraftSchema,
      layerDraft: animationDraftSchema,
      options: animationLayerOptionsSchema,
    },
  },
  async ({ baseDraft, layerDraft, options }) => {
    try {
      const draft = composeAnimationLayer(baseDraft, layerDraft, options);
      return jsonContent({
        draft,
        summary: {
          mode: options.mode,
          weight: options.weight,
          trackCount: draft.tracks.length,
          keyCount: draft.tracks.reduce((sum, track) => sum + track.keys.length, 0),
          sampleRate: draft.bakeFramesPerSecond,
        },
        report: reviewDraft(draft),
      });
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "stage_animation_draft",
  {
    title: "Stage an editable animation draft in Studio",
    description:
      "Creates or replaces a reversible Motion Director draft. This never publishes or overwrites the production animation and should be followed by preview and review.",
    inputSchema: {
      transactionName: z.string().min(1).max(120),
      draft: animationDraftSchema,
    },
  },
  async ({ transactionName, draft }) => {
    try {
      const parsed = animationDraftSchema.parse(draft);
      const problems = validateTemporalIntegrity(parsed);
      if (problems.length > 0) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: problems.join("\n") }],
        };
      }
      return jsonContent(
        await bridge.execute(
          "animation.stageDraft",
          { transactionName, draft: parsed },
          120_000,
        ),
      );
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "commit_animation_draft",
  {
    title: "Commit a reviewed animation draft",
    description:
      "Commits a previously staged draft into the place after explicit review. The Studio plugin records the operation for undo/redo.",
    inputSchema: {
      transactionId: z.string().min(1),
      destinationName: z.string().min(1).max(120),
    },
  },
  async (input) => {
    try {
      return jsonContent(await bridge.execute("animation.commitDraft", input, 120_000));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "stage_synchronized_multi_rig_animation",
  {
    title: "Stage one synchronized animation across multiple selected rigs",
    description:
      "Bakes one editable KeyframeSequence per selected actor under a shared transaction and timeline. Actors are addressed by their one-based order in the current Studio selection.",
    inputSchema: {
      transactionName: z.string().min(1).max(120),
      layout: z.enum(["preserve", "faceOff"]).default("preserve"),
      actorSpacing: z.number().finite().min(2).max(30).default(8),
      actors: z
        .array(
          z.object({
            actorId: z.string().min(1).max(60),
            selectionIndex: z.number().int().min(1).max(16),
            draft: animationDraftSchema,
          }),
        )
        .min(2)
        .max(16),
    },
  },
  async ({ transactionName, layout, actorSpacing, actors }) => {
    try {
      const actorIds = new Set(actors.map((actor) => actor.actorId));
      const selectionIndexes = new Set(actors.map((actor) => actor.selectionIndex));
      if (actorIds.size !== actors.length || selectionIndexes.size !== actors.length) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: "Actor ids and selection indexes must be unique within a synchronized transaction.",
            },
          ],
        };
      }
      for (const actor of actors) {
        const problems = validateTemporalIntegrity(actor.draft);
        if (problems.length > 0) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `${actor.actorId}: ${problems.join("\n")}`,
              },
            ],
          };
        }
      }
      return jsonContent(
        await bridge.execute(
          "animation.stageMultiRig",
          { transactionName, layout, actorSpacing, actors },
          120_000,
        ),
      );
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "preview_synchronized_multi_rig_animation",
  {
    title: "Preview a synchronized multi-rig draft",
    description:
      "Loads every actor sequence from one shared transaction and starts all AnimationTracks on the same Studio update.",
    inputSchema: {
      transactionId: z.string().min(1),
      looped: z.boolean().default(false),
      playbackSpeed: z.number().positive().min(0.05).max(4).default(1),
    },
  },
  async (input) => {
    try {
      return jsonContent(await bridge.execute("animation.previewMultiRig", input, 120_000));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "commit_synchronized_multi_rig_animation",
  {
    title: "Commit a synchronized multi-rig draft",
    description:
      "Commits all actor sequences into one encounter folder in ReplicatedStorage while preserving their shared timing.",
    inputSchema: {
      transactionId: z.string().min(1),
      destinationName: z.string().min(1).max(120),
    },
  },
  async (input) => {
    try {
      return jsonContent(await bridge.execute("animation.commitMultiRig", input, 120_000));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "preview_animation_draft",
  {
    title: "Preview a staged animation draft on its rig",
    description:
      "Loads a staged KeyframeSequence through the local KeyframeSequenceProvider and plays it on the selected rig without publishing an asset.",
    inputSchema: {
      transactionId: z.string().min(1),
      looped: z.boolean().default(false),
      playbackSpeed: z.number().positive().min(0.05).max(4).default(1),
    },
  },
  async (input) => {
    try {
      return jsonContent(await bridge.execute("animation.previewDraft", input, 120_000));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "preview_committed_animation",
  {
    title: "Preview a committed local animation",
    description:
      "Plays a KeyframeSequence from ReplicatedStorage.MotionDirectorAnimations on the selected rig without publishing it.",
    inputSchema: {
      animationName: z.string().min(1).max(120),
      looped: z.boolean().default(false),
      playbackSpeed: z.number().positive().min(0.05).max(4).default(1),
    },
  },
  async (input) => {
    try {
      return jsonContent(await bridge.execute("animation.previewCommitted", input, 120_000));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "preview_committed_synchronized_multi_rig_animation",
  {
    title: "Preview a committed synchronized animation in Play mode",
    description:
      "Automatically maps every committed actor sequence to the live animation rigs in Workspace and starts them together. This does not depend on Studio Selection.",
    inputSchema: {
      animationName: z.string().min(1).max(120),
      looped: z.boolean().default(false),
      playbackSpeed: z.number().positive().min(0.05).max(4).default(1),
    },
  },
  async (input) => {
    try {
      return jsonContent(
        await bridge.execute("animation.previewCommittedMultiRig", input, 120_000),
      );
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "attach_committed_animations_to_selected_rig_animsaves",
  {
    title: "Attach committed animations as editable AnimSaves",
    description:
      "Copies matching committed KeyframeSequences into ServerStorage.RBX_ANIMSAVES and creates the selected rig's AnimSaves ObjectValue reference used by Roblox Animation Editor.",
    inputSchema: {
      namePrefix: z.string().max(120).default(""),
    },
  },
  async (input) => {
    try {
      return jsonContent(await bridge.execute("animation.attachCommittedToAnimSaves", input, 120_000));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "pose_committed_animation_at_normalized_time",
  {
    title: "Pose a committed animation for edit-time visual review",
    description:
      "Without entering Play mode, applies the nearest dense keyframe from a committed animation to the selected rig at a normalized timeline position. Intended for screenshots and silhouette review.",
    inputSchema: {
      animationName: z.string().min(1).max(120),
      normalizedTime: z.number().min(0).max(1),
    },
  },
  async (input) => {
    try {
      return jsonContent(await bridge.execute("animation.poseCommittedAtTime", input, 120_000));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "create_animation_ghosts_and_motion_paths",
  {
    title: "Create Studio-native animation ghosts and motion paths",
    description:
      "Builds translucent ghost poses and colored head/limb trajectories for a committed animation directly in Edit mode, making spacing, arcs, contacts and silhouette changes visually inspectable without playback.",
    inputSchema: {
      animationName: z.string().min(1).max(120),
      normalizedTimes: z.array(z.number().min(0).max(1)).max(16).default([0, 0.25, 0.5, 0.75, 1]),
      effectors: z.array(z.string().min(1).max(120)).max(16).default(["Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"]),
      ghostTransparency: z.number().min(0.2).max(0.95).default(0.72),
      maxPathSamples: z.number().int().min(2).max(240).default(120),
    },
  },
  async (input) => {
    try {
      return jsonContent(await bridge.execute("animation.createReviewGuides", input, 120_000));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "clear_animation_review_guides",
  {
    title: "Clear animation ghosts and motion paths",
    description: "Removes the reversible MotionDirectorReviewGuides hierarchy from Workspace.",
    inputSchema: {},
  },
  async () => {
    try {
      return jsonContent(await bridge.execute("animation.clearReviewGuides", {}, 30_000));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "finalize_human_reviewed_animation_selection",
  {
    title: "Finalize up to ten human-approved review animations",
    description:
      "Promotes only the explicitly named MD_REVIEW animations into a human-approved AnimSaves library, then removes the temporary review queue. Never call before the user has visually approved the exact names.",
    inputSchema: {
      approvedNames: z.array(z.string().min(1).max(120)).min(1).max(10),
      reviewPrefix: z.string().min(1).max(80).default("MD_REVIEW_R6_"),
      approvedPrefix: z.string().min(1).max(80).default("MD_APPROVED_R6_"),
    },
  },
  async (input) => {
    try {
      return jsonContent(await bridge.execute("animation.finalizeHumanReview", input, 120_000));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "reset_selected_rig_review_pose",
  {
    title: "Reset the selected rig after edit-time visual review",
    description:
      "Stops local previews and resets Motor6D, AnimationConstraint, and Bone transforms on the selected rig without entering Play mode.",
    inputSchema: {},
  },
  async () => {
    try {
      return jsonContent(await bridge.execute("animation.resetSelectedRigPose", {}, 120_000));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "rebuild_calibrated_r15_parkour_suite_v2",
  {
    title: "Rebuild a calibrated R15 parkour suite",
    description:
      "Rebuilds the parkour suite from official R15 reference clips using direct Pose space compatible with both Motor6D.Transform and AnimationConstraint.Transform, conservative joint-local offsets, and in-place root motion.",
    inputSchema: {},
  },
  async () => {
    try {
      return jsonContent(await bridge.execute("animation.rebuildParkourV2", {}, 180_000));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  "discard_animation_draft",
  {
    title: "Discard a staged animation draft",
    description: "Safely removes a temporary Motion Director animation transaction.",
    inputSchema: {
      transactionId: z.string().min(1),
    },
  },
  async (input) => {
    try {
      return jsonContent(await bridge.execute("animation.discardDraft", input));
    } catch (error) {
      return errorContent(error);
    }
  },
);

async function main(): Promise<void> {
  await bridge.start();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Roblox Motion Director MCP ready; Studio bridge at ${bridge.host}:${bridge.port}`);
}

const shutdown = async () => {
  await bridge.stop();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
