import type { AnimationDraft, QualityReport } from "./domain.js";

type Metric = QualityReport["metrics"][number];
type Quaternion = { x: number; y: number; z: number; w: number };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function quaternionAngleDegrees(left: Quaternion, right: Quaternion): number {
  const dot = Math.abs(
    left.x * right.x + left.y * right.y + left.z * right.z + left.w * right.w,
  );
  return (2 * Math.acos(clamp(dot, -1, 1)) * 180) / Math.PI;
}

function pitchDegrees(rotation: Quaternion): number {
  const numerator = 2 * (rotation.w * rotation.x + rotation.y * rotation.z);
  const denominator = 1 - 2 * (rotation.x * rotation.x + rotation.y * rotation.y);
  return (Math.atan2(numerator, denominator) * 180) / Math.PI;
}

function yawDegrees(rotation: Quaternion): number {
  const value = 2 * (rotation.w * rotation.y - rotation.z * rotation.x);
  return (Math.asin(clamp(value, -1, 1)) * 180) / Math.PI;
}

function rollDegrees(rotation: Quaternion): number {
  const numerator = 2 * (rotation.w * rotation.z + rotation.x * rotation.y);
  const denominator = 1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z);
  return (Math.atan2(numerator, denominator) * 180) / Math.PI;
}

function unwrapDegrees(values: number[]): number[] {
  if (values.length === 0) return [];
  const unwrapped = [values[0]!];
  for (let index = 1; index < values.length; index += 1) {
    let candidate = values[index]!;
    const previous = unwrapped[index - 1]!;
    while (candidate - previous > 180) candidate -= 360;
    while (candidate - previous < -180) candidate += 360;
    unwrapped.push(candidate);
  }
  return unwrapped;
}

function track(draft: AnimationDraft, joint: string) {
  return draft.tracks.find((candidate) => candidate.joint === joint);
}

function angularTravel(draft: AnimationDraft, joint: string): number {
  const keys = track(draft, joint)?.keys ?? [];
  let travel = 0;
  for (let index = 1; index < keys.length; index += 1) {
    travel += quaternionAngleDegrees(
      keys[index - 1]!.transform.rotation,
      keys[index]!.transform.rotation,
    );
  }
  return travel;
}

function nearestPitch(draft: AnimationDraft, joint: string, time: number): number {
  const keys = track(draft, joint)?.keys ?? [];
  if (keys.length === 0) return 0;
  const nearest = keys.reduce((best, candidate) =>
    Math.abs(candidate.time - time) < Math.abs(best.time - time) ? candidate : best,
  );
  return pitchDegrees(nearest.transform.rotation);
}

