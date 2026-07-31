--!strict

local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Selection = game:GetService("Selection")
local ServerStorage = game:GetService("ServerStorage")
local TweenService = game:GetService("TweenService")

type Dictionary = { [string]: any }
type Context = {
	pathOf: (Instance) -> string,
	selectedRig: () -> Model?,
}
type PoseSample = {
	time: number,
	cframe: CFrame,
	weight: number,
	easingStyle: string,
	easingDirection: string,
}
type AnimationJoint = Motor6D | AnimationConstraint
type RigData = {
	rig: Model,
	root: BasePart,
	joints: { AnimationJoint },
	jointByPart: { [string]: AnimationJoint },
	jointSystem: string,
	parts: { [string]: BasePart },
	animatedParts: { string },
}
type SolvedFrame = {
	time: number,
	normalizedTime: number,
	centerOfMass: Vector3,
	partFrames: { [string]: CFrame },
	lowestByPart: { [string]: number },
	supports: { string },
}

local Analyzer = {}

local function round(value: number, places: number?): number
	local scale = 10 ^ (places or 6)
	return math.round(value * scale) / scale
end

local function vector3(value: Vector3): Dictionary
	return { x = round(value.X), y = round(value.Y), z = round(value.Z) }
end

local function quaternion(value: CFrame): Dictionary
	local axis, angle = value.Rotation:ToAxisAngle()
	local half = angle * 0.5
	local scale = math.sin(half)
	return {
		x = round(axis.X * scale),
		y = round(axis.Y * scale),
		z = round(axis.Z * scale),
		w = round(math.cos(half)),
	}
end

local function transform(value: CFrame): Dictionary
	local x, y, z = value:ToOrientation()
	return {
		position = vector3(value.Position),
		rotation = quaternion(value),
		eulerDegrees = {
			x = round(math.deg(x), 4),
			y = round(math.deg(y), 4),
			z = round(math.deg(z), 4),
		},
	}
end

local function jsonSafe(value: any): any
	local kind = typeof(value)
	if kind == "nil" or kind == "string" or kind == "number" or kind == "boolean" then
		return value
	elseif kind == "Vector3" then
		return vector3(value)
	elseif kind == "CFrame" then
		return transform(value)
	elseif kind == "Color3" then
		return { r = round(value.R), g = round(value.G), b = round(value.B) }
	elseif kind == "BrickColor" or kind == "EnumItem" then
		return tostring(value)
	elseif kind == "table" then
		local result = {}
		for key, child in value do
			result[tostring(key)] = jsonSafe(child)
		end
		return result
	end
	return tostring(value)
end

local function attributes(instance: Instance): Dictionary
	return jsonSafe(instance:GetAttributes())
end

local function sequenceDuration(sequence: KeyframeSequence): number
	local duration = 0
	for _, keyframe in sequence:GetKeyframes() do
		duration = math.max(duration, keyframe.Time)
	end
	return duration
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

local function allAnimationClips(): { AnimationClip }
	local clips = {}
	for _, descendant in game:GetDescendants() do
		if descendant:IsA("KeyframeSequence") or descendant:IsA("CurveAnimation") then
			table.insert(clips, descendant)
		end
	end
	return clips
end

local function resolveByPath(path: string, occurrence: number?, className: string?): Instance?
	local found = {}
	for _, descendant in game:GetDescendants() do
		if descendant:GetFullName() == path
			and (not className or descendant:IsA(className))
		then
			table.insert(found, descendant)
		end
	end
	return found[math.max(1, occurrence or 1)]
end

