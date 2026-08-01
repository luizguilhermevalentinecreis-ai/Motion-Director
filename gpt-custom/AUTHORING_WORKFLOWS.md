# Motion Director authoring workflows

These workflows describe efficient production passes. Use stored draft IDs and focused edits rather than resending full tracks.

## Universal workflow

1. Consult global knowledge and verify Studio status.
2. Inspect the current selection, exact rig topology, visible avatar, and relevant AnimSaves/references.
3. State the performance thesis, camera, gameplay contract, duration, loop/root-motion policy, and quality target.
4. Plan hero poses, contacts, support, center of gravity, force path, timing beats, and markers.
5. Create a compact full-body blueprint and keep its `draftId`.
6. Validate the draft. Fix structural errors before smoothing.
7. Preview stepped blocking at hero times. Request visual review when the user is evaluating by parts.
8. Add purposeful breakdowns, arcs, spacing, and overlap with focused edits.
9. Compose optional breathing, recoil, acting, or polish layers with explicit masks and weights.
10. Stage, poll, require the post-bake audit to pass, then inspect representative poses and motion metrics.
11. Commit and attach only when the requested scope authorizes it. Preview and obtain human visual approval.

## Idle or combat stance

- Design one strong base pose: support, guard roles, line of action, open silhouette, gaze, and character attitude.
- Build very small motion around it: breathing, controlled weight change, selective finger/head/accessory offsets when supported.
- Keep feet and gameplay center stable unless the concept requires stance switching.
- In R6, avoid repetitive whole-torso swivel. Let the base pose carry exaggeration.
- For combat, lead/rear arms must have different jobs. Hands should threaten/protect rather than hang low or mirror each other.

## Walk cycle

- Establish left/right contact, compression, passing, and recovery.
- Keep legs in opposition and define which foot supports each phase.
- Move the center of mass toward the new support before full weight acceptance.
- Give arms character-specific counter-swing and overlap.
- Verify foot height, foot slide, loop pose, loop velocity, and start/stop compatibility.
- If the curve is resolved, resample densely with Linear output and include an exact sample at `duration`.

## Run or sprint

- Rebuild poses rather than speeding up the walk.
- Shorten ground contact, strengthen compression/extension, add flight or near-flight, and sharpen forward recovery.
- Choose an arm strategy appropriate to the rig and character: pump, attack-ready fixed guard, desperate open drive, or stylized trailing pose.
- Keep the arms below the head unless the style intentionally reads as Naruto/Sonic-like.
- Audit phase transitions for pauses; a large spacing gap at leg alternation reads as a hitch.

## Dash, roll, and parkour

- Dash: readable anticipation, directional launch, compressed high-speed travel, selective smear, braking/recovery, and no unexplained lateral teleport.
- Roll: lower center of mass, commit the body line into the rotation, maintain continuous angular spacing, use limb translation to build a round silhouette, and exit onto credible support.
- Wallrun/climb: define contact hand/foot windows, wall normal, center-of-mass relationship, and entry/exit momentum.
- Use contact locks where the rig supports them; never use locks to conceal impossible body mechanics.

## Punch or uppercut

- Select striking hand, target, support foot, guard hand, and impact time.
- Pose the contact endpoint first, then connect it backward through shoulder/torso/root/support.
- Add a small clear anticipation, rapid acceleration, hand-first contact, optional hit stop, follow-through, and recovery.
- Uppercut must travel from below through an ascending arc driven by the body, not resemble a normal punch with the arm tilted upward.
- Inspect visible block faces in R6 and prevent long-arc arm spins.

## Kick

- Map support before choosing the kicking leg.
- Load support, release the kicking leg, organize torso lean and arm counterbalance, project the foot to target, then recover.
- R6: orient and translate the rigid leg so the distal foot endpoint reads clearly; do not animate a knee that does not exist.
- R15: distribute through hip, knee, ankle, pelvis, spine, and support chain.
- Inspect the path frame by frame for 180/360-degree flips.

## Hit reaction and recovery

- Define contact point, incoming vector, force scale, character mass, and gameplay stun window.
- Move the contacted region first or compress it appropriately, then propagate force through the body.
- Distinguish absorption, launch, airborne continuation, landing preparation, impact, and recovery.
- If using a backflip recovery, continue the launch momentum into a coherent rotation and land on prepared support rather than inserting a disconnected flip.

## Acting and cutscene

- Break performance into thoughts and beats: observe, decide, act, react, settle.
- Coordinate gaze, head, torso, hands, support, breath, and pauses.
- For multiple rigs, plan shared world positions, eye lines, screen direction, synchronized markers, contacts, and camera beats before individual polish.
- Keep cold or threatening walks patient and restrained; excessive arm/body expression makes them comedic.

## Reference-informed original

- Inspect inventory first, then paginate detailed keyframes in bounded sections.
- Reconstruct inherited/omitted poses statefully.
- Extract support, pose rhythm, force paths, arcs, spacing, and visual tricks.
- Author a new sequence with different pose order, timing, paths, and performance while preserving useful principles.

## Revision protocol

Translate feedback into a specific source problem:

- “looks lateral” → inspect foot lateral spacing, root orientation, hip line, and camera;
- “too loose” → reduce secondary amplitude, strengthen stable anchors, clarify support;
- “too rigid” → improve breakdowns, arcs, offset, and controlled translation;
- “not threatening” → raise/aim guard, assign limb roles, strengthen forward intent and silhouette;
- “teleports sideways” → inspect root/torso translation and inherited source keys;
- “spins 360” → stabilize quaternion signs and intermediate direction/twist.

Change the smallest coherent set of decisions, then restage and review. Do not blindly smooth or add keys.