function fullBodyParticipation(draft: AnimationDraft): Metric | undefined {
  if (draft.priority === "idle" || draft.metadata.style.includes("idle")) return undefined;
  const required = ["Torso", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
  const active = required.filter((joint) => angularTravel(draft, joint) >= 12);
  const score = active.length / required.length;
  return {
    name: "full_body_participation",
    score,
    severity: score < 0.8 ? "warning" : "info",
    joints: required.filter((joint) => !active.includes(joint)),
    explanation: `${active.length}/${required.length} major body tracks contribute purposeful motion.`,
    suggestedAction:
      score < 0.8
        ? "Give every major limb a mechanical role instead of rotating only the torso."
        : undefined,
  };
}

function loopClosure(draft: AnimationDraft): Metric | undefined {
  if (!draft.looped) return undefined;
  let worstAngle = 0;
  let worstPosition = 0;
  const badJoints: string[] = [];
  for (const candidate of draft.tracks) {
    const first = candidate.keys[0];
    const last = candidate.keys.at(-1);
    if (!first || !last) continue;
    const angle = quaternionAngleDegrees(first.transform.rotation, last.transform.rotation);
    const position = Math.hypot(
      first.transform.position.x - last.transform.position.x,
      first.transform.position.y - last.transform.position.y,
      first.transform.position.z - last.transform.position.z,
    );
    worstAngle = Math.max(worstAngle, angle);
    worstPosition = Math.max(worstPosition, position);
    if (angle > 1.5 || position > 0.01) badJoints.push(candidate.joint);
  }
  const score = badJoints.length === 0 ? 1 : clamp(1 - badJoints.length / draft.tracks.length, 0, 1);
  return {
    name: "loop_closure",
    score,
    severity: score < 1 ? "warning" : "info",
    joints: badJoints,
    explanation: `Loop seam deviation peaks at ${worstAngle.toFixed(1)} degrees and ${worstPosition.toFixed(3)} studs.`,
    suggestedAction:
      score < 1 ? "Match first and last transforms exactly, then preserve velocity through the seam." : undefined,
  };
}

function locomotionLean(draft: AnimationDraft): Metric | undefined {
  const styles = new Set(draft.metadata.style);
  if (![...styles].some((style) => ["natural-walk", "fast-walk", "run", "sprint"].includes(style))) {
    return undefined;
  }
  const torsoKeys = track(draft, "Torso")?.keys ?? [];
  const maximum = Math.max(0, ...torsoKeys.map((key) => Math.abs(pitchDegrees(key.transform.rotation))));
  const limit = styles.has("sprint") ? 16 : styles.has("run") ? 12 : 8;
  const score = maximum <= limit ? 1 : clamp(1 - (maximum - limit) / 20, 0, 1);
  return {
    name: "locomotion_lean_feasibility",
    score,
    severity: score < 0.8 ? "warning" : "info",
    joints: score < 0.8 ? ["Torso"] : [],
    explanation: `Maximum locomotion pitch is ${maximum.toFixed(1)} degrees; target envelope is at most ${limit} degrees.`,
    suggestedAction:
      score < 0.8 ? "Reduce the lean or increase cadence and propulsion enough to support it." : undefined,
  };
}

function locomotionCadence(draft: AnimationDraft): Metric | undefined {
  const styles = new Set(draft.metadata.style);
  const target: [number, number] | undefined =
    styles.has("natural-walk") ? [0.76, 0.96] :
    styles.has("fast-walk") ? [0.55, 0.7] :
    styles.has("run") ? [0.44, 0.56] :
    styles.has("sprint") ? [0.36, 0.46] :
    undefined;
  if (!target || !draft.looped) return undefined;
  const [minimum, maximum] = target;
  const distance =
    draft.duration < minimum ? minimum - draft.duration :
    draft.duration > maximum ? draft.duration - maximum :
    0;
  const score = clamp(1 - distance / 0.25, 0, 1);
  return {
    name: "locomotion_cadence",
    score,
    severity: score < 0.85 ? "warning" : "info",
    joints: [],
    explanation: `Cycle duration is ${draft.duration.toFixed(3)}s; expected ${minimum.toFixed(2)}-${maximum.toFixed(2)}s for this stage.`,
    suggestedAction:
      score < 0.85 ? "Change cadence as its own locomotion stage instead of merely speeding another cycle." : undefined,
  };
}

function endpointActivity(draft: AnimationDraft, atEnd: boolean): number {
  const major = ["Torso", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
  const total = major.reduce((sum, joint) => {
    const keys = track(draft, joint)?.keys ?? [];
    const key = atEnd ? keys.at(-1) : keys[0];
    if (!key) return sum;
    const identity = { x: 0, y: 0, z: 0, w: 1 };
    return sum + quaternionAngleDegrees(identity, key.transform.rotation);
  }, 0);
  return total / major.length;
}

function locomotionTransition(draft: AnimationDraft): Metric | undefined {
  const styles = new Set(draft.metadata.style);
  const starts = styles.has("locomotion-start");
  const stops = styles.has("locomotion-stop");
  if (!starts && !stops) return undefined;
  const first = endpointActivity(draft, false);
  const last = endpointActivity(draft, true);
  const neutral = starts ? first : last;
  const active = starts ? last : first;
  const neutralScore = clamp(1 - neutral / 10, 0, 1);
  const activeScore = clamp((active - 12) / 18, 0, 1);
  const durationScore = draft.duration >= 0.28 && draft.duration <= 0.65 ? 1 : 0.5;
  const score = neutralScore * 0.4 + activeScore * 0.4 + durationScore * 0.2;
  return {
    name: "locomotion_transition_handoff",
    score,
    severity: score < 0.8 ? "warning" : "info",
    joints: score < 0.8 ? ["Torso", "Right Arm", "Left Arm", "Right Leg", "Left Leg"] : [],
    explanation: `${starts ? "Start" : "Stop"} transition endpoint activity is ${first.toFixed(1)} -> ${last.toFixed(1)} degrees.`,
    suggestedAction:
      score < 0.8
        ? `Make the ${starts ? "first" : "last"} pose blend-neutral and the opposite endpoint match an active locomotion pose.`
        : undefined,
  };
}

function turnReadability(draft: AnimationDraft): Metric | undefined {
  const styles = new Set(draft.metadata.style);
  const expected = styles.has("turn-left") ? 1 : styles.has("turn-right") ? -1 : 0;
  if (expected === 0) return undefined;
  const torsoKeys = track(draft, "Torso")?.keys ?? [];
  const headKeys = track(draft, "Head")?.keys ?? [];
  const torsoYaw = Math.max(0, ...torsoKeys.map((key) => yawDegrees(key.transform.rotation) * expected));
  const headYaw = Math.max(0, ...headKeys.map((key) => yawDegrees(key.transform.rotation) * expected));
  const torsoScore = clamp(torsoYaw / 22, 0, 1);
  const headLeadScore = clamp(headYaw / 30, 0, 1);
  const timingScore = draft.duration >= 0.34 && draft.duration <= 0.62 ? 1 : 0.5;
  const score = torsoScore * 0.45 + headLeadScore * 0.35 + timingScore * 0.2;
  return {
    name: "turn_direction_readability",
    score,
    severity: score < 0.8 ? "warning" : "info",
    joints: score < 0.8 ? ["Torso", "Head"] : [],
    explanation: `${styles.has("turn-left") ? "Left" : "Right"} turn reaches ${torsoYaw.toFixed(1)} torso and ${headYaw.toFixed(1)} head-lead degrees.`,
    suggestedAction:
      score < 0.8 ? "Let the eyes/head find the direction before the torso and planted step follow." : undefined,
  };
}

function forwardDashReadability(draft: AnimationDraft): Metric | undefined {
  const styles = new Set(draft.metadata.style);
  if (!styles.has("dash") || !styles.has("forward")) return undefined;
  const torsoKeys = track(draft, "Torso")?.keys ?? [];
  if (torsoKeys.length === 0) return undefined;
  const decisive = torsoKeys.reduce((best, candidate) =>
    Math.abs(pitchDegrees(candidate.transform.rotation)) >
    Math.abs(pitchDegrees(best.transform.rotation))
      ? candidate
      : best,
  );
  const torsoPitch = pitchDegrees(decisive.transform.rotation);
  const rightArm = nearestPitch(draft, "Right Arm", decisive.time);
  const leftArm = nearestPitch(draft, "Left Arm", decisive.time);
  const rightLeg = nearestPitch(draft, "Right Leg", decisive.time);
  const leftLeg = nearestPitch(draft, "Left Leg", decisive.time);

  const projection = clamp((Math.abs(torsoPitch) - 18) / 20, 0, 1);
  const armsUnified =
    Math.sign(rightArm) === Math.sign(leftArm) &&
    Math.min(Math.abs(rightArm), Math.abs(leftArm)) >= 45;
  const legsUnified =
    Math.sign(rightLeg) === Math.sign(leftLeg) &&
    Math.min(Math.abs(rightLeg), Math.abs(leftLeg)) >= 20;
  const compactDuration = draft.duration >= 0.2 && draft.duration <= 0.42;
  const score =
    projection * 0.35 +
    (armsUnified ? 0.25 : 0) +
    (legsUnified ? 0.25 : 0) +
    (compactDuration ? 0.15 : 0);
  return {
    name: "forward_dash_readability",
    score,
    severity: score < 0.8 ? "warning" : "info",
    joints: [
      ...(projection < 0.7 ? ["Torso"] : []),
      ...(armsUnified ? [] : ["Right Arm", "Left Arm"]),
      ...(legsUnified ? [] : ["Right Leg", "Left Leg"]),
    ],
    explanation:
      `Decisive pose: torso ${torsoPitch.toFixed(1)} degrees, arms ${rightArm.toFixed(1)}/${leftArm.toFixed(1)}, legs ${rightLeg.toFixed(1)}/${leftLeg.toFixed(1)}.`,
    suggestedAction:
      score < 0.8
        ? "Use one projected arrow silhouette; opposing limbs read as a run stride instead of a dash."
        : undefined,
  };
}

function directionalDashReadability(draft: AnimationDraft): Metric | undefined {
  const styles = new Set(draft.metadata.style);
  if (!styles.has("dash") || styles.has("forward")) return undefined;
  const torsoKeys = track(draft, "Torso")?.keys ?? [];
  const fullBody = ["Right Arm", "Left Arm", "Right Leg", "Left Leg"]
    .filter((joint) => angularTravel(draft, joint) >= 18).length / 4;
  let directionScore = 0;
  let explanation = "";
  if (styles.has("backward")) {
    const projection = Math.max(0, ...torsoKeys.map((key) => pitchDegrees(key.transform.rotation)));
    directionScore = clamp(projection / 14, 0, 1);
    explanation = `Backward torso projection reaches ${projection.toFixed(1)} degrees.`;
  } else {
    const expected = styles.has("left") ? -1 : styles.has("right") ? 1 : 0;
    if (expected === 0) return undefined;
    const bank = Math.max(
      0,
      ...torsoKeys.map((key) => rollDegrees(key.transform.rotation) * expected),
    );
    directionScore = clamp(bank / 16, 0, 1);
    explanation = `${styles.has("left") ? "Left" : "Right"} body bank reaches ${bank.toFixed(1)} degrees.`;
  }
  const timing = draft.duration >= 0.25 && draft.duration <= 0.48 ? 1 : 0.5;
  const score = directionScore * 0.55 + fullBody * 0.3 + timing * 0.15;
  return {
    name: "directional_dash_readability",
    score,
    severity: score < 0.8 ? "warning" : "info",
    joints: score < 0.8 ? ["Torso"] : [],
    explanation,
    suggestedAction:
      score < 0.8 ? "Commit the torso bank/projection and make every limb support that travel direction." : undefined,
  };
}

function rollContinuity(draft: AnimationDraft): Metric | undefined {
  const styles = new Set(draft.metadata.style);
  const axis = styles.has("forward-roll") ? "pitch" : styles.has("side-roll") ? "roll" : undefined;
  if (!axis) return undefined;
  const torso = track(draft, "Torso");
  if (!torso) return undefined;
  const wrapped = torso.keys.map((key) =>
    axis === "pitch" ? pitchDegrees(key.transform.rotation) : rollDegrees(key.transform.rotation),
  );
  const values = unwrapDegrees(wrapped);
  let travel = 0;
  let reversal = 0;
  const overall = values.at(-1)! - values[0]!;
  const direction = Math.sign(overall || 1);
  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index]! - values[index - 1]!;
    travel += Math.abs(delta);
    if (Math.sign(delta) !== direction && Math.abs(delta) > 1) reversal += Math.abs(delta);
  }
  const score = clamp(travel / 340, 0, 1) * 0.7 + clamp(1 - reversal / 45, 0, 1) * 0.3;
  return {
    name: "roll_rotation_continuity",
    score,
    severity: score < 0.85 ? "warning" : "info",
    joints: score < 0.85 ? ["Torso"] : [],
    explanation: `${axis} roll covers ${travel.toFixed(1)} degrees with ${reversal.toFixed(1)} degrees of reversal.`,
    suggestedAction:
      score < 0.85 ? "Key the complete turn in one direction with increments below 180 degrees." : undefined,
  };
}