local function resolveSequence(params: Dictionary): KeyframeSequence
	if type(params.sourcePath) == "string" and params.sourcePath ~= "" then
		local source = resolveByPath(params.sourcePath, params.occurrence, "KeyframeSequence")
		if source and source:IsA("KeyframeSequence") then
			return source
		end
		error("KeyframeSequence not found at path: " .. params.sourcePath)
	end

	if type(params.animationName) == "string" and params.animationName ~= "" then
		local candidates = {}
		for _, clip in allAnimationClips() do
			if clip:IsA("KeyframeSequence") and clip.Name == params.animationName then
				table.insert(candidates, clip)
			end
		end
		table.sort(candidates, function(left, right)
			return left:GetFullName() < right:GetFullName()
		end)
		local result = candidates[math.max(1, params.occurrence or 1)]
		if result then
			return result
		end
		error("KeyframeSequence not found by name: " .. params.animationName)
	end
	error("Provide sourcePath or animationName.")
end

local function nearestRig(source: Instance): Model?
	local cursor: Instance? = source.Parent
	while cursor do
		if cursor:IsA("Model") and (
			cursor:FindFirstChildOfClass("Humanoid")
			or cursor:FindFirstChildOfClass("AnimationController")
		) then
			return cursor
		end
		cursor = cursor.Parent
	end
	return nil
end

local function resolveRig(params: Dictionary, source: Instance, context: Context): Model
	if type(params.rigPath) == "string" and params.rigPath ~= "" then
		local instance = resolveByPath(params.rigPath, 1, "Model")
		if instance and instance:IsA("Model") then
			return instance
		end
		error("Rig Model not found at path: " .. params.rigPath)
	end
	local inferred = nearestRig(source)
	if inferred then
		return inferred
	end
	local selected = context.selectedRig()
	if selected then
		return selected
	end
	error("Select a rig or provide rigPath so spatial reconstruction can be performed.")
end

local function rigDataFor(rig: Model): RigData
	local root = rig:FindFirstChild("HumanoidRootPart", true)
		or rig.PrimaryPart
	if not root or not root:IsA("BasePart") then
		error("Rig has no HumanoidRootPart or PrimaryPart: " .. rig:GetFullName())
	end
	local joints: { AnimationJoint } = {}
	local jointByPart: { [string]: AnimationJoint } = {}
	local motorCount = 0
	local animationConstraintCount = 0
	local parts = {}
	local animatedSet = { [root.Name] = true }
	for _, descendant in rig:GetDescendants() do
		if descendant:IsA("BasePart") then
			parts[descendant.Name] = descendant
		elseif
			(descendant:IsA("Motor6D") or descendant:IsA("AnimationConstraint"))
			and descendant.Part0
			and descendant.Part1
		then
			local joint = descendant :: AnimationJoint
			table.insert(joints, joint)
			jointByPart[joint.Part1.Name] = joint
			if joint:IsA("Motor6D") then
				motorCount += 1
			else
				animationConstraintCount += 1
			end
			animatedSet[descendant.Part0.Name] = true
			animatedSet[descendant.Part1.Name] = true
		end
	end
	table.sort(joints, function(left, right)
		return left:GetFullName() < right:GetFullName()
	end)
	local animatedParts = {}
	for name in animatedSet do
		if parts[name] then
			table.insert(animatedParts, name)
		end
	end
	table.sort(animatedParts)
	local jointSystem = if animationConstraintCount > 0 and motorCount > 0
		then "Hybrid"
		elseif animationConstraintCount > 0
		then "AnimationConstraint"
		elseif motorCount > 0
		then "Motor6D"
		else "None"
	return {
		rig = rig,
		root = root,
		joints = joints,
		jointByPart = jointByPart,
		jointSystem = jointSystem,
		parts = parts,
		animatedParts = animatedParts,
	}
end

