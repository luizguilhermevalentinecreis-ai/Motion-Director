--!strict

local Selection = game:GetService("Selection")

type Dictionary = { [string]: any }
type AnimationJoint = Motor6D | AnimationConstraint
type JointData = {
	joint: AnimationJoint,
	parentName: string,
	childName: string,
}
type RigData = {
	rig: Model,
	root: BasePart,
	joints: { JointData },
	jointByChild: { [string]: JointData },
	childrenByParent: { [string]: { JointData } },
	parts: { [string]: BasePart },
}
type PoseState = {
	cframe: CFrame,
	weight: number,
	easingStyle: Enum.PoseEasingStyle,
	easingDirection: Enum.PoseEasingDirection,
}
type Context = {
	pathOf: (Instance) -> string,
	selectedRigs: () -> { Model },
}

local Retargeter = {}

local JOINT_MAP = {
	Torso = "LowerTorso",
	Head = "Head",
	["Left Arm"] = "LeftUpperArm",
	["Right Arm"] = "RightUpperArm",
	["Left Leg"] = "LeftUpperLeg",
	["Right Leg"] = "RightUpperLeg",
}

local TARGET_BODY_PARTS = {
	LowerTorso = true,
	UpperTorso = true,
	Head = true,
	LeftUpperArm = true,
	LeftLowerArm = true,
	LeftHand = true,
	RightUpperArm = true,
	RightLowerArm = true,
	RightHand = true,
	LeftUpperLeg = true,
	LeftLowerLeg = true,
	LeftFoot = true,
	RightUpperLeg = true,
	RightLowerLeg = true,
	RightFoot = true,
}

local function resolveByPath(path: string, className: string?): Instance?
	for _, descendant in game:GetDescendants() do
		if descendant:GetFullName() == path and (not className or descendant:IsA(className)) then
			return descendant
		end
	end
	return nil
end

local function resolveSequence(params: Dictionary): KeyframeSequence
	if type(params.sourcePath) == "string" and params.sourcePath ~= "" then
		local result = resolveByPath(params.sourcePath, "KeyframeSequence")
		if result and result:IsA("KeyframeSequence") then
			return result
		end
		error("Source KeyframeSequence was not found at path: " .. params.sourcePath)
	end
	if type(params.animationName) == "string" and params.animationName ~= "" then
		local occurrence = math.max(1, math.floor(params.occurrence or 1))
		local candidates = {}
		for _, descendant in game:GetDescendants() do
			if descendant:IsA("KeyframeSequence") and descendant.Name == params.animationName then
				table.insert(candidates, descendant)
			end
		end
		table.sort(candidates, function(left, right)
			return left:GetFullName() < right:GetFullName()
		end)
		local result = candidates[occurrence]
		if result then
			return result
		end
		error("Source KeyframeSequence was not found by name: " .. params.animationName)
	end
	error("Provide sourcePath or animationName for R6 to R15 retargeting.")
end

local function nearestRig(source: Instance): Model?
	local cursor: Instance? = source.Parent
	while cursor do
		if cursor:IsA("Model")
			and (cursor:FindFirstChildOfClass("Humanoid") or cursor:FindFirstChildOfClass("AnimationController"))
		then
			return cursor
		end
		cursor = cursor.Parent
	end
	return nil
end

local function rigAtPath(path: any): Model?
	if type(path) ~= "string" or path == "" then
		return nil
	end
	local result = resolveByPath(path, "Model")
	return if result and result:IsA("Model") then result else nil
end

local function resolveRigs(
	params: Dictionary,
	sequence: KeyframeSequence,
	context: Context
): (Model, Model)
	local selected = context.selectedRigs()
	local sourceRig = rigAtPath(params.sourceRigPath) or nearestRig(sequence)
	if not sourceRig then
		local index = math.max(1, math.floor(params.sourceSelectionIndex or 1))
		sourceRig = selected[index]
	end
	if not sourceRig then
		error("Select the source R6 rig or provide sourceRigPath.")
	end

	local targetRig = rigAtPath(params.targetRigPath)
	if not targetRig then
		local index = math.max(1, math.floor(params.targetSelectionIndex or 2))
		targetRig = selected[index]
	end
	if not targetRig then
		for _, candidate in selected do
			if candidate ~= sourceRig then
				targetRig = candidate
				break
			end
		end
	end
	if not targetRig then
		error("Select the target R15 rig together with the source rig or provide targetRigPath.")
	end
	if sourceRig == targetRig then
		error("Source and target rigs must be different Models.")
	end
	return sourceRig, targetRig
