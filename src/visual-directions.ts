export type FoundationAction =
  | "idle"
  | "walk"
  | "run"
  | "sprint"
  | "start"
  | "stop"
  | "turn"
  | "dash"
  | "jump"
  | "land";

export type ArmCarriage =
  | "relaxed"
  | "athletic"
  | "guarded"
  | "protective"
  | "heavy"
  | "stealth"
  | "open"
  | "trailing"
  | "panic"
  | "stylized";

export interface VisualDirection {
  id: string;
  action: FoundationAction;
  name: string;
  thesis: string;
  pace: number;
  energy: number;
  weight: number;
  asymmetry: number;
  overlapFrames: number;
  forwardLean: number;
  lateralBias: number;
  armCarriage: ArmCarriage;
  tags: string[];
}

type DirectionSeed = Omit<VisualDirection, "id" | "action">;

const groups: Record<FoundationAction, DirectionSeed[]> = {
  idle: [
    { name: "Everyday Breathing", thesis: "Neutral weight with quiet breath-led torso motion and tiny delayed head correction.", pace: 0.42, energy: 0.24, weight: 0.5, asymmetry: 0.08, overlapFrames: 2, forwardLean: 0, lateralBias: 0.04, armCarriage: "relaxed", tags: ["naturalistic", "breathing"] },
    { name: "Alert Sentry", thesis: "Stable lower body, lifted attention and small scanning impulses led by the head.", pace: 0.62, energy: 0.46, weight: 0.58, asymmetry: 0.16, overlapFrames: 1, forwardLean: 2, lateralBias: 0.08, armCarriage: "guarded", tags: ["alert", "controlled"] },
    { name: "Cold Shiver", thesis: "Compressed silhouette with irregular micro-contractions that propagate from torso to limbs.", pace: 0.78, energy: 0.38, weight: 0.43, asymmetry: 0.22, overlapFrames: 1, forwardLean: 4, lateralBias: 0.12, armCarriage: "protective", tags: ["cold", "irregular"] },
    { name: "Spent Survivor", thesis: "Heavy breathing, lowered chest and delayed arm recovery after each breath.", pace: 0.34, energy: 0.31, weight: 0.82, asymmetry: 0.18, overlapFrames: 3, forwardLean: 8, lateralBias: 0.1, armCarriage: "heavy", tags: ["exhausted", "weighted"] },
    { name: "Injured Guard", thesis: "One-sided protection with weight kept away from the painful side and guarded breathing.", pace: 0.38, energy: 0.35, weight: 0.7, asymmetry: 0.62, overlapFrames: 2, forwardLean: 6, lateralBias: -0.42, armCarriage: "protective", tags: ["injured-left", "defensive"] },
    { name: "Cocky Challenge", thesis: "Open chest, offset hip and deliberately late head movement that reads as confidence.", pace: 0.46, energy: 0.52, weight: 0.48, asymmetry: 0.44, overlapFrames: 3, forwardLean: -3, lateralBias: 0.28, armCarriage: "open", tags: ["confident", "taunting"] },
    { name: "Listening in Shadow", thesis: "Low-noise stance where the head leads tiny directional changes and the body follows.", pace: 0.3, energy: 0.28, weight: 0.55, asymmetry: 0.3, overlapFrames: 3, forwardLean: 5, lateralBias: -0.16, armCarriage: "stealth", tags: ["stealth", "listening"] },
    { name: "Armored Rest", thesis: "Minimal range with slow settling, suggesting inertia and equipment resisting every adjustment.", pace: 0.25, energy: 0.3, weight: 1, asymmetry: 0.12, overlapFrames: 4, forwardLean: 2, lateralBias: 0.08, armCarriage: "heavy", tags: ["armored", "inertial"] },
    { name: "Restless Countdown", thesis: "Frequent weight swaps and impatient limb preparation without committing to travel.", pace: 0.88, energy: 0.6, weight: 0.4, asymmetry: 0.35, overlapFrames: 1, forwardLean: 3, lateralBias: 0.2, armCarriage: "athletic", tags: ["impatient", "ready"] },
    { name: "Supernatural Stillness", thesis: "Almost frozen center with sparse, precise head and garment-like arm offsets.", pace: 0.16, energy: 0.68, weight: 0.52, asymmetry: 0.14, overlapFrames: 5, forwardLean: 0, lateralBias: 0, armCarriage: "stylized", tags: ["anime", "ominous"] },
  ],
  walk: [
    { name: "Unobserved Everyday Walk", thesis: "Efficient heel-to-toe rhythm, mild counter-rotation and no performed attitude.", pace: 0.5, energy: 0.42, weight: 0.5, asymmetry: 0.06, overlapFrames: 2, forwardLean: 2, lateralBias: 0.03, armCarriage: "relaxed", tags: ["naturalistic", "neutral"] },
    { name: "Brisk Commuter", thesis: "Purposeful short support phases with restrained but quicker arm counter-swing.", pace: 0.72, energy: 0.62, weight: 0.48, asymmetry: 0.08, overlapFrames: 2, forwardLean: 4, lateralBias: 0.04, armCarriage: "athletic", tags: ["brisk", "purposeful"] },
    { name: "Cautious Hallway", thesis: "Toe-led probing steps, head arriving before torso and reduced vertical noise.", pace: 0.34, energy: 0.35, weight: 0.56, asymmetry: 0.26, overlapFrames: 3, forwardLean: 5, lateralBias: -0.12, armCarriage: "guarded", tags: ["cautious", "probing"] },
    { name: "Exhausted Trudge", thesis: "Long double-support feeling, dropped chest and arms that trail after each weight transfer.", pace: 0.3, energy: 0.28, weight: 0.88, asymmetry: 0.2, overlapFrames: 4, forwardLean: 9, lateralBias: 0.1, armCarriage: "heavy", tags: ["exhausted", "trudge"] },
    { name: "Left-Leg Limp", thesis: "Short painful left support, compensating torso shift and protective right-side arm action.", pace: 0.36, energy: 0.34, weight: 0.72, asymmetry: 0.78, overlapFrames: 2, forwardLean: 5, lateralBias: 0.48, armCarriage: "protective", tags: ["injured-left", "limp"] },
    { name: "Heavy Armor March", thesis: "Committed foot plants, small rigid arm travel and visible inertia at each transfer.", pace: 0.42, energy: 0.58, weight: 1, asymmetry: 0.1, overlapFrames: 4, forwardLean: 3, lateralBias: 0.06, armCarriage: "heavy", tags: ["armored", "march"] },
    { name: "Silent Infiltration", thesis: "Low center, narrow steps and delayed trailing limbs designed to minimize silhouette noise.", pace: 0.4, energy: 0.48, weight: 0.45, asymmetry: 0.32, overlapFrames: 3, forwardLean: 7, lateralBias: -0.18, armCarriage: "stealth", tags: ["stealth", "quiet"] },
    { name: "Arrogant Swagger", thesis: "Slow deliberate cadence, open chest, broad lateral weight and late opposing shoulder.", pace: 0.38, energy: 0.55, weight: 0.56, asymmetry: 0.46, overlapFrames: 4, forwardLean: -2, lateralBias: 0.34, armCarriage: "open", tags: ["swagger", "confident"] },
    { name: "Fearful Retreat Walk", thesis: "Feet continue traveling while head and guarded arms repeatedly check the threat.", pace: 0.6, energy: 0.68, weight: 0.44, asymmetry: 0.38, overlapFrames: 1, forwardLean: -4, lateralBias: -0.2, armCarriage: "panic", tags: ["fear", "retreat"] },
    { name: "Hunter Entrance", thesis: "Controlled forward commitment with sparse arm motion and cinematic head stabilization.", pace: 0.44, energy: 0.72, weight: 0.62, asymmetry: 0.24, overlapFrames: 3, forwardLean: 4, lateralBias: 0.12, armCarriage: "stylized", tags: ["anime", "cinematic"] },
  ],
  run: [
    { name: "Sustainable Human Run", thesis: "Balanced cadence, clear airborne passing and economical counter-swing.", pace: 0.62, energy: 0.66, weight: 0.5, asymmetry: 0.06, overlapFrames: 2, forwardLean: 6, lateralBias: 0.03, armCarriage: "athletic", tags: ["naturalistic", "endurance"] },
    { name: "Fresh Acceleration Run", thesis: "Stride amplitude grows across the clip while torso commitment precedes the limbs.", pace: 0.76, energy: 0.82, weight: 0.46, asymmetry: 0.1, overlapFrames: 2, forwardLean: 9, lateralBias: 0.04, armCarriage: "athletic", tags: ["accelerating", "fresh"] },
    { name: "Pursued Flight", thesis: "Fast uneven breath rhythm, wider arm action and small threat-checking head offsets.", pace: 0.9, energy: 0.96, weight: 0.42, asymmetry: 0.28, overlapFrames: 1, forwardLean: 11, lateralBias: -0.1, armCarriage: "panic", tags: ["fear", "pursued"] },
    { name: "End-of-Race Fatigue", thesis: "Cadence remains but vertical control decays, shoulders lag and stride symmetry breaks.", pace: 0.68, energy: 0.58, weight: 0.78, asymmetry: 0.42, overlapFrames: 4, forwardLean: 10, lateralBias: 0.22, armCarriage: "heavy", tags: ["exhausted", "fatigue"] },
    { name: "Injured Escape Run", thesis: "One leg cycles shorter, torso unloads the injured side and arms stabilize imbalance.", pace: 0.64, energy: 0.7, weight: 0.7, asymmetry: 0.74, overlapFrames: 2, forwardLean: 8, lateralBias: 0.46, armCarriage: "protective", tags: ["injured-right", "escape"] },
    { name: "Armored Charge", thesis: "Short forceful steps, reduced flight and heavy upper-body follow-through.", pace: 0.58, energy: 0.84, weight: 1, asymmetry: 0.14, overlapFrames: 4, forwardLean: 8, lateralBias: 0.08, armCarriage: "heavy", tags: ["armored", "charge"] },
    { name: "Low Stealth Run", thesis: "Compressed silhouette, reduced bob and arms kept near the body while cadence stays urgent.", pace: 0.72, energy: 0.74, weight: 0.48, asymmetry: 0.22, overlapFrames: 3, forwardLean: 12, lateralBias: -0.14, armCarriage: "stealth", tags: ["stealth", "low-profile"] },
    { name: "Athletic Track Form", thesis: "Clean sagittal drive, disciplined arms and almost no unnecessary lateral motion.", pace: 0.82, energy: 0.86, weight: 0.44, asymmetry: 0.03, overlapFrames: 1, forwardLean: 8, lateralBias: 0, armCarriage: "athletic", tags: ["sports", "disciplined"] },
    { name: "Desperate Last Push", thesis: "Overextended stride, aggressive arms and imperfect recovery that nearly loses balance.", pace: 0.94, energy: 1, weight: 0.4, asymmetry: 0.36, overlapFrames: 1, forwardLean: 13, lateralBias: 0.18, armCarriage: "panic", tags: ["desperate", "maximum-effort"] },
    { name: "Anime Speed Run", thesis: "Long graphic lines, stabilized head and trailing limbs shaped for a readable speed silhouette.", pace: 0.88, energy: 0.98, weight: 0.38, asymmetry: 0.16, overlapFrames: 3, forwardLean: 14, lateralBias: 0.06, armCarriage: "trailing", tags: ["anime", "speed"] },
  ],
  sprint: [
    { name: "Biomechanical Sprint", thesis: "High knee drive implied through R6 hips, forceful arms and brief support.", pace: 0.9, energy: 0.94, weight: 0.46, asymmetry: 0.04, overlapFrames: 1, forwardLean: 10, lateralBias: 0.02, armCarriage: "athletic", tags: ["naturalistic", "sprint"] },
    { name: "Block-Start Sprint", thesis: "Early torso projection that gradually rises while stride range opens.", pace: 0.94, energy: 1, weight: 0.45, asymmetry: 0.08, overlapFrames: 1, forwardLean: 15, lateralBias: 0.03, armCarriage: "athletic", tags: ["acceleration", "track"] },
    { name: "Predator Chase", thesis: "Stable gaze, economical torso and explosive limbs with little fear noise.", pace: 0.92, energy: 0.98, weight: 0.52, asymmetry: 0.12, overlapFrames: 2, forwardLean: 12, lateralBias: -0.04, armCarriage: "guarded", tags: ["predator", "focused"] },
    { name: "Prey Panic Sprint", thesis: "Threat-driven head checks and unstable lateral corrections layered over maximum speed.", pace: 1, energy: 1, weight: 0.38, asymmetry: 0.44, overlapFrames: 1, forwardLean: 13, lateralBias: 0.2, armCarriage: "panic", tags: ["prey", "panic"] },
    { name: "Wounded Final Sprint", thesis: "Explosive intent fighting a shortened injured-side cycle and protective torso bias.", pace: 0.84, energy: 0.9, weight: 0.7, asymmetry: 0.76, overlapFrames: 2, forwardLean: 12, lateralBias: -0.48, armCarriage: "protective", tags: ["injured-left", "urgent"] },
    { name: "Heavy Juggernaut Sprint", thesis: "Lower cadence but enormous plant force and upper body lag suggesting mass.", pace: 0.7, energy: 0.96, weight: 1, asymmetry: 0.12, overlapFrames: 4, forwardLean: 11, lateralBias: 0.08, armCarriage: "heavy", tags: ["juggernaut", "massive"] },
    { name: "Ninja Burst Sprint", thesis: "Low center, nearly silent vertical track and limbs that trail into narrow lines.", pace: 0.96, energy: 0.98, weight: 0.4, asymmetry: 0.18, overlapFrames: 3, forwardLean: 16, lateralBias: -0.08, armCarriage: "trailing", tags: ["stealth", "ninja"] },
    { name: "Heroic Rescue Sprint", thesis: "Open readable chest rhythm and decisive head target despite maximum movement.", pace: 0.9, energy: 0.96, weight: 0.5, asymmetry: 0.08, overlapFrames: 2, forwardLean: 10, lateralBias: 0.04, armCarriage: "open", tags: ["heroic", "rescue"] },
    { name: "Uncontrolled Overdrive", thesis: "Cadence exceeds recovery, arms widen and the body repeatedly catches itself.", pace: 1, energy: 1, weight: 0.36, asymmetry: 0.5, overlapFrames: 1, forwardLean: 15, lateralBias: 0.28, armCarriage: "panic", tags: ["overdrive", "unstable"] },
    { name: "Supreme-Speed Silhouette", thesis: "Graphic forward wedge with synchronized trailing shapes and delayed recovery accents.", pace: 0.98, energy: 1, weight: 0.35, asymmetry: 0.2, overlapFrames: 3, forwardLean: 17, lateralBias: 0.06, armCarriage: "stylized", tags: ["anime", "supreme-speed"] },
  ],
  start: [
    { name: "Casual Walk Initiation", thesis: "Weight chooses a support leg before the first relaxed step opens.", pace: 0.42, energy: 0.38, weight: 0.5, asymmetry: 0.16, overlapFrames: 2, forwardLean: 2, lateralBias: 0.1, armCarriage: "relaxed", tags: ["naturalistic", "walk-start"] },
    { name: "Purposeful Run Start", thesis: "Torso commits first, rear leg drives and arm amplitude grows into cycle scale.", pace: 0.72, energy: 0.76, weight: 0.48, asymmetry: 0.1, overlapFrames: 2, forwardLean: 8, lateralBias: 0.04, armCarriage: "athletic", tags: ["run-start", "purposeful"] },
    { name: "Sprinter Launch", thesis: "Compressed loading followed by a force line that rises over several steps.", pace: 0.94, energy: 1, weight: 0.44, asymmetry: 0.06, overlapFrames: 1, forwardLean: 16, lateralBias: 0.02, armCarriage: "athletic", tags: ["sprint-start", "explosive"] },
    { name: "Stumble Into Motion", thesis: "Balance breaks first, limbs catch the fall and only then organize into running.", pace: 0.68, energy: 0.7, weight: 0.52, asymmetry: 0.56, overlapFrames: 1, forwardLean: 13, lateralBias: 0.36, armCarriage: "open", tags: ["stumble", "recovery"] },
    { name: "Silent Launch", thesis: "Minimal anticipation, low center and narrow limb paths that conceal acceleration.", pace: 0.78, energy: 0.82, weight: 0.42, asymmetry: 0.18, overlapFrames: 3, forwardLean: 12, lateralBias: -0.1, armCarriage: "stealth", tags: ["stealth", "launch"] },
    { name: "Heavy Push-Off", thesis: "Long compression and delayed upper-body follow caused by high apparent mass.", pace: 0.48, energy: 0.78, weight: 1, asymmetry: 0.14, overlapFrames: 4, forwardLean: 10, lateralBias: 0.08, armCarriage: "heavy", tags: ["heavy", "inertia"] },
    { name: "Injured Start", thesis: "Healthy side initiates and the body protects the painful leg before accepting speed.", pace: 0.5, energy: 0.58, weight: 0.72, asymmetry: 0.8, overlapFrames: 2, forwardLean: 8, lateralBias: 0.5, armCarriage: "protective", tags: ["injured-left", "start"] },
    { name: "Panic Reaction Start", thesis: "Head recoils from danger before an unplanned explosive escape step.", pace: 0.96, energy: 1, weight: 0.38, asymmetry: 0.46, overlapFrames: 1, forwardLean: 14, lateralBias: -0.26, armCarriage: "panic", tags: ["panic", "reaction"] },
    { name: "Hero Takeoff", thesis: "Clear anticipation, open silhouette and decisive forward commitment staged for readability.", pace: 0.76, energy: 0.9, weight: 0.52, asymmetry: 0.12, overlapFrames: 2, forwardLean: 9, lateralBias: 0.04, armCarriage: "open", tags: ["heroic", "staged"] },
    { name: "Anime Vanish Start", thesis: "Near-still hold followed by a compressed two-frame force release and trailing recovery.", pace: 1, energy: 1, weight: 0.34, asymmetry: 0.2, overlapFrames: 4, forwardLean: 18, lateralBias: 0.08, armCarriage: "trailing", tags: ["anime", "vanish"] },
  ],
  stop: [
    { name: "Natural Walk Settle", thesis: "Step shortens, weight centers and arm swing decays over separate timings.", pace: 0.4, energy: 0.34, weight: 0.5, asymmetry: 0.12, overlapFrames: 3, forwardLean: 1, lateralBias: 0.06, armCarriage: "relaxed", tags: ["naturalistic", "walk-stop"] },
    { name: "Athletic Running Brake", thesis: "A planted brace reverses torso lean while arms stabilize the deceleration.", pace: 0.7, energy: 0.78, weight: 0.5, asymmetry: 0.14, overlapFrames: 2, forwardLean: -7, lateralBias: 0.08, armCarriage: "athletic", tags: ["run-stop", "brake"] },
    { name: "Long Power Skid", thesis: "Low center and prolonged friction line with trailing upper-body momentum.", pace: 0.78, energy: 0.9, weight: 0.62, asymmetry: 0.24, overlapFrames: 4, forwardLean: -12, lateralBias: 0.18, armCarriage: "open", tags: ["skid", "power"] },
    { name: "Exhausted Collapse Stop", thesis: "The stop succeeds but the body continues downward into fatigue.", pace: 0.5, energy: 0.44, weight: 0.9, asymmetry: 0.3, overlapFrames: 4, forwardLean: 12, lateralBias: 0.2, armCarriage: "heavy", tags: ["exhausted", "collapse"] },
    { name: "Injury Catch Stop", thesis: "Healthy leg catches momentum and arms protect the injured side during recovery.", pace: 0.58, energy: 0.6, weight: 0.76, asymmetry: 0.82, overlapFrames: 2, forwardLean: -5, lateralBias: -0.52, armCarriage: "protective", tags: ["injured-right", "catch"] },
    { name: "Armored Stomp Stop", thesis: "One massive final plant sends a delayed shock through torso, head and arms.", pace: 0.46, energy: 0.86, weight: 1, asymmetry: 0.18, overlapFrames: 5, forwardLean: -4, lateralBias: 0.1, armCarriage: "heavy", tags: ["armored", "stomp"] },
    { name: "Stealth Freeze", thesis: "Momentum is absorbed narrowly and every secondary motion is killed without a visible bounce.", pace: 0.64, energy: 0.72, weight: 0.46, asymmetry: 0.2, overlapFrames: 1, forwardLean: 5, lateralBias: -0.12, armCarriage: "stealth", tags: ["stealth", "freeze"] },
    { name: "Panic Look-Back Stop", thesis: "Feet brake while head and shoulders continue tracking the threat behind.", pace: 0.82, energy: 0.88, weight: 0.42, asymmetry: 0.48, overlapFrames: 2, forwardLean: -8, lateralBias: 0.32, armCarriage: "panic", tags: ["panic", "look-back"] },
    { name: "Hero Arrival Stop", thesis: "Deceleration resolves into an open balanced presentation pose.", pace: 0.66, energy: 0.82, weight: 0.54, asymmetry: 0.12, overlapFrames: 3, forwardLean: -5, lateralBias: 0.06, armCarriage: "open", tags: ["heroic", "arrival"] },
    { name: "Anime Impact Stop", thesis: "Extreme spacing into a hard graphic plant followed by staggered cloth-like limb settling.", pace: 0.94, energy: 1, weight: 0.58, asymmetry: 0.22, overlapFrames: 5, forwardLean: -14, lateralBias: 0.14, armCarriage: "stylized", tags: ["anime", "impact-stop"] },
  ],
  turn: [
    { name: "Curious Look Turn", thesis: "Eyes and head lead a mild torso turn while feet barely reorganize.", pace: 0.38, energy: 0.32, weight: 0.5, asymmetry: 0.18, overlapFrames: 3, forwardLean: 1, lateralBias: 0.1, armCarriage: "relaxed", tags: ["curious", "head-led"] },
    { name: "Cautious Corner Check", thesis: "Head probes around the corner before guarded torso and support foot follow.", pace: 0.42, energy: 0.46, weight: 0.54, asymmetry: 0.3, overlapFrames: 4, forwardLean: 5, lateralBias: -0.2, armCarriage: "guarded", tags: ["cautious", "corner"] },
    { name: "Athletic Ninety Cut", thesis: "Outside leg plants, torso banks and head finds the exit direction early.", pace: 0.8, energy: 0.84, weight: 0.48, asymmetry: 0.16, overlapFrames: 2, forwardLean: 6, lateralBias: 0.38, armCarriage: "athletic", tags: ["cut", "ninety"] },
    { name: "Emergency One-Eighty", thesis: "Head whips first, torso winds through and feet scramble to reverse travel.", pace: 0.92, energy: 0.94, weight: 0.44, asymmetry: 0.42, overlapFrames: 1, forwardLean: 4, lateralBias: -0.34, armCarriage: "panic", tags: ["one-eighty", "emergency"] },
    { name: "Injured Pivot", thesis: "Turn avoids loading the painful leg and takes a wider compensating arc.", pace: 0.44, energy: 0.48, weight: 0.76, asymmetry: 0.8, overlapFrames: 3, forwardLean: 4, lateralBias: 0.56, armCarriage: "protective", tags: ["injured-left", "pivot"] },
    { name: "Heavy Armored Turn", thesis: "Feet initiate slowly and the upper body follows with substantial rotational lag.", pace: 0.32, energy: 0.58, weight: 1, asymmetry: 0.16, overlapFrames: 5, forwardLean: 2, lateralBias: 0.18, armCarriage: "heavy", tags: ["armored", "turn"] },
    { name: "Silent Direction Change", thesis: "Narrow planted turn with low bob and restrained counterbalance.", pace: 0.64, energy: 0.66, weight: 0.46, asymmetry: 0.22, overlapFrames: 3, forwardLean: 7, lateralBias: -0.28, armCarriage: "stealth", tags: ["stealth", "direction-change"] },
    { name: "Panic Whip Turn", thesis: "Upper body over-rotates and limbs flare before balance is recovered.", pace: 0.96, energy: 1, weight: 0.4, asymmetry: 0.5, overlapFrames: 1, forwardLean: 5, lateralBias: 0.42, armCarriage: "panic", tags: ["panic", "whip"] },
    { name: "Hero Reveal Turn", thesis: "Head, torso and open arms resolve in a deliberately staged cascade.", pace: 0.56, energy: 0.72, weight: 0.54, asymmetry: 0.2, overlapFrames: 4, forwardLean: -1, lateralBias: 0.16, armCarriage: "open", tags: ["heroic", "reveal"] },
    { name: "Anime Snap Turn", thesis: "A held silhouette breaks into a fast rotation and settles with delayed limbs.", pace: 0.9, energy: 0.96, weight: 0.4, asymmetry: 0.24, overlapFrames: 5, forwardLean: 3, lateralBias: -0.3, armCarriage: "stylized", tags: ["anime", "snap"] },
  ],
  dash: [
    { name: "Grounded Forward Burst", thesis: "Short athletic projection with one clear push and no run-cycle posing.", pace: 0.82, energy: 0.86, weight: 0.48, asymmetry: 0.1, overlapFrames: 2, forwardLean: 28, lateralBias: 0.02, armCarriage: "athletic", tags: ["forward", "grounded"] },
    { name: "Low Ninja Dash", thesis: "Near-horizontal wedge, quiet vertical path and both arms trailing narrowly.", pace: 0.96, energy: 0.98, weight: 0.38, asymmetry: 0.16, overlapFrames: 3, forwardLean: 40, lateralBias: -0.06, armCarriage: "trailing", tags: ["forward", "ninja"] },
    { name: "Backward Threat Evade", thesis: "Chest stays oriented toward danger while hips and support throw the body back.", pace: 0.78, energy: 0.84, weight: 0.46, asymmetry: 0.22, overlapFrames: 2, forwardLean: -16, lateralBias: 0.08, armCarriage: "guarded", tags: ["backward", "evade"] },
    { name: "Left Slip Dash", thesis: "Compact left bank with head stabilized on the threat and limbs counterbalancing.", pace: 0.86, energy: 0.88, weight: 0.44, asymmetry: 0.26, overlapFrames: 2, forwardLean: 6, lateralBias: -0.72, armCarriage: "guarded", tags: ["left", "slip"] },
    { name: "Right Power Sidestep", thesis: "Stronger rightward plant and wider counter-swing designed for force rather than stealth.", pace: 0.74, energy: 0.86, weight: 0.62, asymmetry: 0.3, overlapFrames: 3, forwardLean: 5, lateralBias: 0.76, armCarriage: "open", tags: ["right", "power"] },
    { name: "Injured Desperation Dash", thesis: "Healthy side creates the burst while the injured side trails protectively.", pace: 0.7, energy: 0.78, weight: 0.72, asymmetry: 0.82, overlapFrames: 2, forwardLean: 24, lateralBias: 0.42, armCarriage: "protective", tags: ["forward", "injured-left"] },
    { name: "Heavy Shoulder Rush", thesis: "Lower, slower burst with massive torso commitment and delayed limbs.", pace: 0.58, energy: 0.9, weight: 1, asymmetry: 0.18, overlapFrames: 5, forwardLean: 30, lateralBias: 0.1, armCarriage: "heavy", tags: ["forward", "heavy"] },
    { name: "Panic Scramble Dash", thesis: "Unplanned direction change where arms flare and feet barely catch the center.", pace: 0.94, energy: 1, weight: 0.38, asymmetry: 0.56, overlapFrames: 1, forwardLean: 25, lateralBias: -0.34, armCarriage: "panic", tags: ["diagonal", "panic"] },
    { name: "Hero Intercept Dash", thesis: "Open readable launch aimed at placing the body between threat and target.", pace: 0.82, energy: 0.92, weight: 0.54, asymmetry: 0.12, overlapFrames: 3, forwardLean: 26, lateralBias: 0.06, armCarriage: "open", tags: ["forward", "heroic"] },
    { name: "Supreme Vanish Dash", thesis: "Extreme held anticipation, two-frame release and graphic trailing silhouette.", pace: 1, energy: 1, weight: 0.32, asymmetry: 0.2, overlapFrames: 5, forwardLean: 45, lateralBias: 0.04, armCarriage: "stylized", tags: ["forward", "anime", "vanish"] },
  ],
  jump: [
    { name: "Everyday Hop", thesis: "Small symmetric compression, modest arm help and soft airborne shape.", pace: 0.44, energy: 0.42, weight: 0.5, asymmetry: 0.06, overlapFrames: 2, forwardLean: 1, lateralBias: 0.02, armCarriage: "relaxed", tags: ["hop", "naturalistic"] },
    { name: "Athletic Vertical Jump", thesis: "Deep load, full arm swing and clear vertical extension before tuck.", pace: 0.72, energy: 0.84, weight: 0.48, asymmetry: 0.04, overlapFrames: 2, forwardLean: 2, lateralBias: 0, armCarriage: "athletic", tags: ["vertical", "athletic"] },
    { name: "Running Long Jump", thesis: "Forward velocity carries through takeoff with limbs shaping a long airborne arc.", pace: 0.78, energy: 0.86, weight: 0.46, asymmetry: 0.14, overlapFrames: 2, forwardLean: 10, lateralBias: 0.04, armCarriage: "open", tags: ["long-jump", "running"] },
    { name: "Fearful Obstacle Leap", thesis: "Late takeoff, guarded head and uneven limbs reveal uncertainty.", pace: 0.82, energy: 0.88, weight: 0.42, asymmetry: 0.48, overlapFrames: 1, forwardLean: 12, lateralBias: -0.22, armCarriage: "panic", tags: ["fear", "obstacle"] },
    { name: "Heavy Vaulting Jump", thesis: "Long compression, limited height and delayed equipment-like limb response.", pace: 0.46, energy: 0.76, weight: 1, asymmetry: 0.16, overlapFrames: 5, forwardLean: 8, lateralBias: 0.1, armCarriage: "heavy", tags: ["heavy", "vault"] },
    { name: "Silent Precision Leap", thesis: "Narrow force line, low arm noise and controlled airborne preparation for quiet landing.", pace: 0.66, energy: 0.72, weight: 0.42, asymmetry: 0.18, overlapFrames: 3, forwardLean: 9, lateralBias: -0.08, armCarriage: "stealth", tags: ["stealth", "precision"] },
    { name: "Injured One-Leg Takeoff", thesis: "Healthy leg supplies nearly all impulse while torso protects the injured side.", pace: 0.52, energy: 0.62, weight: 0.74, asymmetry: 0.84, overlapFrames: 2, forwardLean: 7, lateralBias: 0.5, armCarriage: "protective", tags: ["injured-left", "one-leg"] },
    { name: "Parkour Wall Bound", thesis: "Diagonal takeoff uses arms for direction and shapes the body for wall contact.", pace: 0.82, energy: 0.9, weight: 0.42, asymmetry: 0.4, overlapFrames: 2, forwardLean: 11, lateralBias: 0.44, armCarriage: "athletic", tags: ["parkour", "wall-bound"] },
    { name: "Heroic Rescue Leap", thesis: "Open chest and leading arms stage a clear target-directed airborne line.", pace: 0.74, energy: 0.9, weight: 0.5, asymmetry: 0.1, overlapFrames: 3, forwardLean: 8, lateralBias: 0.04, armCarriage: "open", tags: ["heroic", "rescue"] },
    { name: "Anime Sky Launch", thesis: "Compressed hold explodes into extreme vertical spacing and long trailing shapes.", pace: 0.98, energy: 1, weight: 0.34, asymmetry: 0.16, overlapFrames: 5, forwardLean: 4, lateralBias: 0.02, armCarriage: "stylized", tags: ["anime", "launch"] },
  ],
  land: [
    { name: "Soft Two-Foot Landing", thesis: "Feet meet together, center lowers smoothly and arms settle after the torso.", pace: 0.42, energy: 0.38, weight: 0.5, asymmetry: 0.06, overlapFrames: 3, forwardLean: 3, lateralBias: 0.02, armCarriage: "relaxed", tags: ["soft", "naturalistic"] },
    { name: "Running Landing Handoff", thesis: "Impact immediately redirects into the first running step without a dead neutral pose.", pace: 0.72, energy: 0.76, weight: 0.46, asymmetry: 0.16, overlapFrames: 2, forwardLean: 8, lateralBias: 0.08, armCarriage: "athletic", tags: ["running", "handoff"] },
    { name: "Hard Drop Absorption", thesis: "Fast impact, deep compression and slower rebound communicate vertical weight.", pace: 0.64, energy: 0.82, weight: 0.7, asymmetry: 0.12, overlapFrames: 4, forwardLean: 8, lateralBias: 0.06, armCarriage: "open", tags: ["hard", "absorption"] },
    { name: "Superhero Three-Point", thesis: "One-sided graphic contact resolves into a staged low heroic silhouette.", pace: 0.68, energy: 0.92, weight: 0.62, asymmetry: 0.72, overlapFrames: 4, forwardLean: 14, lateralBias: -0.44, armCarriage: "open", tags: ["heroic", "three-point"] },
    { name: "Stumble Landing", thesis: "Center overshoots support and limbs make two corrective catches before balance.", pace: 0.78, energy: 0.74, weight: 0.52, asymmetry: 0.58, overlapFrames: 1, forwardLean: 15, lateralBias: 0.34, armCarriage: "panic", tags: ["stumble", "correction"] },
    { name: "Injured Landing", thesis: "Healthy leg accepts impact while torso and arms prevent load reaching the injured side.", pace: 0.5, energy: 0.58, weight: 0.78, asymmetry: 0.86, overlapFrames: 3, forwardLean: 10, lateralBias: 0.56, armCarriage: "protective", tags: ["injured-left", "landing"] },
    { name: "Armored Impact Landing", thesis: "Shallow compression but strong delayed shock across rigid upper-body mass.", pace: 0.4, energy: 0.86, weight: 1, asymmetry: 0.16, overlapFrames: 5, forwardLean: 7, lateralBias: 0.1, armCarriage: "heavy", tags: ["armored", "impact"] },
    { name: "Silent Toe Landing", thesis: "Narrow low-noise contact, restrained arms and immediate stabilization.", pace: 0.6, energy: 0.64, weight: 0.4, asymmetry: 0.2, overlapFrames: 2, forwardLean: 7, lateralBias: -0.12, armCarriage: "stealth", tags: ["stealth", "silent"] },
    { name: "Roll-Ready Landing", thesis: "Impact is deliberately redirected forward into a compact roll preparation.", pace: 0.76, energy: 0.82, weight: 0.46, asymmetry: 0.24, overlapFrames: 2, forwardLean: 17, lateralBias: 0.12, armCarriage: "guarded", tags: ["parkour", "roll-ready"] },
    { name: "Anime Crater Landing", thesis: "Extreme impact spacing, held low silhouette and long staggered recovery accents.", pace: 0.9, energy: 1, weight: 0.9, asymmetry: 0.28, overlapFrames: 6, forwardLean: 16, lateralBias: -0.18, armCarriage: "stylized", tags: ["anime", "crater"] },
  ],
};

export const visualDirections: VisualDirection[] = (
  Object.entries(groups) as [FoundationAction, DirectionSeed[]][]
).flatMap(([action, directions]) =>
  directions.map((direction, index) => ({
    ...direction,
    id: `${action}-${String(index + 1).padStart(2, "0")}`,
    action,
  })),
);

export function directionsFor(action: FoundationAction): VisualDirection[] {
  return visualDirections.filter((direction) => direction.action === action);
}
