# R6 Review Round 01

Status: `awaiting-human-review`

No candidate in this document is approved. Numeric scores are filtering signals,
not visual quality claims.

## Review criteria

For each candidate, record:

- fluidity at normal playback speed;
- believable weight and balance;
- readable silhouette from front and side;
- whether the acting thesis is visible without reading its name;
- visible foot sliding, impossible lean, limb popping, or robotic stopping;
- verdict: reject, revise, or approve.

## Idle

- `MD_REVIEW_R6_01_ColdShiver` — Cold Shiver — numeric filter `0.9097`
- `MD_REVIEW_R6_02_SpentSurvivor` — Spent Survivor — numeric filter `0.8679`

## Walk

- `MD_REVIEW_R6_03_ExhaustedTrudge` — Exhausted Trudge — numeric filter `0.9891`
- `MD_REVIEW_R6_04_LeftLegLimp` — Left-Leg Limp — numeric filter `0.9827`

## Run

- `MD_REVIEW_R6_05_EndofRaceFatigue` — End-of-Race Fatigue — numeric filter `0.9470`
- `MD_REVIEW_R6_06_SustainableHumanRun` — Sustainable Human Run — numeric filter `0.9307`

## Sprint

- `MD_REVIEW_R6_07_HeavyJuggernautSprint` — Heavy Juggernaut Sprint — numeric filter `0.9282`
- `MD_REVIEW_R6_08_BlockStartSprint` — Block-Start Sprint — numeric filter `0.9097`

## Start

- `MD_REVIEW_R6_09_SprinterLaunch` — Sprinter Launch — numeric filter `0.7825`
- `MD_REVIEW_R6_10_PanicReactionStart` — Panic Reaction Start — numeric filter `0.7763`

## Stop

- `MD_REVIEW_R6_11_NaturalWalkSettle` — Natural Walk Settle — numeric filter `0.7069`
- `MD_REVIEW_R6_12_ExhaustedCollapseStop` — Exhausted Collapse Stop — numeric filter `0.6803`

## Turn

- `MD_REVIEW_R6_13_SilentDirectionChange` — Silent Direction Change — numeric filter `0.7445`
- `MD_REVIEW_R6_14_HeroRevealTurn` — Hero Reveal Turn — numeric filter `0.6944`

## Dash

- `MD_REVIEW_R6_15_BackwardThreatEvade` — Backward Threat Evade — numeric filter `0.7827`
- `MD_REVIEW_R6_16_RightPowerSidestep` — Right Power Sidestep — numeric filter `0.7827`

## Jump

- `MD_REVIEW_R6_17_InjuredOneLegTakeoff` — Injured One-Leg Takeoff — numeric filter `0.8282`
- `MD_REVIEW_R6_18_FearfulObstacleLeap` — Fearful Obstacle Leap — numeric filter `0.8232`

## Landing

- `MD_REVIEW_R6_19_StumbleLanding` — Stumble Landing — numeric filter `0.8238`
- `MD_REVIEW_R6_20_ArmoredImpactLanding` — Armored Impact Landing — numeric filter `0.8238`

## Finalization invariant

- Between one and ten exact review names may be promoted.
- Promotion must be based on explicit human verdicts.
- Rejected and unselected review sequences are removed only during finalization.
- Approved sequences receive `MotionDirectorHumanApproved = true`.