end

local function assertRigType(rig: Model, expected: Enum.HumanoidRigType, label: string)
	local humanoid = rig:FindFirstChildOfClass("Humanoid")
	if not humanoid or humanoid.RigType ~= expected then
		error(label .. " must be a " .. expected.Name .. " Humanoid rig: " .. rig:GetFullName())
	end
end

local function rigDataFor(rig: Model): RigData
	local root = rig:FindFirstChild("HumanoidRootPart", true) or rig.PrimaryPart
	if not root or not root:IsA("BasePart") then
		error("Rig has no HumanoidRootPart or PrimaryPart: " .. rig:GetFullName())
	end
	local parts: { [string]: BasePart } = {}
	local joints = {}
	local jointByChild = {}
	local childrenByParent = {}
	for _, descendant in rig:GetDescendants() do
		if descendant:IsA("BasePart") then
			parts[descendant.Name] = descendant
		elseif
			(descendant:IsA("Motor6D") or descendant:IsA("AnimationConstraint"))
			and descendant.Part0
			and descendant.Part1
		then
			local joint = descendant :: AnimationJoint
			local data: JointData = {
				joint = joint,
				parentName = joint.Part0.Name,
				childName = joint.Part1.Name,
			}
			table.insert(joints, data)
			jointByChild[data.childName] = data
			childrenByParent[data.parentName] = childrenByParent[data.parentName] or {}
			table.insert(childrenByParent[data.parentName], data)
		end
	end
	for _, children in childrenByParent do
		table.sort(children, function(left, right)
			return left.childName < right.childName
		end)
	end
	return {
		rig = rig,
		root = root,
		joints = joints,
		jointByChild = jointByChild,
		childrenByParent = childrenByParent,
		parts = parts,
	}
end

local function verifyRequiredParts(data: RigData, names: { string }, label: string)
	for _, name in names do
		if not data.parts[name] then
			error(label .. " is missing required body part: " .. name)
		end
		if name ~= data.root.Name and not data.jointByChild[name] then
			error(label .. " is missing an animation joint for body part: " .. name)
		end
	end
end

local function identityState(): PoseState
	return {
		cframe = CFrame.identity,
		weight = 1,
		easingStyle = Enum.PoseEasingStyle.Cubic,
		easingDirection = Enum.PoseEasingDirection.InOut,
	}
end

local function collectPoseState(pose: Pose, state: { [string]: PoseState })
	state[pose.Name] = {
		cframe = pose.CFrame,
		weight = pose.Weight,
		easingStyle = pose.EasingStyle,
		easingDirection = pose.EasingDirection,
	}
	for _, child in pose:GetSubPoses() do
		if child:IsA("Pose") then
			collectPoseState(child, state)
		end
	end
end

local function solveWorld(
	data: RigData,
	transforms: { [string]: CFrame },
	rootWorld: CFrame?
): { [string]: CFrame }
	local world = { [data.root.Name] = rootWorld or data.root.CFrame }
	local pending = table.clone(data.joints)
	while #pending > 0 do
		local progressed = false
		for index = #pending, 1, -1 do
			local item = pending[index]
			local parentWorld = world[item.parentName]
			if parentWorld then
				local transform = transforms[item.childName] or CFrame.identity
				world[item.childName] =
					parentWorld * item.joint.C0 * transform * item.joint.C1:Inverse()
				table.remove(pending, index)
				progressed = true
			end
		end
		if not progressed then
			error("Rig joint hierarchy is disconnected beneath " .. data.root.Name .. ".")
		end
	end
	return world
end

