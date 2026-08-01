import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pluginSourceUrl = new URL(
  "../studio-plugin/MotionDirectorPlugin.server.lua",
  import.meta.url,
);
const retargeterSourceUrl = new URL(
  "../studio-plugin/R6ToR15Retargeter.lua",
  import.meta.url,
);

test("plugin persists human-review provenance on baked sequences", async () => {
  const source = await readFile(pluginSourceUrl, "utf8");
  assert.match(source, /MotionDirectorHumanReviewRequired/);
  assert.match(source, /MotionDirectorHumanApproved/);
  assert.match(source, /MotionDirectorStyles/);
});

test("plugin inspects and bakes both legacy and upgraded R15 animation joints", async () => {
  const source = await readFile(pluginSourceUrl, "utf8");
  assert.match(source, /descendant:IsA\("Motor6D"\) or descendant:IsA\("AnimationConstraint"\)/);
  assert.match(source, /avatarJointUpgrade = #animationConstraints > 0/);
  assert.match(source, /trackName = descendant\.Part1 and descendant\.Part1\.Name/);
  assert.match(source, /attachment0 = descendant\.Attachment0/);
  assert.match(source, /parentSpaceBakerVersion = 8/);
  assert.match(source, /animationAnalyzerVersion = 2/);
});

test("single-rig commits remove every duplicate destination name deterministically", async () => {
  const source = await readFile(pluginSourceUrl, "utf8");
  const commitHandler = source.slice(
    source.indexOf('handlers["animation.commitDraft"]'),
    source.indexOf("local function stopActivePreviews"),
  );
  assert.match(commitHandler, /destination:GetChildren\(\)/);
  assert.match(commitHandler, /existing\.Name == params\.destinationName/);
  assert.match(commitHandler, /existing:Destroy\(\)/);
  assert.ok(
    commitHandler.indexOf("existing:Destroy()") < commitHandler.indexOf("committed.Parent"),
  );
});

test("plugin exposes edit-time posing and a maximum-ten human finalization gate", async () => {
  const source = await readFile(pluginSourceUrl, "utf8");
  assert.match(source, /animation\.poseCommittedAtTime/);
  assert.match(source, /animation\.resetSelectedRigPose/);
  assert.match(source, /animation\.finalizeHumanReview/);
  assert.match(source, /#approvedNames > 10/);
});

test("plugin exposes developer approval for global knowledge", async () => {
  const source = await readFile(pluginSourceUrl, "utf8");
  assert.match(source, /pendingKnowledgeProposal/);
  assert.match(source, /COMMIT GLOBAL/);
  assert.match(source, /\/plugin\/knowledge\/resolve/);
  assert.match(source, /knowledgeRole == "developer"/);
});

test("plugin publishes committed timing to the shared director marker bus", async () => {
  const source = await readFile(pluginSourceUrl, "utf8");
  assert.match(source, /DirectorMarkerBus/);
  assert.match(source, /publishSequenceMarkers\(committed, params\.destinationName\)/);
  assert.match(source, /handlers\["timeline\.listMarkers"\]/);
});

test("plugin exposes native IK, raycast foot locks and contact error auditing", async () => {
  const source = await readFile(pluginSourceUrl, "utf8");
  assert.match(source, /handlers\["animation\.createIkControl"\]/);
  assert.match(source, /Instance\.new\("IKControl"\)/);
  assert.match(source, /handlers\["animation\.createFootLocks"\]/);
  assert.match(source, /workspace:Raycast/);
  assert.match(source, /handlers\["animation\.auditIkContacts"\]/);
  assert.match(source, /errorStuds = errorDistance/);
});

test("plugin retargets complete R6 sequences through world space and neutral rebasing", async () => {
  const [plugin, retargeter] = await Promise.all([
    readFile(pluginSourceUrl, "utf8"),
    readFile(retargeterSourceUrl, "utf8"),
  ]);
  assert.match(plugin, /animation\.stageR6ToR15Retarget/);
  assert.match(plugin, /r6ToR15RetargeterVersion = 1/);
  assert.match(retargeter, /parentWorld \* item\.joint\.C0 \* transform \* item\.joint\.C1:Inverse\(\)/);
  assert.match(retargeter, /target\.root\.CFrame \* source\.root\.CFrame:Inverse\(\) \* sourceWorld\[sourceName\]/);
  assert.match(retargeter, /neutral\[item\.childName\]:Inverse\(\) \* converted/);
  assert.match(retargeter, /collectPoseState\(child, state\)/);
  assert.match(retargeter, /MotionDirectorRigidR15Chains/);
  assert.match(retargeter, /MotionDirectorLegLateralScale/);
});
