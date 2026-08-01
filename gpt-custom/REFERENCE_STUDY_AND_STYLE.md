# Reference study and style extraction

Use references to understand why motion works. The goal is a transferable design model, not superficial copying.

## Observation pass

Watch or inspect the full action before sampling details. Record:

- narrative intention and emotional state;
- camera, framing, screen direction, and silhouette;
- support foot/hand and center-of-gravity path;
- contact order and force direction;
- hero poses and their durations;
- timing contrast, holds, accelerations, and hit stops;
- hand/foot/head arcs;
- overlap, drag, recoil, and settle;
- negative space and visible limb planes;
- what is physical, what is graphic exaggeration, and what is camera/VFX assistance.

## Stateful animation inspection

Animation tracks may omit unchanged poses. Omission means inheritance from the previous state, not a reset to identity. Reconstruct each sampled whole-body pose statefully before comparing silhouettes or retargeting. Paginate large clips and preserve exact source paths when names duplicate.

## Decompose style into controls

Translate adjectives into observable decisions:

- **heavy:** longer initiation, lower center, stronger compression, shorter overshoot, delayed mass, firm contacts;
- **agile:** shorter anticipation, clear directional line, rapid weight transfer, precise recovery;
- **cold/serious:** reduced secondary amplitude, longer intentional pauses, stable gaze, economical arms;
- **arrogant:** open chest/silhouette, relaxed timing, controlled asymmetry, delayed reactions;
- **desperate:** forward commitment, short contacts, large recovery, sharper breathing and arm drive;
- **anime impact:** readable anticipation, compressed acceleration, graphic contact pose, hit stop, overshoot/smear, decisive settle.

Do not implement an adjective by changing playback speed alone.

## Comparative study

Compare at least three dimensions between references: pose design, mechanics, and timing. A game walk and real walk can share weight transfer while using different silhouette and rhythm. A Blender animation can be reproduced in Studio only if the plugin exposes the relevant control—layers, curves, transform spaces, IK/contacts, dense resampling, and post-bake inspection—not by copying coordinates blindly.

## Creating an original result

Preserve useful principles while changing multiple creative dimensions:

- pose sequence and asymmetry;
- timing/spacing rhythm;
- spatial path and target;
- character intention/personality;
- camera/staging;
- breakdowns and secondary action;
- entry, recovery, and gameplay contract.

For a reference-owned conversion or retarget, fidelity may be the goal; otherwise state what was inherited conceptually and what was newly designed.

## Visual thumbnails

Before dense authoring, describe or pose two to four silhouette thumbnails. Each should differ materially in line of action, support, limb roles, and negative space. Choose based on the performance thesis, not numerical convenience.

## Web reference use

Prefer primary professional sources, official game/Creator documentation, animator breakdowns, and clear visual footage. Cite sources when the user asks for research. Do not paste long copyrighted text or recreate a protected animation sequence wholesale. Use visual evidence to improve mechanics and staging.

## Review questions

- What single frame best explains the action?
- Where is the weight at every hero pose?
- Which part leads, and which parts drag?
- What prevents the silhouette from collapsing?
- What timing choice creates the style?
- Which qualities come from animation versus camera or VFX?
- How must the solution change for R6, R15, custom proportions, or gameplay blending?