local function convertedNeutralByTarget(
	source: RigData,
	target: RigData
): { [string]: CFrame }
	local sourceNeutral = solveWorld(source, {}, source.root.CFrame)
	local targetNeutral = solveWorld(target, {}, target.root.CFrame)
	local result = {}
	for sourceName, targetName in JOINT_MAP do
		local desired =
			target.root.CFrame * source.root.CFrame:Inverse() * sourceNeutral[sourceName]
		local targetJoint = target.jointByChild[targetName]
		local parentWorld = targetNeutral[targetJoint.parentName]
		result[targetName] =
			targetJoint.joint.C0:Inverse()
			* parentWorld:Inverse()
			* desired
			* targetJoint.joint.C1
	end
	return result
end

local function sourceNameForTarget(targetName: string): string?
	for sourceName, mappedTarget in JOINT_MAP do
		if mappedTarget == targetName then
			return sourceName
		end
	end
	return nil
end

local function applyLegLateralScale(value: CFrame, scale: number, maximum: number): CFrame
	local position = value.Position
	local x = math.clamp(position.X * scale, -maximum, maximum)
	return CFrame.new(x, position.Y, position.Z) * value.Rotation
end

local function convertFrame(
	source: RigData,
	target: RigData,
	state: { [string]: PoseState },
	neutral: { [string]: CFrame },
	legLateralScale: number,
	maxLegLateralOffset: number
): ({ [string]: CFrame }, { [string]: PoseState })
	local sourceTransforms = {}
	for partName, poseState in state do
		sourceTransforms[partName] = poseState.cframe
	end
	local sourceWorld = solveWorld(source, sourceTransforms, source.root.CFrame)
	local targetTransforms = {}
	local targetMetadata = {}
	local targetWorld = { [target.root.Name] = target.root.CFrame }
	local pending = table.clone(target.joints)

	while #pending > 0 do
		local progressed = false
		for index = #pending, 1, -1 do
			local item = pending[index]
			local parentWorld = targetWorld[item.parentName]
			if parentWorld then
				local final = CFrame.identity
				local sourceName = sourceNameForTarget(item.childName)
				if sourceName then
					local desired =
						target.root.CFrame * source.root.CFrame:Inverse() * sourceWorld[sourceName]
					local converted =
						item.joint.C0:Inverse()
						* parentWorld:Inverse()
						* desired
						* item.joint.C1
					final = neutral[item.childName]:Inverse() * converted
					if item.childName == "LeftUpperLeg" or item.childName == "RightUpperLeg" then
						final = applyLegLateralScale(
							final,
							legLateralScale,
							maxLegLateralOffset
						)
					end
					targetMetadata[item.childName] = state[sourceName] or identityState()
				else
					targetMetadata[item.childName] = identityState()
				end
				targetTransforms[item.childName] = final
				targetWorld[item.childName] =
					parentWorld * item.joint.C0 * final * item.joint.C1:Inverse()
				table.remove(pending, index)
				progressed = true
			end
		end
		if not progressed then
			error("Target R15 joint hierarchy is disconnected beneath " .. target.root.Name .. ".")
		end
	end
	return targetTransforms, targetMetadata
end

local function addTargetPoseTree(
	parent: Instance,
	parentPartName: string,
	target: RigData,
	transforms: { [string]: CFrame },
	metadata: { [string]: PoseState }
)
	for _, item in target.childrenByParent[parentPartName] or {} do
		if TARGET_BODY_PARTS[item.childName] then
			local pose = Instance.new("Pose")
			pose.Name = item.childName
			pose.CFrame = transforms[item.childName] or CFrame.identity
			local poseState = metadata[item.childName] or identityState()
			pose.Weight = poseState.weight
			pose.EasingStyle = poseState.easingStyle
			pose.EasingDirection = poseState.easingDirection
			pose.Parent = parent
			addTargetPoseTree(pose, item.childName, target, transforms, metadata)
		end
	end
end

local function sortedKeyframes(sequence: KeyframeSequence): { Keyframe }
	local keyframes = sequence:GetKeyframes()
	table.sort(keyframes, function(left, right)
		if math.abs(left.Time - right.Time) > 1e-7 then
			return left.Time < right.Time
		end
		return left.Name < right.Name
	end)
	return keyframes