local function rigSnapshot(data: RigData, context: Context): Dictionary
	local humanoid = data.rig:FindFirstChildOfClass("Humanoid")
	local motors = {}
	local animationConstraints = {}
	local animationJoints = {}
	for _, joint in data.joints do
		local item: Dictionary = {
			name = joint.Name,
			className = joint.ClassName,
			path = context.pathOf(joint),
			part0 = joint.Part0 and joint.Part0.Name or nil,
			part1 = joint.Part1 and joint.Part1.Name or nil,
			trackName = joint.Part1 and joint.Part1.Name or joint.Name,
			c0 = transform(joint.C0),
			c1 = transform(joint.C1),
			restTransform = transform(joint.Transform),
		}
		if joint:IsA("AnimationConstraint") then
			item.attachment0 = joint.Attachment0 and {
				name = joint.Attachment0.Name,
				path = context.pathOf(joint.Attachment0),
				cframe = transform(joint.Attachment0.CFrame),
			} or nil
			item.attachment1 = joint.Attachment1 and {
				name = joint.Attachment1.Name,
				path = context.pathOf(joint.Attachment1),
				cframe = transform(joint.Attachment1.CFrame),
			} or nil
			item.isKinematic = joint.IsKinematic
			table.insert(animationConstraints, item)
		else
			table.insert(motors, item)
		end
		table.insert(animationJoints, item)
	end
	local parts = {}
	for _, name in data.animatedParts do
		local part = data.parts[name]
		table.insert(parts, {
			name = name,
			size = vector3(part.Size),
			mass = round(part:GetMass()),
			restRootRelative = transform(data.root.CFrame:ToObjectSpace(part.CFrame)),
		})
	end
	return {
		path = context.pathOf(data.rig),
		name = data.rig.Name,
		rigType = humanoid and humanoid.RigType.Name or "Custom",
		rootPart = data.root.Name,
		jointSystem = data.jointSystem,
		animationJoints = animationJoints,
		motors = motors,
		animationConstraints = animationConstraints,
		parts = parts,
		attributes = attributes(data.rig),
	}
end

local function serializePose(
	pose: Pose,
	parentPose: string?,
	includeParts: { [string]: boolean }?
): Dictionary?
	local posePath = if parentPose then parentPose .. "/" .. pose.Name else pose.Name
	local children = {}
	for _, child in pose:GetSubPoses() do
		if child:IsA("Pose") then
			local serialized = serializePose(child, posePath, includeParts)
			if serialized then
				table.insert(children, serialized)
			end
		end
	end
	if includeParts and not includeParts[pose.Name] and #children == 0 then
		return nil
	end
	local item: Dictionary = {
		name = pose.Name,
		path = posePath,
		parentPose = parentPose,
		cframe = transform(pose.CFrame),
		weight = round(pose.Weight),
		easingStyle = pose.EasingStyle.Name,
		easingDirection = pose.EasingDirection.Name,
		attributes = attributes(pose),
	}
	local okMask, maskWeight = pcall(function()
		return pose.MaskWeight
	end)
	if okMask then
		item.maskWeight = round(maskWeight)
	end
	table.sort(children, function(left, right)
		return left.name < right.name
	end)
	item.children = children
	return item
end

local function serializeKeyframe(
	keyframe: Keyframe,
	includeParts: { [string]: boolean }?
): Dictionary
	local markers = {}
	for _, marker in keyframe:GetMarkers() do
		table.insert(markers, {
			name = marker.Name,
			value = marker.Value,
			attributes = attributes(marker),
		})
	end
	table.sort(markers, function(left, right)
		return left.name < right.name
	end)
	local poses = {}
	for _, pose in keyframe:GetPoses() do
		if pose:IsA("Pose") then
			local serialized = serializePose(pose, nil, includeParts)
			if serialized then
				table.insert(poses, serialized)
			end
		end
	end
	table.sort(poses, function(left, right)
		return left.name < right.name
	end)
	return {
		name = keyframe.Name,
		time = round(keyframe.Time),
		markers = markers,
		poses = poses,
		attributes = attributes(keyframe),
	}
end