function combatStrikeCommitment(draft: AnimationDraft): Metric | undefined {
  const styles = new Set(draft.metadata.style);
  if (!styles.has("combat-strike")) return undefined;
  const striker =
    styles.has("right-hand") ? "Right Arm" :
    styles.has("left-hand") ? "Left Arm" :
    styles.has("right-leg") ? "Right Leg" :
    styles.has("left-leg") ? "Left Leg" :
    undefined;
  if (!striker) return undefined;
  const strikerTravel = angularTravel(draft, striker);
  const torsoTravel = angularTravel(draft, "Torso");
  const impact = draft.beats.find((beat) => beat.id === "impact");
  const anticipation = draft.beats.find((beat) => beat.id === "anticipation");
  const limbScore = clamp((strikerTravel - 35) / 75, 0, 1);
  const bodyScore = clamp((torsoTravel - 8) / 30, 0, 1);
  const impactScore =
    impact && impact.endTime - impact.startTime <= draft.duration * 0.24 ? 1 : 0;
  const anticipationScore =
    anticipation && impact && anticipation.endTime <= impact.startTime ? 1 : 0;
  const score =
    limbScore * 0.4 + bodyScore * 0.25 + impactScore * 0.2 + anticipationScore * 0.15;
  return {
    name: "combat_strike_commitment",
    score,
    severity: score < 0.8 ? "warning" : "info",
    joints: [
      ...(limbScore < 0.75 ? [striker] : []),
      ...(bodyScore < 0.65 ? ["Torso"] : []),
    ],
    explanation: `${striker} travels ${strikerTravel.toFixed(1)} degrees while the torso contributes ${torsoTravel.toFixed(1)} degrees.`,
    suggestedAction:
      score < 0.8
        ? "Lead with the actual striking limb, support it with hips/torso, and reserve a short explicit impact window."
        : undefined,
  };
}