end

local function markerCount(sequence: KeyframeSequence): number
	local count = 0
	for _, descendant in sequence:GetDescendants() do
		if descendant:IsA("KeyframeMarker") or descendant:IsA("StringValue") then
			count += 1
		end
	end
	return count
end

function Retargeter.convert(params: Dictionary, context: Context): Dictionary
	local sourceSequence = resolveSequence(params)
	local sourceRig, targetRig = resolveRigs(params, sourceSequence, context)
	assertRigType(sourceRig, Enum.HumanoidRigType.R6, "Source rig")
	assertRigType(targetRig, Enum.HumanoidRigType.R15, "Target rig")

	local source = rigDataFor(sourceRig)
	local target = rigDataFor(targetRig)
	verifyRequiredParts(source, {
		"HumanoidRootPart",
		"Torso",
		"Head",
		"Left Arm",
		"Right Arm",
		"Left Leg",
		"Right Leg",
	}, "Source R6 rig")
	verifyRequiredParts(target, {
		"HumanoidRootPart",
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
	}, "Target R15 rig")

	local legLateralScale = math.clamp(params.legLateralScale or 0.4, 0, 1)
	local maxLegLateralOffset = math.clamp(params.maxLegLateralOffset or 0.12, 0, 1)
	local neutral = convertedNeutralByTarget(source, target)
	local sequence = sourceSequence:Clone()
	sequence.Name = params.outputName or (sourceSequence.Name .. "_R15")
	sequence:SetAttribute("MotionDirectorRetargetMethod", "R6WorldToR15LocalV1")
	sequence:SetAttribute("MotionDirectorSourceAnimation", context.pathOf(sourceSequence))
	sequence:SetAttribute("MotionDirectorSourceRig", context.pathOf(sourceRig))
	sequence:SetAttribute("MotionDirectorTargetRig", context.pathOf(targetRig))
	sequence:SetAttribute("MotionDirectorPreservesPartialPoseInheritance", true)
	sequence:SetAttribute("MotionDirectorRebasedAgainstNeutral", true)
	sequence:SetAttribute("MotionDirectorRigidR15Chains", true)
	sequence:SetAttribute("MotionDirectorLegLateralScale", legLateralScale)

	local state: { [string]: PoseState } = {}
	for _, name in {
		source.root.Name,
		"Torso",
		"Head",
		"Left Arm",
		"Right Arm",
		"Left Leg",
		"Right Leg",
	} do
		state[name] = identityState()
	end

	local convertedPoseCount = 0
	for _, keyframe in sortedKeyframes(sequence) do
		for _, child in keyframe:GetChildren() do
			if child:IsA("Pose") then
				collectPoseState(child, state)
			end
		end
		for _, child in keyframe:GetChildren() do
			if child:IsA("Pose") then
				child:Destroy()
			end
		end
		local transforms, metadata = convertFrame(
			source,
			target,
			state,
			neutral,
			legLateralScale,
			maxLegLateralOffset
		)
		local rootPose = Instance.new("Pose")
		rootPose.Name = target.root.Name
		local sourceRootState = state[source.root.Name] or identityState()
		rootPose.CFrame = sourceRootState.cframe
		rootPose.Weight = sourceRootState.weight
		rootPose.EasingStyle = sourceRootState.easingStyle
		rootPose.EasingDirection = sourceRootState.easingDirection
		rootPose.Parent = keyframe
		addTargetPoseTree(rootPose, target.root.Name, target, transforms, metadata)
		for _ in transforms do
			convertedPoseCount += 1
		end
	end

	return {
		sequence = sequence,
		targetRig = targetRig,
		sourceRig = sourceRig,
		sourceSequence = sourceSequence,
		keyframeCount = #sequence:GetKeyframes(),
		convertedPoseCount = convertedPoseCount,
		markerCount = markerCount(sequence),
		method = "R6WorldToR15LocalV1",
		legLateralScale = legLateralScale,
		maxLegLateralOffset = maxLegLateralOffset,
	}
end

return Retargeter
