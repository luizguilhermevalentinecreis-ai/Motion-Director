import type { AnimationDraft, QualityReport } from "./domain.js";
import { validateTemporalIntegrity } from "./domain.js";
import { profileForRigType } from "./rig-profiles.js";
import { evaluatePerformance } from "./performance-evaluator.js";

export function reviewDraft(draft: AnimationDraft): QualityReport {
  const metrics: QualityReport["metrics"] = [];
  const blockingIssues = validateTemporalIntegrity(draft);
  const frameDuration = 1 / draft.framesPerSecond;
  const rigType = draft.metadata.rigType;
  const styles = new Set(draft.metadata.style);
  const usesR6CombatDisplacement =
    rigType === "R6" &&
    draft.priority.startsWith("action") &&
    styles.has("r6-combat-displacement");
  const usesR6ExtremeSkillDisplacement =
    usesR6CombatDisplacement && styles.has("r6-anime-extreme-displacement");
  const usesR6LocomotionDisplacement =
    rigType === "R6" &&
    draft.priority === "movement";
  const usesR6IdleDisplacement =
    rigType === "R6" &&
    draft.priority === "idle";
  const usesR6PoseStudyDisplacement =
    rigType === "R6" &&
    styles.has("pose-study");

  const populatedTracks = draft.tracks.filter((track) => track.keys.length >= 2);
  const coverage = draft.tracks.length === 0 ? 0 : populatedTracks.length / draft.tracks.length;
  metrics.push({
    name: "track_coverage",
    score: coverage,
    severity: coverage < 0.65 ? "warning" : "info",
    joints: [],
    explanation: `${populatedTracks.length}/${draft.tracks.length} tracks contain motion.`,
    suggestedAction:
      coverage < 0.65 ? "Author at least two purposeful keys on every participating joint." : undefined,
  });

  if (rigType) {
    const profile = profileForRigType(rigType);
    const worldSpaceJointSolved = styles.has("world-space-joint-solved");
    const parentSpaceTracks = draft.tracks.filter(
      (track) => track.space === "parent" || (worldSpaceJointSolved && track.space === "motor"),
    );
    const safeSpaceScore =
      draft.tracks.length === 0 ? 0 : parentSpaceTracks.length / draft.tracks.length;
    metrics.push({
      name: "rig_axis_safety",
      score: safeSpaceScore,
      severity: safeSpaceScore < 1 ? "warning" : "info",
      joints: draft.tracks
        .filter((track) => track.space === "motor" || track.space === "local")
        .map((track) => track.joint),
      explanation:
        safeSpaceScore === 1
          ? worldSpaceJointSolved
            ? `All ${rigType} tracks use parent-space motion or explicitly world-solved animation-joint transforms.`
            : `All ${rigType} tracks use parent-space anatomical rotations.`
          : `${draft.tracks.length - parentSpaceTracks.length} tracks bypass anatomical ${rigType} axis conversion.`,
      suggestedAction:
        safeSpaceScore < 1
          ? `Author ${rigType} motion in parent space and let Motion Director map through each Motor6D or AnimationConstraint joint basis.`
          : undefined,
    });

    const knownJoints = new Set(profile.topology);
    const unknownJoints = draft.tracks
      .map((track) => track.joint)
      .filter((joint) => !knownJoints.has(joint));
    metrics.push({
      name: "rig_topology_match",
      score: unknownJoints.length === 0 ? 1 : 0,
      severity: unknownJoints.length === 0 ? "info" : "error",
      joints: unknownJoints,
      explanation:
        unknownJoints.length === 0
          ? `Every track maps to the declared ${rigType} topology.`
          : `Tracks do not exist in the declared ${rigType} profile: ${unknownJoints.join(", ")}.`,
      suggestedAction:
        unknownJoints.length > 0 ? "Inspect the actual rig and use exact Part1/Bone names." : undefined,
    });

    const excessiveJoints = new Set<string>();
    for (const track of draft.tracks) {
      const guidance = profile.jointGuidance[track.joint];
      if (!guidance) continue;
      for (const key of track.keys) {
        const normalizedW = Math.min(1, Math.max(-1, Math.abs(key.transform.rotation.w)));
        const angleDegrees = (2 * Math.acos(normalizedW) * 180) / Math.PI;
        const angularMultiplier = usesR6ExtremeSkillDisplacement
          ? 2
          : usesR6CombatDisplacement
            ? 1.5
            : 1;
        if (angleDegrees > guidance.maxRecommendedDegrees * angularMultiplier) {
          excessiveJoints.add(track.joint);
        }
      }
    }
    metrics.push({
      name: "recommended_angular_envelope",
      score: excessiveJoints.size === 0 ? 1 : 0.5,
      severity: excessiveJoints.size === 0 ? "info" : "warning",
      joints: [...excessiveJoints],
      explanation:
        excessiveJoints.size === 0
          ? usesR6CombatDisplacement
            ? `Authored rotations remain inside the expanded ${rigType} combat envelopes.`
            : `Authored rotations remain inside the conservative ${rigType} envelopes.`
          : `Large rotations need visual proof on: ${[...excessiveJoints].join(", ")}.`,
      suggestedAction:
        excessiveJoints.size > 0
          ? "Reduce the extreme or justify it with a reviewed silhouette and valid support."
          : undefined,
    });
  }

  let invalidQuaternionCount = 0;
  for (const track of draft.tracks) {
    for (const key of track.keys) {
      const q = key.transform.rotation;
      const length = Math.hypot(q.x, q.y, q.z, q.w);
      if (Math.abs(length - 1) > 0.001) invalidQuaternionCount += 1;
    }
  }
  metrics.push({
    name: "quaternion_normalization",
    score: invalidQuaternionCount === 0 ? 1 : 0,
    severity: invalidQuaternionCount === 0 ? "info" : "error",
    joints: [],
    explanation: `${invalidQuaternionCount} non-normalized rotation quaternions detected.`,
    suggestedAction:
      invalidQuaternionCount > 0 ? "Normalize every quaternion before staging." : undefined,
  });

  if (draft.metadata.rigType === "R6") {
    const spatiallySolved = styles.has("world-space-joint-solved");
    const recommendedLimit = usesR6ExtremeSkillDisplacement
      ? 1.15
      : usesR6CombatDisplacement
        ? 0.72
        : usesR6LocomotionDisplacement
          ? 0.55
        : usesR6IdleDisplacement
            ? 0.28
          : usesR6PoseStudyDisplacement
            ? 0.25
        : spatiallySolved
          ? 0.18
          : 0.03;
    const warningLimit = usesR6ExtremeSkillDisplacement
      ? 1.5
      : usesR6CombatDisplacement
        ? 1.05
        : usesR6LocomotionDisplacement
          ? 0.8
        : usesR6IdleDisplacement
            ? 0.45
          : usesR6PoseStudyDisplacement
            ? 0.4
        : spatiallySolved
          ? 0.24
          : 0.08;
    let maximumLimbOffset = 0;
    const unsafeJoints = new Set<string>();
    for (const track of draft.tracks) {
      if (track.joint === "Torso") continue;
      for (const key of track.keys) {
        const position = key.transform.position;
        const offset = Math.hypot(position.x, position.y, position.z);
        maximumLimbOffset = Math.max(maximumLimbOffset, offset);
        if (offset > warningLimit) unsafeJoints.add(track.joint);
      }
    }
    const score =
      maximumLimbOffset <= recommendedLimit ? 1 :
      maximumLimbOffset <= warningLimit ? 0.8 :
      Math.max(0, 1 - (maximumLimbOffset - warningLimit) / 0.45);
    metrics.push({
      name: usesR6CombatDisplacement
        ? "r6_combat_displacement_envelope"
        : usesR6LocomotionDisplacement
          ? "r6_locomotion_displacement_envelope"
          : usesR6IdleDisplacement
            ? "r6_idle_displacement_envelope"
          : usesR6PoseStudyDisplacement
            ? "r6_pose_study_displacement_envelope"
        : "r6_limb_translation_safety",
      score,
      severity: unsafeJoints.size > 0 ? "warning" : "info",
      joints: [...unsafeJoints],
      explanation: usesR6CombatDisplacement
        ? `Largest R6 combat limb offset is ${maximumLimbOffset.toFixed(3)} studs; ${usesR6ExtremeSkillDisplacement ? "extreme anime skills" : "combat"} use a wider rotation-plus-translation envelope.`
        : usesR6LocomotionDisplacement
          ? `Largest R6 locomotion limb offset is ${maximumLimbOffset.toFixed(3)} studs; this contextual envelope still requires connected pivots, stable contacts, and visual review.`
          : usesR6IdleDisplacement
            ? `Largest R6 idle limb offset is ${maximumLimbOffset.toFixed(3)} studs; subtle offsets must preserve a planted silhouette and avoid whole-body drift.`
          : usesR6PoseStudyDisplacement
            ? `Largest R6 pose-study limb offset is ${maximumLimbOffset.toFixed(3)} studs; the pose still requires visual proof of connected pivots and a cleaner silhouette.`
        : `Largest non-root R6 positional offset is ${maximumLimbOffset.toFixed(3)} studs.`,
      suggestedAction:
        unsafeJoints.size > 0
          ? usesR6CombatDisplacement
            ? "Reduce the offset or prove that its arc, torso drive, and impact silhouette remain continuous."
            : usesR6LocomotionDisplacement
              ? "Reduce the offset or prove connected shoulder/hip pivots, clean foot contacts, and a readable locomotion silhouette."
              : usesR6IdleDisplacement
                ? "Reduce the offset or prove that it supports breathing, acting, or asymmetry without visible joint separation."
              : usesR6PoseStudyDisplacement
                ? "Reduce the offset or prove that it strengthens the intended silhouette without disconnecting the shoulder or hip."
            : "Return the limb to its real pivot or provide a world-space joint-continuity solve before translating it."
          : undefined,
    });
  }

  let duplicateKeyCount = 0;
  let totalKeyCount = 0;
  for (const track of draft.tracks) {
    for (let index = 0; index < track.keys.length; index += 1) {
      totalKeyCount += 1;
      const next = track.keys[index + 1];
      const current = track.keys[index]!;
      if (next && Math.abs(next.time - current.time) < frameDuration * 0.25) {
        duplicateKeyCount += 1;
      }
    }
  }
  const keyHealth = totalKeyCount === 0 ? 0 : 1 - duplicateKeyCount / totalKeyCount;
  metrics.push({
    name: "key_timing_health",
    score: keyHealth,
    severity: keyHealth < 0.9 ? "warning" : "info",
    joints: [],
    explanation: `${duplicateKeyCount} near-duplicate key timings detected.`,
    suggestedAction:
      duplicateKeyCount > 0 ? "Merge keys that are closer than a quarter frame." : undefined,
  });

  const beatCoverage =
    draft.beats.length === 0
      ? 0
      : Math.min(
          1,
          draft.beats.reduce((sum, beat) => sum + Math.max(0, beat.endTime - beat.startTime), 0) /
            draft.duration,
        );
  metrics.push({
    name: "performance_intent_coverage",
    score: beatCoverage,
    severity: beatCoverage < 0.8 ? "warning" : "info",
    joints: [],
    explanation: `${Math.round(beatCoverage * 100)}% of the timeline has explicit performance intent.`,
    suggestedAction:
      beatCoverage < 0.8 ? "Describe intention and energy for the uncovered time ranges." : undefined,
  });

  if (blockingIssues.length > 0) {
    metrics.push({
      name: "temporal_integrity",
      score: 0,
      severity: "error",
      joints: [],
      explanation: blockingIssues.join(" "),
    });
  } else {
    metrics.push({
      name: "temporal_integrity",
      score: 1,
      severity: "info",
      joints: [],
      explanation: "All authored beats, contacts, and keys fit the timeline.",
    });
  }

  metrics.push(...evaluatePerformance(draft));

  const overallScore =
    metrics.reduce((sum, metric) => sum + metric.score, 0) / Math.max(1, metrics.length);

  return { overallScore, metrics, blockingIssues };
}
