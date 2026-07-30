export type ParkourAction =
  | "approach"
  | "takeoff"
  | "precision-jump"
  | "landing"
  | "vault"
  | "wall-run"
  | "wall-climb"
  | "ledge"
  | "slide"
  | "roll";

export interface ParkourDirection {
  id: string;
  action: ParkourAction;
  variant: string;
  name: string;
  thesis: string;
  duration: number;
  energy: number;
  height: number;
  distance: number;
  asymmetry: number;
  tags: string[];
}

type Seed = Omit<ParkourDirection, "id" | "action">;
const s = (
  variant: string, name: string, thesis: string,
  duration: number, energy: number, height: number, distance: number,
  asymmetry: number, tags: string[],
): Seed => ({ variant, name, thesis, duration, energy, height, distance, asymmetry, tags });

const groups: Record<ParkourAction, Seed[]> = {
  approach: [
    s("flow", "Efficient Traceur Approach", "Economical run keeps the gaze on the obstacle and preserves speed without theatrical arm or torso motion.", 0.66, 0.7, 0.2, 0.75, 0.08, ["run", "efficient"]),
    s("acceleration", "Progressive Acceleration Approach", "Stride and arm drive grow across the cycle while the torso gradually projects toward the obstacle.", 0.58, 0.84, 0.25, 0.9, 0.12, ["run", "accelerating"]),
    s("obstacle-read", "Measured Obstacle Read", "Cadence remains athletic while head stabilization and a shortened final step prepare an accurate takeoff.", 0.72, 0.66, 0.18, 0.64, 0.14, ["run", "obstacle-read"]),
    s("sprint", "Full-Speed Vault Approach", "Powerful hip extension and compact arm drive carry maximum usable speed into a hand-supported obstacle.", 0.5, 0.96, 0.28, 1, 0.08, ["sprint", "vault-bound"]),
    s("precision", "Controlled Precision Approach", "The final stride narrows and lowers the center so horizontal speed can become a stable two-foot precision jump.", 0.74, 0.68, 0.16, 0.62, 0.1, ["run", "precision-bound"]),
    s("wall", "Wall-Run Conversion Approach", "A fast but controlled run lifts posture slightly before the wall step to preserve vertical conversion.", 0.6, 0.86, 0.3, 0.82, 0.12, ["run", "wall-bound"]),
    s("stealth", "Quiet Technical Approach", "Reduced vertical bounce and narrow arm action keep footfalls quiet without erasing real weight transfer.", 0.76, 0.58, 0.12, 0.58, 0.16, ["run", "quiet"]),
    s("fatigue", "Fatigued Parkour Approach", "Cadence survives while shoulder lag, reduced knee recovery and uneven support reveal accumulating fatigue.", 0.8, 0.52, 0.16, 0.55, 0.42, ["run", "fatigued"]),
    s("heavy", "Loaded Equipment Approach", "Shorter forceful strides and restrained upper-body motion communicate carried mass and higher inertia.", 0.76, 0.7, 0.16, 0.62, 0.12, ["run", "loaded"]),
    s("lateral", "Angled Side Approach", "The pelvis banks into a diagonal path while chest and gaze stay aligned with the intended obstacle contact.", 0.68, 0.76, 0.2, 0.7, 0.58, ["run", "angled"]),
  ],
  takeoff: [
    s("two-foot", "Balanced Two-Foot Takeoff", "Both feet compress under the center before ankles knees hips and arms extend in a coordinated vertical chain.", 0.5, 0.76, 0.7, 0.25, 0.06, ["two-foot", "vertical"]),
    s("one-foot", "Running One-Foot Takeoff", "The penultimate step lowers the center and the final support leg redirects approach speed into flight.", 0.46, 0.84, 0.58, 0.72, 0.68, ["one-foot", "running"]),
    s("distance", "Long-Distance Takeoff", "Forward projection remains dominant while the free knee and opposing arm help preserve a long stable flight line.", 0.48, 0.9, 0.48, 1, 0.66, ["one-foot", "distance"]),
    s("height", "Maximum-Height Takeoff", "A deeper compression and near-vertical triple extension exchange approach speed for a high center-of-mass rise.", 0.56, 0.94, 1, 0.35, 0.12, ["two-foot", "height"]),
    s("wall-bound", "Wall-Bound Takeoff", "One-foot launch places the body at a useful wall angle with the opposite knee ready for the first wall contact.", 0.48, 0.88, 0.72, 0.64, 0.72, ["one-foot", "wall-bound"]),
    s("vault-bound", "Vault Hurdle Takeoff", "A quick hurdle step moves the shoulders toward the obstacle while both hands prepare for a short support phase.", 0.52, 0.86, 0.55, 0.78, 0.36, ["hurdle", "vault-bound"]),
    s("precision", "Standing Precision Takeoff", "Arms swing behind a symmetric countermovement before a controlled forward extension aimed at exact foot placement.", 0.62, 0.72, 0.55, 0.72, 0.08, ["two-foot", "precision"]),
    s("plyo", "Reactive Plyometric Takeoff", "A brief landing compression rebounds immediately into another jump without settling into a static crouch.", 0.42, 0.9, 0.68, 0.58, 0.12, ["two-foot", "plyometric"]),
    s("fatigue", "Fatigued One-Foot Takeoff", "The support leg still commits but reduced arm timing and a late free knee create a believable inefficient launch.", 0.62, 0.62, 0.5, 0.6, 0.76, ["one-foot", "fatigued"]),
    s("slip", "Low-Traction Takeoff Recovery", "The intended launch loses rearward foot pressure and the torso corrects mid-extension to preserve the jump.", 0.58, 0.66, 0.46, 0.58, 0.82, ["one-foot", "slip"]),
  ],
  "precision-jump": [
    s("standing", "Standing Precision Jump", "A compact symmetric flight keeps both feet organized beneath the body for an exact forefoot landing.", 0.82, 0.68, 0.55, 0.68, 0.08, ["two-foot", "precision"]),
    s("running", "Running Precision Jump", "Approach momentum carries a longer arc while arms close forward to prepare a controlled two-foot target.", 0.72, 0.82, 0.52, 0.9, 0.18, ["running", "precision"]),
    s("gap", "Long Gap Jump", "The body extends into a long forward flight before knees and arms reorganize late for landing absorption.", 0.88, 0.9, 0.5, 1, 0.16, ["gap", "distance"]),
    s("upward", "Upward Precision Jump", "Strong arm lift and hip extension raise the center while feet remain compact enough to clear a higher edge.", 0.86, 0.88, 0.9, 0.62, 0.12, ["upward", "precision"]),
    s("downward", "Descending Precision Jump", "Flight begins controlled and the legs extend downward late, anticipating a longer absorption phase on contact.", 0.94, 0.78, 0.75, 0.72, 0.14, ["downward", "precision"]),
    s("lateral", "Lateral Precision Jump", "Pelvis and feet travel sideways while shoulders counterrotate to keep the landing target visually stable.", 0.8, 0.76, 0.5, 0.7, 0.72, ["lateral", "precision"]),
    s("stride", "Stride Gap Jump", "A one-foot flight preserves running rhythm so the opposite foot can accept the next surface without a full stop.", 0.66, 0.82, 0.46, 0.82, 0.74, ["one-foot", "stride"]),
    s("cat", "Cat-Leap Preparation", "Knees rise toward the torso and arms reach forward so feet and hands can meet a vertical target in sequence.", 0.9, 0.84, 0.72, 0.78, 0.22, ["cat-leap", "wall-target"]),
    s("split", "Split-Foot Accuracy Jump", "One foot leads slightly in flight to handle an offset landing surface while the center remains controlled.", 0.8, 0.72, 0.56, 0.7, 0.54, ["split-foot", "accuracy"]),
    s("fatigue", "Fatigued Gap Commitment", "The flight reaches the target but low knee recovery and delayed arms make the landing preparation visibly costly.", 0.96, 0.64, 0.48, 0.76, 0.5, ["gap", "fatigued"]),
  ],
  landing: [
    s("precision", "Soft Precision Landing", "Forefeet contact first and ankles knees hips and arms extend the absorption instead of stopping in one frame.", 0.72, 0.64, 0.5, 0.15, 0.08, ["precision", "forefoot", "soft"]),
    s("running", "Momentum-Preserving Landing", "One foot accepts impact while the opposite leg and arms immediately organize into the next running stride.", 0.58, 0.78, 0.48, 0.7, 0.68, ["running-exit", "one-foot"]),
    s("high", "High-Drop Roll Preparation", "Deep absorption redirects remaining forward momentum diagonally toward a shoulder roll rather than forcing a stop.", 0.7, 0.9, 1, 0.58, 0.42, ["high-drop", "roll-ready"]),
    s("staggered", "Staggered Two-Foot Landing", "Feet arrive a fraction apart and the pelvis corrects the asymmetry before posture returns upright.", 0.76, 0.7, 0.62, 0.2, 0.52, ["staggered", "two-foot"]),
    s("lateral", "Lateral Landing Absorption", "The outside leg accepts sideways momentum while torso and arms counterbalance across a longer settling path.", 0.8, 0.72, 0.58, 0.42, 0.82, ["lateral", "counterbalance"]),
    s("drop", "Controlled Drop Landing", "Feet reach down before contact and the body follows through a deep but aligned ankle-knee-hip compression.", 0.84, 0.76, 0.8, 0.12, 0.1, ["drop", "two-foot"]),
    s("one-leg", "Single-Leg Balance Landing", "One leg absorbs the landing while the free leg and both arms make active corrections around the support foot.", 0.9, 0.68, 0.55, 0.18, 0.92, ["one-foot", "balance"]),
    s("loaded", "Heavy Equipment Landing", "A wider stance and slower recovery communicate extra mass while joint alignment remains disciplined.", 0.92, 0.82, 0.72, 0.12, 0.16, ["loaded", "wide"]),
    s("fatigue", "Fatigued Landing Catch", "The initial contact succeeds but the chest drops and one hand nearly reaches the ground during recovery.", 0.98, 0.6, 0.62, 0.18, 0.64, ["fatigued", "hand-catch"]),
    s("unstable", "Near-Miss Precision Landing", "The target is reached on the forefeet but arms and hips make two distinct corrections before balance returns.", 1.02, 0.7, 0.58, 0.2, 0.74, ["precision", "unstable"]),
  ],
  vault: [
    s("safety", "Safety Vault", "One hand supports the obstacle while the inside leg steps through and the trailing leg clears on a separate path.", 0.82, 0.62, 0.5, 0.68, 0.72, ["one-hand", "step-through"]),
    s("speed", "Speed Vault", "A brief one-hand block turns the hips sideways while the lead leg reaches toward a running exit.", 0.66, 0.86, 0.58, 0.9, 0.78, ["one-hand", "speed"]),
    s("kong", "Kong Vault", "Two hands contact after takeoff, shoulders block the obstacle and tucked knees pass between the arms before extension.", 0.82, 0.94, 0.75, 0.92, 0.1, ["two-hand", "kong"]),
    s("dash", "Dash Vault", "Both legs extend forward over the obstacle while hands arrive beside the hips to redirect the center toward landing.", 0.86, 0.88, 0.68, 0.82, 0.12, ["two-hand", "legs-forward"]),
    s("lazy", "Lazy Vault", "One hand and an oblique hip path carry the body sideways with legs clearing in a relaxed sequential sweep.", 0.88, 0.68, 0.55, 0.62, 0.84, ["one-hand", "sideways"]),
    s("thief", "Thief Vault", "The near hand plants first and the far hand briefly joins as both legs pass laterally over the obstacle.", 0.78, 0.76, 0.58, 0.7, 0.8, ["two-hand", "lateral"]),
    s("reverse", "Reverse Vault", "Hand contact initiates a controlled torso turn while head spotting and leg separation prevent a flat spin.", 0.92, 0.82, 0.62, 0.68, 0.9, ["one-hand", "reverse-turn"]),
    s("palmspin", "Palm Spin", "Both hands create a short pivot around the obstacle and feet return to the takeoff side after a spotted rotation.", 0.96, 0.8, 0.56, 0.42, 0.94, ["two-hand", "palm-spin"]),
    s("underbar", "Underbar Swing", "Hands catch overhead as hips and feet thread beneath the rail, then shoulders release into forward travel.", 0.94, 0.84, 0.58, 0.8, 0.18, ["two-hand", "underbar"]),
    s("fatigue", "Fatigued Safety Vault", "A longer hand support and low trailing leg preserve obstacle clearance while visibly sacrificing speed.", 1.04, 0.54, 0.44, 0.54, 0.76, ["one-hand", "fatigued"]),
  ],
  "wall-run": [
    s("left", "Left Horizontal Wall Run", "Left foot and hand track the wall while the outside limbs cycle to preserve forward momentum and wall pressure.", 0.72, 0.82, 0.46, 0.8, 0.88, ["left-wall", "horizontal"]),
    s("right", "Right Horizontal Wall Run", "Mirrored wall-side mechanics keep chest distance and foot pressure stable instead of floating beside the surface.", 0.72, 0.82, 0.46, 0.8, 0.88, ["right-wall", "horizontal"]),
    s("vertical", "Vertical Wall Run Step", "The wall foot plants above hip level and pushes downward so horizontal approach speed becomes upward center movement.", 0.66, 0.9, 0.92, 0.42, 0.72, ["vertical", "one-step"]),
    s("two-step", "Two-Step Vertical Wall Run", "First wall contact redirects speed and the second shorter step extends height before both arms reach the ledge.", 0.88, 0.92, 1, 0.46, 0.68, ["vertical", "two-step"]),
    s("diagonal", "Diagonal Wall Run", "A slanted body line combines upward gain with forward travel while wall-side joints maintain believable pressure.", 0.78, 0.86, 0.72, 0.72, 0.84, ["left-wall", "diagonal"]),
    s("fast", "High-Speed Wall Pass", "Short wall contacts and compact cycling preserve most approach velocity across a brief horizontal wall section.", 0.58, 0.96, 0.42, 1, 0.86, ["right-wall", "fast"]),
    s("low", "Low Entry Wall Run", "A low first contact absorbs a poor approach angle and gradually organizes the torso parallel to the wall.", 0.84, 0.7, 0.48, 0.68, 0.8, ["left-wall", "low-entry"]),
    s("three-step", "Three-Step Climbing Wall Run", "Wall contacts become progressively shorter as vertical speed decays and arms prepare to finish the ascent.", 1.06, 0.88, 1, 0.38, 0.72, ["vertical", "three-step"]),
    s("fatigue", "Fatigued Wall Run", "Reduced knee recovery and longer wall contact show lost speed while the athlete still fights to maintain friction.", 0.96, 0.58, 0.55, 0.58, 0.9, ["right-wall", "fatigued"]),
    s("catpass", "Wall Run To Cat Position", "The final wall step sends hips backward slightly so feet and hands can arrive organized against a vertical face.", 0.9, 0.82, 0.82, 0.58, 0.76, ["vertical", "cat-exit"]),
  ],
  "wall-climb": [
    s("power", "Power Wall Climb", "A strong wall step and immediate arm pull raise the hips until one foot can find the top surface.", 1.02, 0.92, 1, 0.34, 0.62, ["power", "top-out"]),
    s("technical", "Technical Wall Climb", "Efficient foot pressure, close hips and sequential elbow extension minimize wasted swinging during ascent.", 1.14, 0.76, 0.9, 0.28, 0.3, ["efficient", "top-out"]),
    s("two-step", "Two-Step Wall Climb", "Two distinct wall contacts build height before the hands catch and the lower body folds toward the wall.", 1.18, 0.86, 1, 0.3, 0.7, ["two-step", "catch"]),
    s("one-arm", "Offset One-Arm Climb", "One hand catches first and the opposite arm joins after a visible torso correction around the loaded shoulder.", 1.28, 0.8, 0.92, 0.26, 0.9, ["one-hand", "offset"]),
    s("high-reach", "Maximum Reach Wall Climb", "Full ankle hip spine and shoulder extension stretch upward before the body compresses beneath the ledge.", 1.12, 0.94, 1, 0.28, 0.22, ["high-reach", "catch"]),
    s("low-wall", "Fast Low-Wall Climb", "Hands and one foot share a short support phase so the body can step over without a full hanging pull-up.", 0.86, 0.82, 0.62, 0.56, 0.7, ["low-wall", "step-over"]),
    s("tic-tac", "Tic-Tac Redirect Climb", "A side wall step redirects the center toward a second surface while head and reaching hand acquire the new target.", 0.94, 0.86, 0.78, 0.62, 0.92, ["tic-tac", "redirect"]),
    s("fatigue", "Fatigued Wall Climb", "The catch succeeds but elbows re-bend and legs search for friction before the hips finally rise.", 1.52, 0.58, 0.76, 0.18, 0.64, ["fatigued", "struggle"]),
    s("failed", "Failed Wall Climb Recovery", "Hands touch the edge but insufficient height produces a controlled drop instead of an impossible late teleport upward.", 1.06, 0.64, 0.68, 0.12, 0.48, ["failed", "drop"]),
    s("cat", "Cat-Hang Arrival", "Feet contact the wall just before the hands settle, absorbing the remaining swing into a stable hanging position.", 1.0, 0.78, 0.82, 0.24, 0.28, ["cat-hang", "stable"]),
  ],
  ledge: [
    s("catch", "Two-Hand Ledge Catch", "Both hands meet the edge and shoulders elbows spine and hips absorb the downward swing over several frames.", 0.68, 0.8, 0.72, 0.18, 0.16, ["two-hand", "catch"]),
    s("one-hand", "One-Hand Emergency Catch", "One shoulder receives the initial load before torso rotation and the second hand stabilize the hang.", 0.82, 0.88, 0.78, 0.16, 0.94, ["one-hand", "catch"]),
    s("cat", "Cat-Hang Settle", "Feet press the wall beneath bent knees while arms and spine finish damping the approach swing.", 0.84, 0.68, 0.58, 0.18, 0.18, ["cat-hang", "settle"]),
    s("swing", "Ledge Pendulum Swing", "A hanging body passes beneath the hands with shoulders open and legs trailing before reversing naturally.", 1.16, 0.72, 0.5, 0.64, 0.18, ["two-hand", "swing"]),
    s("shimmy-left", "Left Ledge Shimmy", "Left hand reaches and loads before the feet and right hand follow, keeping three contacts whenever possible.", 0.92, 0.54, 0.42, 0.34, 0.82, ["shimmy", "left"]),
    s("shimmy-right", "Right Ledge Shimmy", "Mirrored contact sequencing shifts the body right without sliding both hands and feet simultaneously.", 0.92, 0.54, 0.42, 0.34, 0.82, ["shimmy", "right"]),
    s("pullup", "Strict Ledge Pull-Up", "Scapular depression begins the ascent before elbows flex and the chest approaches the edge.", 1.12, 0.76, 0.72, 0.12, 0.12, ["pull-up", "two-hand"]),
    s("mantle", "Efficient Ledge Mantle", "One forearm support lets the opposite hand and near knee reorganize above the edge for a stable top-out.", 1.32, 0.8, 0.84, 0.38, 0.76, ["mantle", "top-out"]),
    s("drop", "Controlled Ledge Drop", "Hands release after the legs extend downward and arms reopen to prepare the upcoming landing.", 0.78, 0.62, 0.58, 0.14, 0.18, ["release", "drop"]),
    s("fatigue", "Fatigued Ledge Hang", "Shoulders rise, elbows lose extension and legs search for support while the grip remains barely secure.", 1.4, 0.46, 0.4, 0.1, 0.52, ["fatigued", "hang"]),
  ],
  slide: [
    s("baseball", "Momentum Baseball Slide", "One leg extends while the other folds beneath the hips and arms protect balance during a long low glide.", 0.92, 0.82, 0.32, 0.9, 0.72, ["baseball", "long"]),
    s("knee", "Controlled Knee Slide", "Both knees lower beneath the center while hips stay above the heels and torso resists collapsing backward.", 0.82, 0.7, 0.26, 0.7, 0.14, ["knees", "controlled"]),
    s("side", "Side Hip Slide", "The outside hip receives the ground line while legs and near arm organize to avoid a flat seated pose.", 0.9, 0.74, 0.28, 0.76, 0.88, ["side", "hip"]),
    s("underbar", "Low Underbar Slide", "The center drops early and both feet lead beneath the obstacle while head and shoulders remain safely tucked.", 0.78, 0.88, 0.22, 0.88, 0.18, ["underbar", "feet-first"]),
    s("brake", "Emergency Braking Slide", "A wide asymmetrical base converts excessive run speed into friction before the athlete rises cautiously.", 1.04, 0.86, 0.3, 0.82, 0.78, ["braking", "recovery"]),
    s("downhill", "Downhill Speed Slide", "Torso stays more upright while legs steer the rapid descent and arms make continuous small balance corrections.", 0.86, 0.92, 0.34, 1, 0.52, ["downhill", "fast"]),
    s("wet", "Low-Traction Slip Slide", "Unexpected foot slip drops one hip first and the arms react late before controlling the remaining glide.", 1.02, 0.66, 0.3, 0.78, 0.86, ["slip", "recovery"]),
    s("one-hand", "One-Hand Supported Slide", "A trailing hand briefly accepts load while the opposite arm and legs preserve forward orientation.", 0.9, 0.76, 0.28, 0.8, 0.82, ["one-hand", "supported"]),
    s("run-exit", "Slide To Running Exit", "The folded leg steps under the hips before the extended leg completes recovery, creating a believable acceleration out.", 0.96, 0.84, 0.3, 0.86, 0.7, ["running-exit", "baseball"]),
    s("fatigue", "Fatigued Long Slide", "Low core control produces a heavier torso settle and a slower two-stage rise after momentum fades.", 1.2, 0.54, 0.26, 0.62, 0.62, ["fatigued", "long"]),
  ],
  roll: [
    s("left", "Left Shoulder Parkour Roll", "Forward energy crosses from the left shoulder toward the opposite hip without loading the head or spine directly.", 0.88, 0.78, 0.48, 0.72, 0.82, ["forward-roll", "left-shoulder"]),
    s("right", "Right Shoulder Parkour Roll", "Mirrored diagonal contact carries momentum from the right shoulder to the opposite hip and back to the feet.", 0.88, 0.78, 0.48, 0.72, 0.82, ["forward-roll", "right-shoulder"]),
    s("landing", "Landing Conversion Roll", "A deep forefoot landing immediately sends the center diagonally over one shoulder instead of pausing in a crouch.", 0.96, 0.84, 0.72, 0.68, 0.74, ["forward-roll", "landing-entry"]),
    s("dive", "Low Dive Roll", "Hands and shoulder accept a shallow flight while tucked legs pass overhead and prepare a running exit.", 1.02, 0.9, 0.58, 0.9, 0.64, ["forward-roll", "dive"]),
    s("compact", "Compact Low-Speed Roll", "A small rounded silhouette uses little travel and returns to a crouch without unnecessary airborne motion.", 0.82, 0.58, 0.3, 0.48, 0.68, ["forward-roll", "compact"]),
    s("high-drop", "High-Drop Energy Roll", "Longer landing absorption transitions into a broad diagonal roll that spends substantial forward momentum.", 1.16, 0.94, 1, 0.86, 0.78, ["forward-roll", "high-drop"]),
    s("diagonal", "Sharp Diagonal Escape Roll", "The entry redirects forward motion sideways across one shoulder and exits facing a new travel direction.", 0.94, 0.82, 0.5, 0.72, 0.92, ["forward-roll", "direction-change"]),
    s("fast", "Fast Running Roll", "A short low entry preserves speed through the shoulder path and returns directly into the next stride.", 0.76, 0.92, 0.42, 1, 0.72, ["forward-roll", "running-exit"]),
    s("fatigue", "Fatigued Protective Roll", "The athlete completes the diagonal path but delayed leg recovery produces a slower hand-assisted rise.", 1.22, 0.56, 0.56, 0.58, 0.8, ["forward-roll", "fatigued"]),
    s("failed", "Imperfect Roll Recovery", "An off-center entry creates a visible balance correction before the athlete regains a guarded crouch.", 1.12, 0.64, 0.5, 0.54, 0.94, ["forward-roll", "imperfect"]),
  ],
};

const order = Object.keys(groups) as ParkourAction[];
export const parkourDirections: ParkourDirection[] = order.flatMap((action) =>
  groups[action].map((seed, index) => ({
    ...seed,
    action,
    id: `${action.replace(/[^a-z]/g, "")}-${String(index + 1).padStart(2, "0")}`,
  })),
);
export function parkourDirectionsFor(action: ParkourAction): ParkourDirection[] {
  return parkourDirections.filter((direction) => direction.action === action);
}