local function collectTrackKeys(sequence: KeyframeSequence): { [string]: { PoseSample } }
	local tracks: { [string]: { PoseSample } } = {}
	for _, keyframe in sortedKeyframes(sequence) do
		for _, descendant in keyframe:GetDescendants() do
			if descendant:IsA("Pose") then
				local keys = tracks[descendant.Name] or {}
				table.insert(keys, {
					time = keyframe.Time,
					cframe = descendant.CFrame,
					weight = descendant.Weight,
					easingStyle = descendant.EasingStyle.Name,
					easingDirection = descendant.EasingDirection.Name,
				})
				tracks[descendant.Name] = keys
			end
		end
	end
	for _, keys in tracks do
		table.sort(keys, function(left, right)
			return left.time < right.time
		end)
	end
	return tracks
end

local function easingAlpha(alpha: number, style: string, direction: string): number
	local normalized = math.clamp(alpha, 0, 1)
	if style == "Constant" then
		return if normalized >= 1 then 1 else 0
	end
	local styleMap = {
		Linear = Enum.EasingStyle.Linear,
		Cubic = Enum.EasingStyle.Cubic,
		CubicV2 = Enum.EasingStyle.Cubic,
		Elastic = Enum.EasingStyle.Elastic,
		Bounce = Enum.EasingStyle.Bounce,
	}
	local directionMap = {
		In = Enum.EasingDirection.In,
		Out = Enum.EasingDirection.Out,
		InOut = Enum.EasingDirection.InOut,
	}
	return TweenService:GetValue(
		normalized,
		styleMap[style] or Enum.EasingStyle.Linear,
		directionMap[direction] or Enum.EasingDirection.InOut
	)
end

