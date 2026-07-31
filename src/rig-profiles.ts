export interface RigAuthoringProfile {
  rigType: "R6" | "R15" | "Custom";
  preferredTrackSpace: "parent";
  topology: string[];
  principles: string[];
  jointGuidance: Record<
    string,
    {
      role: string;
      maxRecommendedDegrees: number;
      notes: string;
    }
  >;
}

const sharedPrinciples = [
  "Author anatomical rotations in parent-part space, never assumed Motor6D or AnimationConstraint axes.",
  "Establish support, root motion, and torso intent before posing extremities.",
  "Use world-space contacts as constraints, then solve them back into the joint hierarchy.",
  "Inspect the actual joint system and its C0/C1 or Attachment0/Attachment1 bases; names alone do not define an axis basis.",
];

export const R6_PROFILE: RigAuthoringProfile = {
  rigType: "R6",
  preferredTrackSpace: "parent",
  topology: ["Torso", "Head", "Left Arm", "Right Arm", "Left Leg", "Right Leg"],
  principles: [
    ...sharedPrinciples,
    "R6 limbs are rigid. Never imply an elbow, wrist, knee, or ankle bend that the topology cannot perform.",
    "Create force through whole-body lean, torso yaw, shoulder arcs, hip counter-rotation, timing, and silhouette.",
    "Begin R6 locomotion with limb translation near zero, then allow calibrated local offsets only when they improve silhouette, foot continuity, or proportion while preserving a visibly connected shoulder or hip pivot.",
    "Combat has a wider motion envelope: combine purposeful limb displacement with rotation, torso drive, and a continuous action arc to sell reach and impact.",
    "Never reuse locomotion displacement limits for an anime skill; validate attacking, supporting, and recovering phases by their different roles.",
    "Extreme anime attacks may move a rigid limb roughly a full stud when the silhouette, support axis, torso counter-motion, and recovery arc all justify it.",
    "Favor fewer, clearer artistic decisions and controlled holds; dense output is valid when it samples an already-designed mocap-like curve rather than inventing noise.",
  ],
  jointGuidance: {
    Torso: {
      role: "root, center of mass, and primary force driver",
      maxRecommendedDegrees: 45,
      notes: "Combine modest pitch, yaw, and roll. Large rotation needs compensating leg support.",
    },
    Head: {
      role: "gaze, anticipation, and counterbalance",
      maxRecommendedDegrees: 55,
      notes: "Lead target acquisition, then lag slightly behind high-energy torso changes.",
    },
    "Left Arm": {
      role: "rigid shoulder-driven arc",
      maxRecommendedDegrees: 125,
      notes: "Design the full arm silhouette from the shoulder; there is no elbow.",
    },
    "Right Arm": {
      role: "rigid shoulder-driven arc",
      maxRecommendedDegrees: 125,
      notes: "Design the full arm silhouette from the shoulder; there is no elbow.",
    },
    "Left Leg": {
      role: "rigid hip-driven support or swing",
      maxRecommendedDegrees: 65,
      notes: "Do not fake knee flexion. Lower the root and rotate the entire leg for compression.",
    },
    "Right Leg": {
      role: "rigid hip-driven support or swing",
      maxRecommendedDegrees: 65,
      notes: "Do not fake knee flexion. Lower the root and rotate the entire leg for compression.",
    },
  },
};

export const R15_PROFILE: RigAuthoringProfile = {
  rigType: "R15",
  preferredTrackSpace: "parent",
  topology: [
    "LowerTorso",
    "UpperTorso",
    "Head",
    "LeftUpperArm",
    "LeftLowerArm",
    "LeftHand",
    "RightUpperArm",
    "RightLowerArm",
    "RightHand",
    "LeftUpperLeg",
    "LeftLowerLeg",
    "LeftFoot",
    "RightUpperLeg",
    "RightLowerLeg",
    "RightFoot",
  ],
  principles: [
    ...sharedPrinciples,
    "Detect whether this R15 uses Avatar Joint Upgrade AnimationConstraints, legacy Motor6Ds, or a hybrid before authoring any track.",
    "For AnimationConstraint R15, use each constraint's Part1 as the Pose track name and read the attachment-derived C0/C1 aliases without modifying RigAttachment CFrames.",
    "AnimationConstraint.Transform and Motor6D.Transform share the same authored local offset semantics, but force-driven constraints may visibly lag when IsKinematic is false.",
    "Distribute action through the chain. Avoid placing an entire reach or strike in one shoulder or hip.",
    "Solve hands and feet as effectors while preserving elbow and knee pole directions.",
    "Split torso twist between LowerTorso and UpperTorso, normally weighting the lower segment more for force.",
    "Use hands and feet for contact orientation and final accents, not to repair a broken upstream pose.",
  ],
  jointGuidance: {
    LowerTorso: {
      role: "pelvis, center of mass, and locomotor force",
      maxRecommendedDegrees: 40,
      notes: "Lead grounded actions and carry most root-facing change.",
    },
    UpperTorso: {
      role: "chest twist, counter-rotation, and upper-body expression",
      maxRecommendedDegrees: 50,
      notes: "Layer on the pelvis rather than replacing pelvis mechanics.",
    },
    Head: {
      role: "gaze and emotional focus",
      maxRecommendedDegrees: 60,
      notes: "Coordinate with chest focus and preserve readable neck alignment.",
    },
    LeftUpperArm: {
      role: "shoulder swing and arm line",
      maxRecommendedDegrees: 135,
      notes: "Reserve axial twist for distributing orientation down the chain.",
    },
    RightUpperArm: {
      role: "shoulder swing and arm line",
      maxRecommendedDegrees: 135,
      notes: "Reserve axial twist for distributing orientation down the chain.",
    },
    LeftLowerArm: {
      role: "elbow articulation",
      maxRecommendedDegrees: 145,
      notes: "Respect the elbow pole and avoid hyperextension.",
    },
    RightLowerArm: {
      role: "elbow articulation",
      maxRecommendedDegrees: 145,
      notes: "Respect the elbow pole and avoid hyperextension.",
    },
    LeftUpperLeg: {
      role: "hip swing and support",
      maxRecommendedDegrees: 105,
      notes: "Coordinate with pelvis shift and foot contact.",
    },
    RightUpperLeg: {
      role: "hip swing and support",
      maxRecommendedDegrees: 105,
      notes: "Coordinate with pelvis shift and foot contact.",
    },
    LeftLowerLeg: {
      role: "knee articulation",
      maxRecommendedDegrees: 145,
      notes: "Maintain a stable forward knee pole.",
    },
    RightLowerLeg: {
      role: "knee articulation",
      maxRecommendedDegrees: 145,
      notes: "Maintain a stable forward knee pole.",
    },
  },
};

export function profileForRigType(rigType: unknown): RigAuthoringProfile {
  if (rigType === "R6") return R6_PROFILE;
  if (rigType === "R15") return R15_PROFILE;
  return {
    rigType: "Custom",
    preferredTrackSpace: "parent",
    topology: [],
    principles: [
      ...sharedPrinciples,
      "Infer chains from Motor6D, AnimationConstraint, or Bone hierarchy and require explicit anatomical axis calibration.",
    ],
    jointGuidance: {},
  };
}