function denseSampling(draft: AnimationDraft): Metric | undefined {
  if (!draft.metadata.style.includes("dense-sampled")) return undefined;
  const frameDuration = 1 / draft.framesPerSecond;
  let maximumGapFrames = 0;
  for (const candidate of draft.tracks) {
    for (let index = 1; index < candidate.keys.length; index += 1) {
      const gap = candidate.keys[index]!.time - candidate.keys[index - 1]!.time;
      maximumGapFrames = Math.max(maximumGapFrames, gap / frameDuration);
    }
  }
  const score =
    maximumGapFrames <= 1.1 ? 1 :
    maximumGapFrames <= 2.1 ? 0.8 :
    clamp(1 - (maximumGapFrames - 2) / 6, 0, 1);
  return {
    name: "dense_temporal_sampling",
    score,
    severity: score < 0.8 ? "warning" : "info",
    joints: [],
    explanation: `Largest authored interval is ${maximumGapFrames.toFixed(2)} frames.`,
    suggestedAction:
      score < 0.8
        ? "Sample the designed motion curve every one or two frames before baking the KeyframeSequence."
        : undefined,
  };
}

function easingContinuity(draft: AnimationDraft): Metric | undefined {
  if (!draft.metadata.style.includes("dense-sampled")) return undefined;
  let movingSegments = 0;
  let continuousSegments = 0;
  for (const candidate of draft.tracks) {
    for (let index = 0; index < candidate.keys.length - 1; index += 1) {
      const current = candidate.keys[index]!;
      const next = candidate.keys[index + 1]!;
      const movement = quaternionAngleDegrees(
        current.transform.rotation,
        next.transform.rotation,
      );
      if (movement < 0.25) continue;
      movingSegments += 1;
      if (
        current.easing.style === "linear" ||
        (current.easing.style === "cubicV2" && current.easing.direction !== "inOut")
      ) {
        continuousSegments += 1;
      }
    }
  }
  const score = movingSegments === 0 ? 0 : continuousSegments / movingSegments;
  return {
    name: "easing_velocity_continuity",
    score,
    severity: score < 0.9 ? "warning" : "info",
    joints: [],
    explanation: `${continuousSegments}/${movingSegments} moving segments avoid a forced slow-in/slow-out reset.`,
    suggestedAction:
      score < 0.9
        ? "Do not apply InOut to every dense key. Bake the intended curve into per-frame values and interpolate those samples linearly."
        : undefined,
  };
}