local function sampleTrack(keys: { PoseSample }?, time: number): (CFrame, number)
	if not keys or #keys == 0 then
		return CFrame.identity, 0
	end
	if time <= keys[1].time then
		return keys[1].cframe, keys[1].weight
	end
	for index = 2, #keys do
		local right = keys[index]
		if time <= right.time then
			local left = keys[index - 1]
			local alpha = (time - left.time) / math.max(1e-7, right.time - left.time)
			local eased = easingAlpha(alpha, left.easingStyle, left.easingDirection)
			return left.cframe:Lerp(right.cframe, eased), left.weight + (right.weight - left.weight) * eased
		end
	end
	return keys[#keys].cframe, keys[#keys].weight
end

local function lowestY(cf: CFrame, size: Vector3): number
	local half = size * 0.5
	local extent = math.abs(cf.RightVector.Y) * half.X
		+ math.abs(cf.UpVector.Y) * half.Y
		+ math.abs(cf.LookVector.Y) * half.Z
	return cf.Position.Y - extent
end

local function solveFrame(
	data: RigData,
	tracks: { [string]: { PoseSample } },
	time: number,
	duration: number
): SolvedFrame
	local frames: { [string]: CFrame } = {
		[data.root.Name] = CFrame.identity,
	}
	local unresolved = table.clone(data.joints)
	for _ = 1, #data.joints + 1 do
		local progressed = false
		for index = #unresolved, 1, -1 do
			local joint = unresolved[index]
			local part0 = joint.Part0
			local part1 = joint.Part1
			local parentFrame = part0 and frames[part0.Name]
			if part0 and part1 and parentFrame then
				local sampled = sampleTrack(tracks[part1.Name], time)
				frames[part1.Name] = parentFrame * joint.C0 * sampled * joint.C1:Inverse()
				table.remove(unresolved, index)
				progressed = true
			end
		end
		if not progressed then
			break
		end
	end
	for _, name in data.animatedParts do
		if not frames[name] then
			local part = data.parts[name]
			frames[name] = data.root.CFrame:ToObjectSpace(part.CFrame)
		end
	end

	local totalMass = 0
	local weighted = Vector3.zero
	local lowestByPart = {}
	local minimumFoot = math.huge
	local footNames = {}
	for _, name in data.animatedParts do
		local part = data.parts[name]
		local frame = frames[name]
		local mass = math.max(1e-4, part:GetMass())
		totalMass += mass
		weighted += frame.Position * mass
		if string.find(name, "Foot") or string.find(name, "Leg") then
			local low = lowestY(frame, part.Size)
			lowestByPart[name] = low
			minimumFoot = math.min(minimumFoot, low)
			table.insert(footNames, name)
		end
	end
	local supports = {}
	for _, name in footNames do
		if lowestByPart[name] <= minimumFoot + 0.08 then
			table.insert(supports, name)
		end
	end
	table.sort(supports)
	return {
		time = time,
		normalizedTime = if duration > 0 then time / duration else 0,
		centerOfMass = if totalMass > 0 then weighted / totalMass else Vector3.zero,
		partFrames = frames,
		lowestByPart = lowestByPart,
		supports = supports,
	}
end

local function framePayload(
	frame: SolvedFrame,
	previous: SolvedFrame?,
	data: RigData,
	includeParts: { [string]: boolean }?
): Dictionary
	local parts = {}
	for _, name in data.animatedParts do
		if not includeParts or includeParts[name] then
			local cf = frame.partFrames[name]
			local velocity = Vector3.zero
			local speed = 0
			local angularSpeed = 0
			if previous then
				local deltaTime = math.max(1e-7, frame.time - previous.time)
				velocity = (cf.Position - previous.partFrames[name].Position) / deltaTime
				speed = velocity.Magnitude
				local _, angle = previous.partFrames[name].Rotation:ToObjectSpace(cf.Rotation):ToAxisAngle()
				angularSpeed = math.abs(angle) / deltaTime
			end
			parts[name] = {
				transform = transform(cf),
				velocity = vector3(velocity),
				speed = round(speed),
				angularSpeedDegrees = round(math.deg(angularSpeed), 3),
				lowestY = frame.lowestByPart[name] and round(frame.lowestByPart[name]) or nil,
			}
		end
	end
	return {
		time = round(frame.time),
		normalizedTime = round(frame.normalizedTime),
		centerOfMass = vector3(frame.centerOfMass),
		supports = frame.supports,
		parts = parts,
	}
end

local function metricsFor(
	data: RigData,
	tracks: { [string]: { PoseSample } },
	duration: number,
	sampleRate: number
): Dictionary
	local count = math.max(1, math.ceil(duration * sampleRate))
	local previous: SolvedFrame? = nil
	local pathLength: { [string]: number } = {}
	local maximumSpeed: { [string]: number } = {}
	local maximumAngularSpeed: { [string]: number } = {}
	local supportTravel: { [string]: number } = {}
	local comMin = Vector3.new(math.huge, math.huge, math.huge)
	local comMax = Vector3.new(-math.huge, -math.huge, -math.huge)
	for index = 0, count do
		local time = if count > 0 then duration * index / count else 0
		local frame = solveFrame(data, tracks, time, duration)
		comMin = Vector3.new(
			math.min(comMin.X, frame.centerOfMass.X),
			math.min(comMin.Y, frame.centerOfMass.Y),
			math.min(comMin.Z, frame.centerOfMass.Z)
		)
		comMax = Vector3.new(
			math.max(comMax.X, frame.centerOfMass.X),
			math.max(comMax.Y, frame.centerOfMass.Y),
			math.max(comMax.Z, frame.centerOfMass.Z)
		)
		if previous then
			local deltaTime = math.max(1e-7, frame.time - previous.time)
			local previousSupports = {}
			for _, support in previous.supports do
				previousSupports[support] = true
			end
			for _, name in data.animatedParts do
				local current = frame.partFrames[name]
				local before = previous.partFrames[name]
				local distance = (current.Position - before.Position).Magnitude
				pathLength[name] = (pathLength[name] or 0) + distance
				maximumSpeed[name] = math.max(maximumSpeed[name] or 0, distance / deltaTime)
				local _, angle = before.Rotation:ToObjectSpace(current.Rotation):ToAxisAngle()
				maximumAngularSpeed[name] = math.max(
					maximumAngularSpeed[name] or 0,
					math.deg(math.abs(angle) / deltaTime)
				)
				if previousSupports[name] and table.find(frame.supports, name) then
					local horizontal = Vector3.new(
						current.Position.X - before.Position.X,
						0,
						current.Position.Z - before.Position.Z
					).Magnitude
					supportTravel[name] = (supportTravel[name] or 0) + horizontal
				end
			end
		end
		previous = frame
	end
	local joints = {}
	for _, name in data.animatedParts do
		joints[name] = {
			pathLength = round(pathLength[name] or 0),
			maximumSpeed = round(maximumSpeed[name] or 0),
			maximumAngularSpeedDegrees = round(maximumAngularSpeed[name] or 0, 3),
			supportTravelRootRelative = round(supportTravel[name] or 0),
		}
	end
	local translationByJoint = {}
	for name, keys in tracks do
		local maximum = 0
		for _, key in keys do
			maximum = math.max(maximum, key.cframe.Position.Magnitude)
		end
		translationByJoint[name] = round(maximum)
	end
	return {
		sampleRate = sampleRate,
		sampleCount = count + 1,
		centerOfMassBounds = {
			minimum = vector3(comMin),
			maximum = vector3(comMax),
			range = vector3(comMax - comMin),
		},
		supportMotionInterpretation = "Root-relative support travel. True world foot sliding requires root motion or gameplay displacement.",
		joints = joints,
		maximumPoseTranslationByJoint = translationByJoint,
	}
end

local function sequenceMetadata(sequence: KeyframeSequence, context: Context): Dictionary
	local keyframes = sortedKeyframes(sequence)
	local markerCount = 0
	local poseCount = 0
	for _, keyframe in keyframes do
		markerCount += #keyframe:GetMarkers()
		for _, descendant in keyframe:GetDescendants() do
			if descendant:IsA("Pose") then
				poseCount += 1
			end
		end
	end
	return {
		path = context.pathOf(sequence),
		name = sequence.Name,
		className = sequence.ClassName,
		duration = round(sequenceDuration(sequence)),
		length = round(sequence.Length),
		looped = sequence.Loop,
		priority = sequence.Priority.Name,
		keyframeCount = #keyframes,
		poseCount = poseCount,
		markerCount = markerCount,
		attributes = attributes(sequence),
	}
end

function Analyzer.list(params: Dictionary, context: Context): Dictionary
	local nameContains = string.lower(params.nameContains or "")
	local pathContains = string.lower(params.pathContains or "")
	local maximum = math.clamp(params.maxResults or 200, 1, 500)
	local items = {}
	for _, clip in allAnimationClips() do
		local path = context.pathOf(clip)
		if (nameContains == "" or string.find(string.lower(clip.Name), nameContains, 1, true))
			and (pathContains == "" or string.find(string.lower(path), pathContains, 1, true))
		then
			local item: Dictionary = {
				path = path,
				name = clip.Name,
				className = clip.ClassName,
				looped = clip.Loop,
				priority = clip.Priority.Name,
				length = round(clip.Length),
				attributes = attributes(clip),
			}
			if clip:IsA("KeyframeSequence") then
				item.keyframeCount = #clip:GetKeyframes()
				item.duration = round(sequenceDuration(clip))
				item.supported = true
			else
				item.supported = false
				item.unsupportedReason = "CurveAnimation raw curve export is planned for analyzer v2."
			end
			table.insert(items, item)
		end
	end
	table.sort(items, function(left, right)
		if left.path == right.path then
			return left.className < right.className
		end
		return left.path < right.path
	end)
	local occurrenceByPath = {}
	for _, item in items do
		local occurrence = (occurrenceByPath[item.path] or 0) + 1
		occurrenceByPath[item.path] = occurrence
		item.occurrence = occurrence
	end
	local truncated = #items > maximum
	while #items > maximum do
		table.remove(items)
	end
	return {
		count = #items,
		truncated = truncated,
		items = items,
	}
end

function Analyzer.inspect(params: Dictionary, context: Context): Dictionary
	local sequence = resolveSequence(params)
	local duration = sequenceDuration(sequence)
	local sampleRate = math.clamp(params.sampleRate or 60, 1, 120)
	local tracks = collectTrackKeys(sequence)
	local keyframes = sortedKeyframes(sequence)
	local page = math.max(1, math.floor(params.page or 1))
	local pageSize = math.clamp(math.floor(params.pageSize or 1), 1, 10)
	local rawStart = math.clamp(
		params.rawStart or ((page - 1) * pageSize),
		0,
		math.max(0, #keyframes)
	)
	local rawCount = math.clamp(params.rawCount or pageSize, 0, 10)
	local sampleTotal = math.max(1, math.ceil(duration * sampleRate)) + 1
	local sampleStart = math.clamp(
		params.sampleStart or ((page - 1) * pageSize),
		0,
		sampleTotal
	)
	local sampleCount = math.clamp(params.sampleCount or pageSize, 0, 10)
	local includeParts: { [string]: boolean }? = nil
	if type(params.parts) == "table" and #params.parts > 0 then
		includeParts = {}
		for _, name in params.parts do
			includeParts[name] = true
		end
	end
	local includeRig = params.includeRig ~= false
	local includeRaw = params.includeRaw ~= false
	local includeSamples = params.includeSamples ~= false
	local includeMetrics = params.includeMetrics ~= false
	local needsRig = includeRig or includeSamples or includeMetrics
	local data: RigData? = nil
	if needsRig then
		data = rigDataFor(resolveRig(params, sequence, context))
	end
	local result: Dictionary = {
		format = "motion-director-animation-analysis-v2",
		sequence = sequenceMetadata(sequence, context),
		request = {
			page = page,
			pageSize = pageSize,
			includeRig = includeRig,
			includeRaw = includeRaw,
			includeSamples = includeSamples,
			includeMetrics = includeMetrics,
		},
		pagination = {
			raw = {
				total = #keyframes,
				start = rawStart,
				count = math.min(rawCount, math.max(0, #keyframes - rawStart)),
			},
			samples = {
				total = sampleTotal,
				start = sampleStart,
				count = math.min(sampleCount, math.max(0, sampleTotal - sampleStart)),
				rate = sampleRate,
			},
		},
	}
	if includeRig and data then
		result.rig = rigSnapshot(data, context)
	end
	if includeRaw and rawCount > 0 then
		local raw = {}
		for index = rawStart + 1, math.min(#keyframes, rawStart + rawCount) do
			table.insert(raw, serializeKeyframe(keyframes[index], includeParts))
		end
		result.rawKeyframes = raw
	end
	if includeSamples and sampleCount > 0 then
		if not data then
			error("Spatial samples require a selected rig or rigPath.")
		end
		local samples = {}
		for zeroIndex = sampleStart, math.min(sampleTotal - 1, sampleStart + sampleCount - 1) do
			local time = if sampleTotal > 1 then duration * zeroIndex / (sampleTotal - 1) else 0
			local frame = solveFrame(data, tracks, time, duration)
			local previous = nil
			if zeroIndex > 0 then
				local previousTime = duration * (zeroIndex - 1) / (sampleTotal - 1)
				previous = solveFrame(data, tracks, previousTime, duration)
			end
			table.insert(samples, framePayload(frame, previous, data, includeParts))
		end
		result.sampledFrames = samples
	end
	if includeMetrics then
		if not data then
			error("Spatial metrics require a selected rig or rigPath.")
		end
		result.metrics = metricsFor(data, tracks, duration, sampleRate)
	end
	return result
end

local function normalizedFrames(
	sequence: KeyframeSequence,
	data: RigData,
	count: number
): ({ SolvedFrame }, { [string]: { PoseSample } })
	local duration = sequenceDuration(sequence)
	local tracks = collectTrackKeys(sequence)
	local frames = {}
	for index = 0, count - 1 do
		local normalized = if count > 1 then index / (count - 1) else 0
		table.insert(frames, solveFrame(data, tracks, duration * normalized, duration))
	end
	return frames, tracks
end

local function frameDistance(
	left: SolvedFrame,
	right: SolvedFrame,
	partNames: { string }
): number
	local total = 0
	local count = 0
	for _, name in partNames do
		if left.partFrames[name] and right.partFrames[name] then
			total += (left.partFrames[name].Position - right.partFrames[name].Position).Magnitude ^ 2
			count += 1
		end
	end
	return if count > 0 then math.sqrt(total / count) else math.huge
end

function Analyzer.compare(params: Dictionary, context: Context): Dictionary
	local leftSequence = resolveSequence({
		sourcePath = params.sourcePathA,
		animationName = params.animationNameA,
		occurrence = params.occurrenceA,
	})
	local rightSequence = resolveSequence({
		sourcePath = params.sourcePathB,
		animationName = params.animationNameB,
		occurrence = params.occurrenceB,
	})
	local rig = resolveRig(params, leftSequence, context)
	local data = rigDataFor(rig)
	local count = math.clamp(params.normalizedSamples or 61, 9, 241)
	local leftFrames, leftTracks = normalizedFrames(leftSequence, data, count)
	local rightFrames, rightTracks = normalizedFrames(rightSequence, data, count)
	local requestedParts = {}
	if type(params.parts) == "table" and #params.parts > 0 then
		for _, name in params.parts do
			if data.parts[name] then
				table.insert(requestedParts, name)
			end
		end
	else
		requestedParts = table.clone(data.animatedParts)
	end

	local bestShift = 0
	local bestScore = math.huge
	local canShift = leftSequence.Loop and rightSequence.Loop
	local shiftCount = if canShift then math.min(32, count - 1) else 1
	for candidate = 0, shiftCount - 1 do
		local total = 0
		for index = 1, count do
			local shifted = if canShift
				then ((index - 1 + math.floor(candidate * (count - 1) / shiftCount)) % (count - 1)) + 1
				else index
			total += frameDistance(leftFrames[index], rightFrames[shifted], requestedParts)
		end
		local score = total / count
		if score < bestScore then
			bestScore = score
			bestShift = candidate
		end
	end
	local frameOffset = if canShift
		then math.floor(bestShift * (count - 1) / shiftCount)
		else 0
	local perPart = {}
	for _, name in requestedParts do
		local squaredPosition = 0
		local squaredAngle = 0
		local compared = 0
		for index = 1, count do
			local shifted = if canShift then ((index - 1 + frameOffset) % (count - 1)) + 1 else index
			local leftFrame = leftFrames[index].partFrames[name]
			local rightFrame = rightFrames[shifted].partFrames[name]
			if leftFrame and rightFrame then
				squaredPosition += (leftFrame.Position - rightFrame.Position).Magnitude ^ 2
				local _, angle = leftFrame.Rotation:ToObjectSpace(rightFrame.Rotation):ToAxisAngle()
				squaredAngle += math.deg(angle) ^ 2
				compared += 1
			end
		end
		if compared > 0 then
			perPart[name] = {
				positionRms = round(math.sqrt(squaredPosition / compared)),
				angularRmsDegrees = round(math.sqrt(squaredAngle / compared), 3),
			}
		end
	end
	local sampleRate = math.clamp(params.sampleRate or 60, 1, 120)
	return {
		format = "motion-director-animation-comparison-v1",
		left = sequenceMetadata(leftSequence, context),
		right = sequenceMetadata(rightSequence, context),
		rig = rigSnapshot(data, context),
		alignment = {
			phaseShiftNormalized = if canShift then round(frameOffset / (count - 1)) else 0,
			positionRmsAfterAlignment = round(bestScore),
			normalizedSamples = count,
		},
		perPart = perPart,
		leftMetrics = metricsFor(data, leftTracks, sequenceDuration(leftSequence), sampleRate),
		rightMetrics = metricsFor(data, rightTracks, sequenceDuration(rightSequence), sampleRate),
	}
end

return Analyzer