function velocitySpikeHealth(draft: AnimationDraft): Metric | undefined {
  if (!draft.metadata.style.includes("dense-sampled")) return undefined;
  let comparisons = 0;
  let spikes = 0;
  const spikeJoints = new Set<string>();
  for (const candidate of draft.tracks) {
    const speeds: number[] = [];
    for (let index = 1; index < candidate.keys.length; index += 1) {
      const previous = candidate.keys[index - 1]!;
      const current = candidate.keys[index]!;
      const delta = current.time - previous.time;
      if (delta <= 0) continue;
      speeds.push(
        quaternionAngleDegrees(previous.transform.rotation, current.transform.rotation) / delta,
      );
    }
    for (let index = 1; index < speeds.length; index += 1) {
      const previous = speeds[index - 1]!;
      const current = speeds[index]!;
      if (Math.max(previous, current) < 20) continue;
      comparisons += 1;
      const ratio = Math.max(previous, current) / Math.max(8, Math.min(previous, current));
      if (ratio > 3.5) {
        spikes += 1;
        spikeJoints.add(candidate.joint);
      }
    }
  }
  const score = comparisons === 0 ? 1 : clamp(1 - spikes / comparisons * 4, 0, 1);
  return {
    name: "angular_velocity_spike_health",
    score,
    severity: score < 0.82 ? "warning" : "info",
    joints: [...spikeJoints],
    explanation: `${spikes}/${comparisons} adjacent moving samples contain an unexplained velocity ratio above 3.5x.`,
    suggestedAction:
      score < 0.82
        ? "Redistribute spacing across neighboring frames or mark a genuinely intentional impact."
        : undefined,
  };
}

function overlapTiming(draft: AnimationDraft): Metric | undefined {
  if (!draft.metadata.style.includes("dense-sampled")) return undefined;
  const peakIndices = new Set<number>();
  for (const joint of ["Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg"]) {
    const keys = track(draft, joint)?.keys ?? [];
    let peak = -1;
    let peakSpeed = -1;
    for (let index = 1; index < keys.length; index += 1) {
      const previous = keys[index - 1]!;
      const current = keys[index]!;
      const delta = current.time - previous.time;
      if (delta <= 0) continue;
      const speed = quaternionAngleDegrees(previous.transform.rotation, current.transform.rotation) / delta;
      if (speed > peakSpeed) {
        peakSpeed = speed;
        peak = index;
      }
    }
    if (peak >= 0) peakIndices.add(peak);
  }
  const score = clamp((peakIndices.size - 1) / 3, 0, 1);
  return {
    name: "overlap_timing_diversity",
    score,
    severity: score < 0.65 ? "warning" : "info",
    joints: [],
    explanation: `${peakIndices.size} distinct peak-motion frames exist across the six R6 body tracks.`,
    suggestedAction:
      score < 0.65
        ? "Offset head, torso and limb peaks by one or more frames so the body does not start and stop as a single block."
        : undefined,
  };
}

function backflipContinuity(draft: AnimationDraft): Metric | undefined {
  const styles = new Set(draft.metadata.style);
  if (!styles.has("backflip")) return undefined;
  const torso = track(draft, "Torso");
  if (!torso) return undefined;
  const pitches = unwrapDegrees(torso.keys.map((key) => pitchDegrees(key.transform.rotation)));
  const signedRotation = pitches.at(-1)! - pitches[0]!;
  let pathTravel = 0;
  let reverseTravel = 0;
  const direction = Math.sign(signedRotation || 1);
  for (let index = 1; index < pitches.length; index += 1) {
    const delta = pitches[index]! - pitches[index - 1]!;
    pathTravel += Math.abs(delta);
    if (Math.sign(delta) !== direction && Math.abs(delta) > 1) reverseTravel += Math.abs(delta);
  }
  const maximumHeight = Math.max(...torso.keys.map((key) => key.transform.position.y));
  const rotationScore = clamp(pathTravel / 340, 0, 1);
  const continuityScore = clamp(1 - reverseTravel / 45, 0, 1);
  const arcScore = clamp(maximumHeight / 0.3, 0, 1);
  const score = rotationScore * 0.5 + continuityScore * 0.3 + arcScore * 0.2;
  return {
    name: "backflip_rotation_continuity",
    score,
    severity: score < 0.85 ? "warning" : "info",
    joints: score < 0.85 ? ["Torso"] : [],
    explanation:
      `Rotation path covers ${pathTravel.toFixed(1)} degrees with ${reverseTravel.toFixed(1)} degrees of reversal and a ${maximumHeight.toFixed(2)} stud authored arc.`,
    suggestedAction:
      score < 0.85
        ? "Key the flip in sub-180-degree increments, keep one rotation direction, and preserve a clear airborne apex."
        : undefined,
  };
}

export function evaluatePerformance(draft: AnimationDraft): Metric[] {
  return [
    fullBodyParticipation(draft),
    loopClosure(draft),
    locomotionLean(draft),
    locomotionCadence(draft),
    locomotionTransition(draft),
    turnReadability(draft),
    forwardDashReadability(draft),
    directionalDashReadability(draft),
    rollContinuity(draft),
    combatStrikeCommitment(draft),
    backflipContinuity(draft),
    denseSampling(draft),
    easingContinuity(draft),
    velocitySpikeHealth(draft),
    overlapTiming(draft),
  ].filter((metric): metric is Metric => metric !== undefined);
}
