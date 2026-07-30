--!strict

local ChangeHistoryService = game:GetService("ChangeHistoryService")
local HttpService = game:GetService("HttpService")
local KeyframeSequenceProvider = game:GetService("KeyframeSequenceProvider")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Selection = game:GetService("Selection")
local ServerStorage = game:GetService("ServerStorage")
local StudioService = game:GetService("StudioService")
local AnimationAnalyzer = require(script.Parent:WaitForChild("AnimationAnalyzer"))

local LOCAL_BRIDGE_URL = "http://127.0.0.1:34718"
local PLUGIN_VERSION = "0.3.0"
local HEADER = { ["x-roblox-motion-bridge"] = "1", ["content-type"] = "application/json" }

local savedRelayUrl = plugin:GetSetting("MotionDirectorRelayUrl")
local relayBridgeUrl = if type(savedRelayUrl) == "string" then savedRelayUrl:gsub("/+$", "") else ""
local savedMode = plugin:GetSetting("MotionDirectorBridgeMode")
local bridgeMode = if savedMode == "chatgpt" then "chatgpt" else "local"
local installationId = plugin:GetSetting("MotionDirectorInstallationId")
if type(installationId) ~= "string" or installationId == "" then
	installationId = HttpService:GenerateGUID(false)
	plugin:SetSetting("MotionDirectorInstallationId", installationId)
end

local sessionId: string? = nil
local agentToken: string? = nil
local pairingCode: string? = nil
local pollIntervalSeconds = 0.35

type Dictionary = { [string]: any }

local toolbar = plugin:CreateToolbar("Motion Director")
local toggleButton = toolbar:CreateButton(
	"Motion Director",
	"Open the local-first professional animation bridge",
	"rbxassetid://14978048121"
)
toggleButton.ClickableWhenViewportHidden = true

local widgetInfo = DockWidgetPluginGuiInfo.new(
	Enum.InitialDockState.Right,
	true,
	false,
	340,
	390,
	280,
	300
)
local widget = plugin:CreateDockWidgetPluginGui("RobloxMotionDirector", widgetInfo)
widget.Title = "Motion Director"

local root = Instance.new("Frame")
root.Name = "Root"
root.BackgroundColor3 = Color3.fromRGB(22, 24, 30)
root.BorderSizePixel = 0
root.Size = UDim2.fromScale(1, 1)
root.Parent = widget

local padding = Instance.new("UIPadding")
padding.PaddingLeft = UDim.new(0, 16)
padding.PaddingRight = UDim.new(0, 16)
padding.PaddingTop = UDim.new(0, 16)
padding.PaddingBottom = UDim.new(0, 16)
padding.Parent = root

local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 10)
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = root

local title = Instance.new("TextLabel")
title.BackgroundTransparency = 1
title.Font = Enum.Font.BuilderSansBold
title.Text = "MOTION DIRECTOR"
title.TextColor3 = Color3.fromRGB(241, 244, 255)
title.TextSize = 20
title.TextXAlignment = Enum.TextXAlignment.Left
title.Size = UDim2.new(1, 0, 0, 28)
title.Parent = root

local status = Instance.new("TextLabel")
status.BackgroundColor3 = Color3.fromRGB(34, 37, 47)
status.BorderSizePixel = 0
status.Font = Enum.Font.BuilderSans
status.Text = "Companion offline"
status.TextColor3 = Color3.fromRGB(255, 176, 92)
status.TextSize = 15
status.TextWrapped = true
status.Size = UDim2.new(1, 0, 0, 54)
status.Parent = root

local statusCorner = Instance.new("UICorner")
statusCorner.CornerRadius = UDim.new(0, 8)
statusCorner.Parent = status

local explanation = Instance.new("TextLabel")
explanation.BackgroundTransparency = 1
explanation.Font = Enum.Font.BuilderSans
explanation.Text = "Local MCP bridge. Drafts remain reversible until an explicit commit."
explanation.TextColor3 = Color3.fromRGB(167, 174, 194)
explanation.TextSize = 13
explanation.TextWrapped = true
explanation.TextXAlignment = Enum.TextXAlignment.Left
explanation.TextYAlignment = Enum.TextYAlignment.Top
explanation.Size = UDim2.new(1, 0, 0, 48)
explanation.Parent = root

local relayUrlBox = Instance.new("TextBox")
relayUrlBox.BackgroundColor3 = Color3.fromRGB(34, 37, 47)
relayUrlBox.BorderSizePixel = 0
relayUrlBox.ClearTextOnFocus = false
relayUrlBox.Font = Enum.Font.Code
relayUrlBox.PlaceholderText = "https://relay.example.com"
relayUrlBox.Text = relayBridgeUrl
relayUrlBox.TextColor3 = Color3.fromRGB(224, 229, 244)
relayUrlBox.PlaceholderColor3 = Color3.fromRGB(112, 120, 144)
relayUrlBox.TextSize = 12
relayUrlBox.TextXAlignment = Enum.TextXAlignment.Left
relayUrlBox.Size = UDim2.new(1, 0, 0, 34)
relayUrlBox.Parent = root

local relayUrlCorner = Instance.new("UICorner")
relayUrlCorner.CornerRadius = UDim.new(0, 7)
relayUrlCorner.Parent = relayUrlBox

local modeButtons = Instance.new("Frame")
modeButtons.BackgroundTransparency = 1
modeButtons.Size = UDim2.new(1, 0, 0, 34)
modeButtons.Parent = root

local modeLayout = Instance.new("UIListLayout")
modeLayout.FillDirection = Enum.FillDirection.Horizontal
modeLayout.Padding = UDim.new(0, 8)
modeLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
modeLayout.Parent = modeButtons

local localModeButton = Instance.new("TextButton")
localModeButton.BackgroundColor3 = Color3.fromRGB(48, 53, 67)
localModeButton.BorderSizePixel = 0
localModeButton.Font = Enum.Font.BuilderSansBold
localModeButton.Text = "LOCAL MCP"
localModeButton.TextColor3 = Color3.fromRGB(225, 230, 245)
localModeButton.TextSize = 12
localModeButton.Size = UDim2.new(0.5, -4, 1, 0)
localModeButton.Parent = modeButtons

local localModeCorner = Instance.new("UICorner")
localModeCorner.CornerRadius = UDim.new(0, 7)
localModeCorner.Parent = localModeButton

local chatGptModeButton = Instance.new("TextButton")
chatGptModeButton.BackgroundColor3 = Color3.fromRGB(48, 53, 67)
chatGptModeButton.BorderSizePixel = 0
chatGptModeButton.Font = Enum.Font.BuilderSansBold
chatGptModeButton.Text = "CHATGPT WEB"
chatGptModeButton.TextColor3 = Color3.fromRGB(225, 230, 245)
chatGptModeButton.TextSize = 12
chatGptModeButton.Size = UDim2.new(0.5, -4, 1, 0)
chatGptModeButton.Parent = modeButtons

local chatGptModeCorner = Instance.new("UICorner")
chatGptModeCorner.CornerRadius = UDim.new(0, 7)
chatGptModeCorner.Parent = chatGptModeButton

local pairLabel = Instance.new("TextLabel")
pairLabel.BackgroundColor3 = Color3.fromRGB(29, 32, 40)
pairLabel.BorderSizePixel = 0
pairLabel.Font = Enum.Font.Code
pairLabel.Text = "ChatGPT pairing code will appear here"
pairLabel.TextColor3 = Color3.fromRGB(160, 169, 193)
pairLabel.TextSize = 14
pairLabel.TextWrapped = true
pairLabel.Size = UDim2.new(1, 0, 0, 42)
pairLabel.Parent = root

local pairCorner = Instance.new("UICorner")
pairCorner.CornerRadius = UDim.new(0, 7)
pairCorner.Parent = pairLabel

toggleButton.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)

local running = true
local activePreviewTracks: { AnimationTrack } = {}

local function updateModeButtons()
	local localActive = bridgeMode == "local"
	localModeButton.BackgroundColor3 = if localActive
		then Color3.fromRGB(67, 96, 154)
		else Color3.fromRGB(48, 53, 67)
	chatGptModeButton.BackgroundColor3 = if localActive
		then Color3.fromRGB(48, 53, 67)
		else Color3.fromRGB(67, 96, 154)
	relayUrlBox.Visible = not localActive
	pairLabel.Visible = not localActive
	explanation.Text = if localActive
		then "Local MCP bridge. Drafts remain reversible until an explicit commit."
		else "Remote GPT Action bridge. Share only the temporary pairing code shown below."
end

local function resetConnection()
	sessionId = nil
	agentToken = nil
	pairingCode = nil
	pollIntervalSeconds = if bridgeMode == "local" then 0.35 else 0.5
	pairLabel.Text = "Connecting to ChatGPT relay..."
end

localModeButton.MouseButton1Click:Connect(function()
	bridgeMode = "local"
	plugin:SetSetting("MotionDirectorBridgeMode", bridgeMode)
	resetConnection()
	updateModeButtons()
end)

chatGptModeButton.MouseButton1Click:Connect(function()
	bridgeMode = "chatgpt"
	plugin:SetSetting("MotionDirectorBridgeMode", bridgeMode)
	resetConnection()
	updateModeButtons()
end)

relayUrlBox.FocusLost:Connect(function()
	relayBridgeUrl = relayUrlBox.Text:gsub("^%s+", ""):gsub("%s+$", ""):gsub("/+$", "")
	relayUrlBox.Text = relayBridgeUrl
	plugin:SetSetting("MotionDirectorRelayUrl", relayBridgeUrl)
	if bridgeMode == "chatgpt" then
		resetConnection()
	end
end)

updateModeButtons()

local function activeBridgeUrl(): string
	if bridgeMode == "chatgpt" then
		return relayBridgeUrl
	end
	return LOCAL_BRIDGE_URL
end

local function request(path: string, body: Dictionary): (boolean, any)
	local bridgeUrl = activeBridgeUrl()
	if bridgeUrl == "" then
		return false, "Configure the public Motion Director relay URL."
	end
	local ok, response = pcall(function()
		return HttpService:RequestAsync({
			Url = bridgeUrl .. path,
			Method = "POST",
			Headers = HEADER,
			Body = HttpService:JSONEncode(body),
			Timeout = 5,
		})
	end)
	if not ok then
		return false, response
	end
	if not response.Success then
		return false, "HTTP " .. tostring(response.StatusCode) .. ": " .. tostring(response.Body)
	end
	local decodedOk, decoded = pcall(function()
		return HttpService:JSONDecode(response.Body)
	end)
	if not decodedOk then
		return false, decoded
	end
	return true, decoded
end

local function pathOf(instance: Instance): string
	local pieces = {}
	local cursor: Instance? = instance
	while cursor and cursor ~= game do
		table.insert(pieces, 1, cursor.Name)
		cursor = cursor.Parent
	end
	return table.concat(pieces, ".")
end

local function vector3(value: Vector3): Dictionary
	return { x = value.X, y = value.Y, z = value.Z }
end

local function quaternionFromCFrame(value: CFrame): Dictionary
	local axis, angle = value:ToAxisAngle()
	local half = angle * 0.5
	local scale = math.sin(half)
	return {
		x = axis.X * scale,
		y = axis.Y * scale,
		z = axis.Z * scale,
		w = math.cos(half),
	}
end

local function transform(value: CFrame): Dictionary
	return {
		position = vector3(value.Position),
		rotation = quaternionFromCFrame(value.Rotation),
	}
end

local function boundsFor(instance: Instance): Dictionary?
	if instance:IsA("Model") then
		local cf, size = instance:GetBoundingBox()
		return { transform = transform(cf), size = vector3(size) }
	elseif instance:IsA("BasePart") then
		return { transform = transform(instance.CFrame), size = vector3(instance.Size) }
	end
	return nil
end

local function describeInstance(instance: Instance, depth: number, maxDepth: number): Dictionary
	local item: Dictionary = {
		id = pathOf(instance),
		name = instance.Name,
		className = instance.ClassName,
		path = pathOf(instance),
	}
	if instance:IsA("BasePart") then
		item.transform = transform(instance.CFrame)
		item.size = vector3(instance.Size)
		item.anchored = instance.Anchored
	end
	if depth < maxDepth then
		local children = {}
		for _, child in instance:GetChildren() do
			if child:IsA("BasePart")
				or child:IsA("Bone")
				or child:IsA("Motor6D")
				or child:IsA("AnimationConstraint")
				or child:IsA("Attachment")
				or child:IsA("Humanoid")
				or child:IsA("AnimationController")
				or child:IsA("Tool")
				or child:IsA("Model")
			then
				table.insert(children, describeInstance(child, depth + 1, maxDepth))
			end
		end
		item.children = children
	end
	return item
end

local function selectedRig(): Model?
	for _, selected in Selection:Get() do
		if selected:IsA("Model") then
			return selected
		end
		local ancestor = selected:FindFirstAncestorOfClass("Model")
		if ancestor then
			return ancestor
		end
	end
	return nil
end

local function selectedRigs(): { Model }
	local rigs = {}
	local seen: { [Model]: boolean } = {}
	for _, selected in Selection:Get() do
		local rig = if selected:IsA("Model") then selected else selected:FindFirstAncestorOfClass("Model")
		if rig and not seen[rig] then
			seen[rig] = true
			table.insert(rigs, rig)
		end
	end
	if #rigs == 0 then
		for _, candidate in workspace:GetChildren() do
			if
				candidate:IsA("Model")
				and candidate:FindFirstChild("HumanoidRootPart", true)
				and (
					candidate:FindFirstChildOfClass("Humanoid")
					or candidate:FindFirstChildOfClass("AnimationController")
				)
			then
				table.insert(rigs, candidate)
			end
		end
		table.sort(rigs, function(left, right)
			local leftPosition = left:GetPivot().Position
			local rightPosition = right:GetPivot().Position
			if math.abs(leftPosition.X - rightPosition.X) > 0.001 then
				return leftPosition.X < rightPosition.X
			end
			return leftPosition.Z < rightPosition.Z
		end)
	end
	return rigs
end

local function selectedRigAt(index: number?): Model?
	local rigs = selectedRigs()
	return rigs[index or 1]
end

local function inspectRig(params: Dictionary): Dictionary
	local rig = selectedRig() or selectedRigAt(1)
	if not rig then
		error("Select a rig Model in Studio before calling inspect_rig.")
	end

	local motors = {}
	local animationConstraints = {}
	local bones = {}
	local effectors = {}
	local warnings = {}

	for _, descendant in rig:GetDescendants() do
		if descendant:IsA("Motor6D") then
			table.insert(motors, {
				name = descendant.Name,
				path = pathOf(descendant),
				parentPart = descendant.Part0 and descendant.Part0.Name or nil,
				childPart = descendant.Part1 and descendant.Part1.Name or nil,
				c0 = transform(descendant.C0),
				c1 = transform(descendant.C1),
				currentTransform = transform(descendant.Transform),
			})
		elseif descendant:IsA("AnimationConstraint") then
			table.insert(animationConstraints, {
				name = descendant.Name,
				path = pathOf(descendant),
				parentPart = descendant.Part0 and descendant.Part0.Name or nil,
				childPart = descendant.Part1 and descendant.Part1.Name or nil,
				c0 = transform(descendant.C0),
				c1 = transform(descendant.C1),
				currentTransform = transform(descendant.Transform),
				isKinematic = descendant.IsKinematic,
			})
		elseif descendant:IsA("Bone") then
			table.insert(bones, {
				name = descendant.Name,
				path = pathOf(descendant),
				parent = descendant.Parent and descendant.Parent.Name or nil,
				restTransform = transform(descendant.CFrame),
				currentTransform = transform(descendant.Transform),
			})
		elseif descendant:IsA("Attachment") then
			local lower = string.lower(descendant.Name)
			if string.find(lower, "grip") or string.find(lower, "foot") or string.find(lower, "hand") then
				table.insert(effectors, {
					name = descendant.Name,
					path = pathOf(descendant),
					worldTransform = transform(descendant.WorldCFrame),
				})
			end
		end
	end

	if #motors == 0 and #animationConstraints == 0 and #bones == 0 then
		table.insert(warnings, "The selected model has no Motor6D, AnimationConstraint, or Bone joints.")
	end

	local humanoid = rig:FindFirstChildOfClass("Humanoid")
	return {
		id = pathOf(rig),
		name = rig.Name,
		rigType = humanoid and humanoid.RigType.Name or "Custom",
		scale = humanoid and {
			hipHeight = humanoid.HipHeight,
		} or nil,
		bounds = if params.includeGeometryBounds == false then nil else boundsFor(rig),
		motors = motors,
		animationConstraints = animationConstraints,
		bones = bones,
		effectors = effectors,
		warnings = warnings,
	}
end

local easingStyles: { [string]: Enum.PoseEasingStyle } = {
	linear = Enum.PoseEasingStyle.Linear,
	constant = Enum.PoseEasingStyle.Constant,
	cubic = Enum.PoseEasingStyle.Cubic,
	cubicV2 = Enum.PoseEasingStyle.CubicV2,
	elastic = Enum.PoseEasingStyle.Elastic,
	bounce = Enum.PoseEasingStyle.Bounce,
}

local easingDirections: { [string]: Enum.PoseEasingDirection } = {
	["in"] = Enum.PoseEasingDirection.In,
	out = Enum.PoseEasingDirection.Out,
	inOut = Enum.PoseEasingDirection.InOut,
}

local priorities: { [string]: Enum.AnimationPriority } = {
	core = Enum.AnimationPriority.Core,
	idle = Enum.AnimationPriority.Idle,
	movement = Enum.AnimationPriority.Movement,
	action = Enum.AnimationPriority.Action,
	action2 = Enum.AnimationPriority.Action2,
	action3 = Enum.AnimationPriority.Action3,
	action4 = Enum.AnimationPriority.Action4,
}

local function cframeFromTransform(value: Dictionary): CFrame
	local p = value.position
	local q = value.rotation
	local x, y, z, w = q.x, q.y, q.z, q.w
	local xx, yy, zz = x * x, y * y, z * z
	local xy, xz, yz = x * y, x * z, y * z
	local wx, wy, wz = w * x, w * y, w * z
	return CFrame.fromMatrix(
		Vector3.new(p.x, p.y, p.z),
		Vector3.new(1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy)),
		Vector3.new(2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx)),
		Vector3.new(2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy))
	)
end

local function ensureFolder(parent: Instance, name: string): Folder
	local existing = parent:FindFirstChild(name)
	if existing and existing:IsA("Folder") then
		return existing
	end
	local folder = Instance.new("Folder")
	folder.Name = name
	folder.Parent = parent
	return folder
end

local function exactKeyAt(track: Dictionary, time: number): Dictionary?
	for _, key in track.keys do
		if math.abs(key.time - time) < 0.000001 then
			return key
		end
	end
	return nil
end

local function createSequence(draft: Dictionary, rig: Model): KeyframeSequence
	local sequence = Instance.new("KeyframeSequence")
	sequence.Name = draft.name
	sequence.Loop = draft.looped
	sequence.Priority = priorities[draft.priority] or Enum.AnimationPriority.Action
	if draft.authoredHipHeight then
		sequence.AuthoredHipHeight = draft.authoredHipHeight
	end
	sequence:SetAttribute("MotionDirectorVersion", 1)
	sequence:SetAttribute("Intent", draft.metadata and draft.metadata.intent or "")
	sequence:SetAttribute("FramesPerSecond", draft.framesPerSecond)
	local styles = if draft.metadata and type(draft.metadata.style) == "table"
		then draft.metadata.style
		else {}
	sequence:SetAttribute("MotionDirectorStyles", HttpService:JSONEncode(styles))
	sequence:SetAttribute(
		"MotionDirectorHumanReviewRequired",
		table.find(styles, "human-review-required") ~= nil
	)
	sequence:SetAttribute("MotionDirectorHumanApproved", false)

	local parentByJoint: { [string]: string } = {}
	for _, descendant in rig:GetDescendants() do
		if
			(descendant:IsA("Motor6D") or descendant:IsA("AnimationConstraint"))
			and descendant.Part0
			and descendant.Part1
		then
			parentByJoint[descendant.Part1.Name] = descendant.Part0.Name
		end
	end

	local uniqueTimes: { [number]: boolean } = {}
	for _, track in draft.tracks do
		for _, key in track.keys do
			uniqueTimes[key.time] = true
		end
	end
	local times = {}
	for time in uniqueTimes do
		table.insert(times, time)
	end
	table.sort(times)

	for _, time in times do
		local keyframe = Instance.new("Keyframe")
		keyframe.Time = time
		keyframe.Name = string.format("MD_%0.3f", time)

		local poses: { [string]: Pose } = {}
		local function poseFor(jointName: string): Pose
			if poses[jointName] then
				return poses[jointName]
			end
			local pose = Instance.new("Pose")
			pose.Name = jointName
			pose.Weight = 0
			poses[jointName] = pose
			local parentName = parentByJoint[jointName]
			if parentName then
				poseFor(parentName):AddSubPose(pose)
			else
				keyframe:AddPose(pose)
			end
			return pose
		end

		for _, track in draft.tracks do
			local key = exactKeyAt(track, time)
			if key then
				local pose = poseFor(track.joint)
				local authored = cframeFromTransform(key.transform)
				if track.space == "parent" then
					local animationJoint = nil
					for _, descendant in rig:GetDescendants() do
						if (descendant:IsA("Motor6D") or descendant:IsA("AnimationConstraint"))
							and descendant.Part1
							and descendant.Part1.Name == track.joint
						then
							animationJoint = descendant
							break
						end
					end
					if not animationJoint then
						error(
							"No Motor6D or AnimationConstraint found for parent-space track: "
								.. tostring(track.joint)
						)
					end
					local basis = animationJoint.C0.Rotation
					local mappedPosition = basis:VectorToObjectSpace(authored.Position)
					local mappedRotation = basis:Inverse() * authored.Rotation * basis
					pose.CFrame = CFrame.new(mappedPosition) * mappedRotation
				elseif track.space == "character" or track.space == "world" then
					error(
						"Track space "
							.. tostring(track.space)
							.. " requires the hierarchical solver and cannot be baked directly."
					)
				else
					pose.CFrame = authored
				end
				pose.Weight = key.weight or 1
				pose.EasingStyle = easingStyles[key.easing.style] or Enum.PoseEasingStyle.Cubic
				pose.EasingDirection = easingDirections[key.easing.direction] or Enum.PoseEasingDirection.InOut
			end
		end
		sequence:AddKeyframe(keyframe)
	end

	for _, beat in draft.beats do
		local marker = Instance.new("StringValue")
		marker.Name = "Beat_" .. beat.id
		marker.Value = HttpService:JSONEncode(beat)
		marker.Parent = sequence
	end
	for _, contact in draft.contacts do
		local marker = Instance.new("StringValue")
		marker.Name = "Contact_" .. contact.id
		marker.Value = HttpService:JSONEncode(contact)
		marker.Parent = sequence
	end

	return sequence
end

local function withRecording(name: string, callback: () -> any): any
	local recording = ChangeHistoryService:TryBeginRecording(name)
	local ok, result = pcall(callback)
	if recording then
		ChangeHistoryService:FinishRecording(
			recording,
			if ok then Enum.FinishRecordingOperation.Commit else Enum.FinishRecordingOperation.Cancel
		)
	end
	if not ok then
		error(result)
	end
	return result
end

local handlers: { [string]: (Dictionary) -> any } = {}

handlers["system.capabilities"] = function(_params)
	return {
		pluginVersion = PLUGIN_VERSION,
		parentSpaceBakerVersion = 6,
		animationAnalyzerVersion = 1,
		autoCreateAnimator = true,
		synchronizedMultiRig = true,
		isRunning = RunService:IsRunning(),
		animationJointTypes = { "Motor6D", "AnimationConstraint", "Bone" },
		rigProfiles = { "R6", "R15", "Custom" },
	}
end

handlers["scene.getSelection"] = function(params)
	local maxDepth = if params.includeDescendants == false then 0 else params.maxDepth or 6
	local items = {}
	for _, item in Selection:Get() do
		table.insert(items, describeInstance(item, 0, maxDepth))
	end
	return { count = #items, items = items }
end

handlers["rig.inspect"] = inspectRig

local analyzerContext = {
	pathOf = pathOf,
	selectedRig = selectedRig,
}

handlers["analysis.listAnimations"] = function(params)
	return AnimationAnalyzer.list(params, analyzerContext)
end

handlers["analysis.inspectAnimation"] = function(params)
	return AnimationAnalyzer.inspect(params, analyzerContext)
end

handlers["analysis.compareAnimations"] = function(params)
	return AnimationAnalyzer.compare(params, analyzerContext)
end

handlers["scene.createTestRig"] = function(params)
	return withRecording("Create Motion Director test rig", function()
		local existing = workspace:FindFirstChild(params.name)
		if existing then
			existing:Destroy()
		end

		local origin = Vector3.new(params.position.x, params.position.y, params.position.z)
		local rig = Instance.new("Model")
		rig.Name = params.name

		local function part(name: string, size: Vector3, offset: Vector3, color: Color3): Part
			local item = Instance.new("Part")
			item.Name = name
			item.Size = size
			item.CFrame = CFrame.new(origin + offset)
			item.Color = color
			item.Material = Enum.Material.SmoothPlastic
			item.CanCollide = false
			item.Anchored = name == "HumanoidRootPart"
			item.Parent = rig
			return item
		end

		local rootPart = part("HumanoidRootPart", Vector3.new(1.4, 1.2, 0.8), Vector3.new(0, 0, 0), Color3.fromRGB(35, 38, 48))
		rootPart.Transparency = 0.65
		local lowerTorso = part("LowerTorso", Vector3.new(2, 1.2, 1), Vector3.new(0, 0.8, 0), Color3.fromRGB(56, 95, 160))
		local upperTorso = part("UpperTorso", Vector3.new(2.5, 1.6, 1.1), Vector3.new(0, 2.2, 0), Color3.fromRGB(63, 112, 190))
		local head = part("Head", Vector3.new(1.35, 1.35, 1.35), Vector3.new(0, 3.75, 0), Color3.fromRGB(229, 187, 143))

		local leftUpperArm = part("LeftUpperArm", Vector3.new(0.75, 1.55, 0.75), Vector3.new(-1.65, 2.25, 0), Color3.fromRGB(63, 112, 190))
		local leftLowerArm = part("LeftLowerArm", Vector3.new(0.65, 1.45, 0.65), Vector3.new(-1.65, 0.78, 0), Color3.fromRGB(229, 187, 143))
		local leftHand = part("LeftHand", Vector3.new(0.72, 0.72, 0.72), Vector3.new(-1.65, -0.25, 0), Color3.fromRGB(229, 187, 143))
		local rightUpperArm = part("RightUpperArm", Vector3.new(0.75, 1.55, 0.75), Vector3.new(1.65, 2.25, 0), Color3.fromRGB(63, 112, 190))
		local rightLowerArm = part("RightLowerArm", Vector3.new(0.65, 1.45, 0.65), Vector3.new(1.65, 0.78, 0), Color3.fromRGB(229, 187, 143))
		local rightHand = part("RightHand", Vector3.new(0.72, 0.72, 0.72), Vector3.new(1.65, -0.25, 0), Color3.fromRGB(229, 187, 143))

		local leftUpperLeg = part("LeftUpperLeg", Vector3.new(0.9, 1.65, 0.9), Vector3.new(-0.6, -1.3, 0), Color3.fromRGB(42, 53, 79))
		local leftLowerLeg = part("LeftLowerLeg", Vector3.new(0.8, 1.55, 0.8), Vector3.new(-0.6, -2.85, 0), Color3.fromRGB(47, 59, 88))
		local leftFoot = part("LeftFoot", Vector3.new(0.9, 0.55, 1.4), Vector3.new(-0.6, -3.9, -0.25), Color3.fromRGB(28, 30, 37))
		local rightUpperLeg = part("RightUpperLeg", Vector3.new(0.9, 1.65, 0.9), Vector3.new(0.6, -1.3, 0), Color3.fromRGB(42, 53, 79))
		local rightLowerLeg = part("RightLowerLeg", Vector3.new(0.8, 1.55, 0.8), Vector3.new(0.6, -2.85, 0), Color3.fromRGB(47, 59, 88))
		local rightFoot = part("RightFoot", Vector3.new(0.9, 0.55, 1.4), Vector3.new(0.6, -3.9, -0.25), Color3.fromRGB(28, 30, 37))

		local function connect(name: string, parentPart: BasePart, childPart: BasePart)
			local motor = Instance.new("Motor6D")
			motor.Name = name
			motor.Part0 = parentPart
			motor.Part1 = childPart
			motor.C0 = parentPart.CFrame:ToObjectSpace(childPart.CFrame)
			motor.C1 = CFrame.identity
			motor.Parent = parentPart
		end

		connect("Root", rootPart, lowerTorso)
		connect("Waist", lowerTorso, upperTorso)
		connect("Neck", upperTorso, head)
		connect("LeftShoulder", upperTorso, leftUpperArm)
		connect("LeftElbow", leftUpperArm, leftLowerArm)
		connect("LeftWrist", leftLowerArm, leftHand)
		connect("RightShoulder", upperTorso, rightUpperArm)
		connect("RightElbow", rightUpperArm, rightLowerArm)
		connect("RightWrist", rightLowerArm, rightHand)
		connect("LeftHip", lowerTorso, leftUpperLeg)
		connect("LeftKnee", leftUpperLeg, leftLowerLeg)
		connect("LeftAnkle", leftLowerLeg, leftFoot)
		connect("RightHip", lowerTorso, rightUpperLeg)
		connect("RightKnee", rightUpperLeg, rightLowerLeg)
		connect("RightAnkle", rightLowerLeg, rightFoot)

		local controller = Instance.new("AnimationController")
		controller.Name = "AnimationController"
		controller.Parent = rig
		local animator = Instance.new("Animator")
		animator.Parent = controller

		rig.PrimaryPart = rootPart
		rig:SetAttribute("MotionDirectorTestRig", true)
		rig.Parent = workspace
		Selection:Set({ rig })

		return {
			id = pathOf(rig),
			name = rig.Name,
			partCount = 16,
			jointCount = 15,
			selected = true,
		}
	end)
end

handlers["animation.stageDraft"] = function(params)
	return withRecording("Stage Motion Director draft", function()
		local rig = selectedRigAt(params.selectionIndex)
		if not rig then
			error("Select the target rig before staging an animation.")
		end
		local drafts = ensureFolder(ServerStorage, "MotionDirectorDrafts")
		local transactionId = HttpService:GenerateGUID(false)
		local transaction = Instance.new("Folder")
		transaction.Name = transactionId
		transaction:SetAttribute("TransactionName", params.transactionName)
		transaction:SetAttribute("RigPath", pathOf(rig))
		transaction:SetAttribute("CreatedAt", os.time())
		transaction.Parent = drafts
		local targetRig = Instance.new("ObjectValue")
		targetRig.Name = "TargetRig"
		targetRig.Value = rig
		targetRig.Parent = transaction
		local sequence = createSequence(params.draft, rig)
		sequence.Parent = transaction
		return {
			transactionId = transactionId,
			sequencePath = pathOf(sequence),
			keyframeCount = #sequence:GetKeyframes(),
			status = "staged",
		}
	end)
end

handlers["animation.stageMultiRig"] = function(params)
	return withRecording("Stage synchronized multi-rig animation", function()
		local rigs = selectedRigs()
		if #rigs < 2 then
			error("Select at least two rig Models before staging a synchronized animation.")
		end
		local drafts = ensureFolder(ServerStorage, "MotionDirectorDrafts")
		local transactionId = HttpService:GenerateGUID(false)
		local transaction = Instance.new("Folder")
		transaction.Name = transactionId
		transaction:SetAttribute("TransactionName", params.transactionName)
		transaction:SetAttribute("MultiRig", true)
		transaction:SetAttribute("ActorCount", #params.actors)
		transaction:SetAttribute("CreatedAt", os.time())
		transaction.Parent = drafts

		if params.layout == "faceOff" and #params.actors == 2 then
			local firstRig = rigs[params.actors[1].selectionIndex]
			local secondRig = rigs[params.actors[2].selectionIndex]
			if firstRig and secondRig then
				local basePivot = firstRig:GetPivot()
				local spacing = params.actorSpacing or 8
				secondRig:PivotTo(
					basePivot * CFrame.new(0, 0, -spacing) * CFrame.Angles(0, math.pi, 0)
				)
			end
		end

		local actors = {}
		for _, actor in params.actors do
			local rig = rigs[actor.selectionIndex]
			if not rig then
				error("No selected rig exists at selection index " .. tostring(actor.selectionIndex))
			end
			local actorFolder = Instance.new("Folder")
			actorFolder.Name = actor.actorId
			actorFolder:SetAttribute("SelectionIndex", actor.selectionIndex)
			actorFolder.Parent = transaction
			local targetRig = Instance.new("ObjectValue")
			targetRig.Name = "TargetRig"
			targetRig.Value = rig
			targetRig.Parent = actorFolder
			local sequence = createSequence(actor.draft, rig)
			sequence.Parent = actorFolder
			table.insert(actors, {
				actorId = actor.actorId,
				rigName = rig.Name,
				sequencePath = pathOf(sequence),
				keyframeCount = #sequence:GetKeyframes(),
			})
		end
		return {
			transactionId = transactionId,
			actors = actors,
			status = "staged",
		}
	end)
end

handlers["animation.commitMultiRig"] = function(params)
	return withRecording("Commit synchronized multi-rig animation", function()
		local drafts = ServerStorage:FindFirstChild("MotionDirectorDrafts")
		local transaction = drafts and drafts:FindFirstChild(params.transactionId)
		if not transaction or transaction:GetAttribute("MultiRig") ~= true then
			error("Multi-rig draft transaction not found: " .. tostring(params.transactionId))
		end
		local destinationRoot = ensureFolder(ReplicatedStorage, "MotionDirectorAnimations")
		local existing = destinationRoot:FindFirstChild(params.destinationName)
		if existing then
			existing:Destroy()
		end
		local encounter = Instance.new("Folder")
		encounter.Name = params.destinationName
		encounter:SetAttribute("SynchronizedMultiRig", true)
		encounter:SetAttribute("CommittedFromTransaction", params.transactionId)
		encounter.Parent = destinationRoot
		local actors = {}
		for _, actorFolder in transaction:GetChildren() do
			if actorFolder:IsA("Folder") then
				local sequence = actorFolder:FindFirstChildOfClass("KeyframeSequence")
				if sequence then
					local committed = sequence:Clone()
					committed.Name = actorFolder.Name
					committed.Parent = encounter
					table.insert(actors, {
						actorId = actorFolder.Name,
						path = pathOf(committed),
						keyframeCount = #committed:GetKeyframes(),
					})
				end
			end
		end
		transaction:Destroy()
		return {
			status = "committed",
			path = pathOf(encounter),
			actors = actors,
		}
	end)
end

handlers["animation.commitDraft"] = function(params)
	return withRecording("Commit Motion Director animation", function()
		local drafts = ServerStorage:FindFirstChild("MotionDirectorDrafts")
		local transaction = drafts and drafts:FindFirstChild(params.transactionId)
		if not transaction then
			error("Draft transaction not found: " .. tostring(params.transactionId))
		end
		local sequence = transaction:FindFirstChildOfClass("KeyframeSequence")
		if not sequence then
			error("Draft transaction contains no KeyframeSequence.")
		end
		local destination = ensureFolder(ReplicatedStorage, "MotionDirectorAnimations")
		for _, existing in destination:GetChildren() do
			if existing.Name == params.destinationName then
				existing:Destroy()
			end
		end
		local committed = sequence:Clone()
		committed.Name = params.destinationName
		committed:SetAttribute("CommittedFromTransaction", params.transactionId)
		committed.Parent = destination
		transaction:Destroy()
		return {
			status = "committed",
			path = pathOf(committed),
			keyframeCount = #committed:GetKeyframes(),
		}
	end)
end

local function stopActivePreviews()
	for _, activeTrack in activePreviewTracks do
		activeTrack:Stop(0)
		activeTrack:Destroy()
	end
	table.clear(activePreviewTracks)
end

local function loadSequenceTrack(
	sequence: KeyframeSequence,
	rig: Model,
	params: Dictionary
): AnimationTrack
	if not rig then
		error("Select the animation's target rig before previewing.")
	end
	local animationController = rig:FindFirstChildOfClass("AnimationController")
	local humanoid = rig:FindFirstChildOfClass("Humanoid")
	local animator = if animationController
		then animationController:FindFirstChildOfClass("Animator")
		else if humanoid then humanoid:FindFirstChildOfClass("Animator") else nil
	if not animator then
		local animationHost = animationController or humanoid
		if not animationHost then
			error("The selected rig has no Humanoid or AnimationController.")
		end
		animator = Instance.new("Animator")
		animator.Parent = animationHost
	end
	local temporaryId = KeyframeSequenceProvider:RegisterKeyframeSequence(sequence)
	local animation = Instance.new("Animation")
	animation.Name = "MotionDirectorPreview"
	animation.AnimationId = temporaryId
	local track = animator:LoadAnimation(animation)
	animation:Destroy()
	track.Looped = params.looped == true
	table.insert(activePreviewTracks, track)
	return track
end

local function playSequence(sequence: KeyframeSequence, params: Dictionary, targetRig: Model?): Dictionary
	stopActivePreviews()
	local rig = targetRig or selectedRigAt(params.selectionIndex)
	if not rig then
		error("Select the animation's target rig before previewing.")
	end
	local track = loadSequenceTrack(sequence, rig, params)
	track:Play(0.12, 1, params.playbackSpeed or 1)
	return {
		status = "playing",
		sequence = sequence.Name,
		length = track.Length,
		speed = params.playbackSpeed or 1,
		looped = track.Looped,
	}
end

handlers["animation.previewMultiRig"] = function(params)
	local drafts = ServerStorage:FindFirstChild("MotionDirectorDrafts")
	local transaction = drafts and drafts:FindFirstChild(params.transactionId)
	if not transaction or transaction:GetAttribute("MultiRig") ~= true then
		error("Multi-rig draft transaction not found: " .. tostring(params.transactionId))
	end
	stopActivePreviews()
	local loaded = {}
	for _, actorFolder in transaction:GetChildren() do
		if actorFolder:IsA("Folder") then
			local sequence = actorFolder:FindFirstChildOfClass("KeyframeSequence")
			local targetRigValue = actorFolder:FindFirstChild("TargetRig")
			local targetRig = if targetRigValue and targetRigValue:IsA("ObjectValue")
				then targetRigValue.Value
				else nil
			if sequence and targetRig and targetRig:IsA("Model") then
				local track = loadSequenceTrack(sequence, targetRig, params)
				table.insert(loaded, {
					actorId = actorFolder.Name,
					track = track,
					sequence = sequence.Name,
				})
			end
		end
	end
	if #loaded < 2 then
		error("A synchronized preview requires at least two valid actor sequences.")
	end
	for _, actor in loaded do
		actor.track:Play(0.08, 1, params.playbackSpeed or 1)
		actor.track.TimePosition = 0
	end
	local actors = {}
	for _, actor in loaded do
		table.insert(actors, {
			actorId = actor.actorId,
			sequence = actor.sequence,
			length = actor.track.Length,
		})
	end
	return {
		status = "playing",
		transactionId = params.transactionId,
		looped = params.looped == true,
		speed = params.playbackSpeed or 1,
		actors = actors,
	}
end

handlers["animation.previewDraft"] = function(params)
	local drafts = ServerStorage:FindFirstChild("MotionDirectorDrafts")
	local transaction = drafts and drafts:FindFirstChild(params.transactionId)
	if not transaction then
		error("Draft transaction not found: " .. tostring(params.transactionId))
	end
	local sequence = transaction:FindFirstChildOfClass("KeyframeSequence")
	if not sequence then
		error("Draft transaction contains no KeyframeSequence.")
	end
	local targetRigValue = transaction:FindFirstChild("TargetRig")
	local targetRig = if targetRigValue and targetRigValue:IsA("ObjectValue")
		then targetRigValue.Value :: Model?
		else nil
	local result = playSequence(sequence, params, targetRig)
	result.transactionId = params.transactionId
	return result
end

handlers["animation.previewCommitted"] = function(params)
	local folder = ReplicatedStorage:FindFirstChild("MotionDirectorAnimations")
	local sequence = folder and folder:FindFirstChild(params.animationName)
	if not sequence or not sequence:IsA("KeyframeSequence") then
		error("Committed animation not found: " .. tostring(params.animationName))
	end
	return playSequence(sequence, params)
end

handlers["animation.attachCommittedToAnimSaves"] = function(params)
	return withRecording("Attach Motion Director animations to selected rig", function()
		local rig = selectedRig()
		if not rig then
			error("Select the target rig Model before attaching AnimSaves.")
		end
		local committedRoot = ReplicatedStorage:FindFirstChild("MotionDirectorAnimations")
		if not committedRoot then
			error("ReplicatedStorage.MotionDirectorAnimations was not found.")
		end

		local animSavesReference = rig:FindFirstChild("AnimSaves")
		local destination = nil
		if animSavesReference and animSavesReference:IsA("ObjectValue") then
			destination = animSavesReference.Value
		elseif animSavesReference and (animSavesReference:IsA("Folder") or animSavesReference:IsA("Model")) then
			destination = animSavesReference
		else
			if animSavesReference then
				animSavesReference:Destroy()
			end
			local saveRoot = ensureFolder(ServerStorage, "RBX_ANIMSAVES")
			local rigSaveFolder = Instance.new("Folder")
			rigSaveFolder.Name = rig.Name
			rigSaveFolder.Parent = saveRoot
			local reference = Instance.new("ObjectValue")
			reference.Name = "AnimSaves"
			reference.Value = rigSaveFolder
			reference.Parent = rig
			animSavesReference = reference
			destination = rigSaveFolder
		end
		if not destination then
			error("The selected rig's AnimSaves reference has no destination.")
		end

		local prefix = params.namePrefix or ""
		local attached = {}
		for _, source in committedRoot:GetChildren() do
			if source:IsA("KeyframeSequence") and string.sub(source.Name, 1, #prefix) == prefix then
				for _, existing in destination:GetChildren() do
					if existing.Name == source.Name then
						existing:Destroy()
					end
				end
				local saved = source:Clone()
				saved.Parent = destination
				if animSavesReference and animSavesReference:IsA("ObjectValue") then
					for _, legacyExisting in animSavesReference:GetChildren() do
						if legacyExisting.Name == source.Name then
							legacyExisting:Destroy()
						end
					end
					local compatibilitySave = source:Clone()
					compatibilitySave:SetAttribute("MotionDirectorCompatibilityMirror", true)
					compatibilitySave.Parent = animSavesReference
				end
				table.insert(attached, {
					name = saved.Name,
					keyframeCount = #saved:GetKeyframes(),
					path = pathOf(saved),
				})
			end
		end
		table.sort(attached, function(left, right)
			return left.name < right.name
		end)
		if #attached == 0 then
			error("No committed animations matched prefix: " .. tostring(prefix))
		end
		return {
			status = "attached",
			rig = pathOf(rig),
			animSaves = pathOf(destination),
			count = #attached,
			animations = attached,
		}
	end)
end

handlers["animation.finalizeHumanReview"] = function(params)
	return withRecording("Finalize Motion Director human review", function()
		local rig = selectedRig()
		if not rig then
			error("Select the target rig Model before finalizing human review.")
		end
		local approvedNames = params.approvedNames
		if type(approvedNames) ~= "table" or #approvedNames < 1 or #approvedNames > 10 then
			error("Human review must approve between 1 and 10 animations.")
		end
		local reviewPrefix = params.reviewPrefix or "MD_REVIEW_R6_"
		local approvedPrefix = params.approvedPrefix or "MD_APPROVED_R6_"
		local committedRoot = ReplicatedStorage:FindFirstChild("MotionDirectorAnimations")
		if not committedRoot then
			error("ReplicatedStorage.MotionDirectorAnimations was not found.")
		end
		local animSavesReference = rig:FindFirstChild("AnimSaves")
		local destination = nil
		if animSavesReference and animSavesReference:IsA("ObjectValue") then
			destination = animSavesReference.Value
		elseif animSavesReference and (animSavesReference:IsA("Folder") or animSavesReference:IsA("Model")) then
			destination = animSavesReference
		end
		if not destination then
			error("The selected rig has no valid AnimSaves destination.")
		end

		local approvedSources = {}
		local seen = {}
		for _, sourceName in approvedNames do
			if type(sourceName) ~= "string"
				or string.sub(sourceName, 1, #reviewPrefix) ~= reviewPrefix
			then
				error("Approved animation is outside the review queue: " .. tostring(sourceName))
			end
			if seen[sourceName] then
				error("Approved animation was listed more than once: " .. sourceName)
			end
			seen[sourceName] = true
			local source = committedRoot:FindFirstChild(sourceName)
			if not source or not source:IsA("KeyframeSequence") then
				error("Approved review animation was not found: " .. sourceName)
			end
			table.insert(approvedSources, source)
		end

		for _, parent in { committedRoot, destination } do
			for _, child in parent:GetChildren() do
				if child:IsA("KeyframeSequence")
					and string.sub(child.Name, 1, #approvedPrefix) == approvedPrefix
				then
					child:Destroy()
				end
			end
		end
		if animSavesReference and animSavesReference:IsA("ObjectValue") then
			for _, child in animSavesReference:GetChildren() do
				if child:IsA("KeyframeSequence")
					and string.sub(child.Name, 1, #approvedPrefix) == approvedPrefix
				then
					child:Destroy()
				end
			end
		end

		local approved = {}
		for index, source in approvedSources do
			local suffix = string.sub(source.Name, #reviewPrefix + 1)
			suffix = string.gsub(suffix, "[^%w_%-]", "")
			if suffix == "" then
				suffix = "Selection"
			end
			local finalName = approvedPrefix .. string.format("%02d_", index) .. suffix
			local committed = source:Clone()
			committed.Name = finalName
			committed:SetAttribute("MotionDirectorHumanApproved", true)
			committed:SetAttribute("ApprovedFromReview", source.Name)
			committed.Parent = committedRoot

			local saved = committed:Clone()
			saved.Parent = destination
			if animSavesReference and animSavesReference:IsA("ObjectValue") then
				local compatibilitySave = committed:Clone()
				compatibilitySave:SetAttribute("MotionDirectorCompatibilityMirror", true)
				compatibilitySave.Parent = animSavesReference
			end
			table.insert(approved, {
				name = finalName,
				source = source.Name,
				path = pathOf(saved),
				keyframeCount = #saved:GetKeyframes(),
			})
		end

		local removedReviewCount = 0
		for _, parent in { committedRoot, destination } do
			for _, child in parent:GetChildren() do
				if child:IsA("KeyframeSequence")
					and string.sub(child.Name, 1, #reviewPrefix) == reviewPrefix
				then
					child:Destroy()
					removedReviewCount += 1
				end
			end
		end
		if animSavesReference and animSavesReference:IsA("ObjectValue") then
			for _, child in animSavesReference:GetChildren() do
				if child:IsA("KeyframeSequence")
					and string.sub(child.Name, 1, #reviewPrefix) == reviewPrefix
				then
					child:Destroy()
					removedReviewCount += 1
				end
			end
		end

		return {
			status = "human-review-finalized",
			rig = pathOf(rig),
			approvedCount = #approved,
			removedReviewCount = removedReviewCount,
			approved = approved,
		}
	end)
end

local function resetRigAnimationPose(rig: Model)
	local humanoid = rig:FindFirstChildOfClass("Humanoid")
	local controller = rig:FindFirstChildOfClass("AnimationController")
	local animator = if humanoid
		then humanoid:FindFirstChildOfClass("Animator")
		else if controller then controller:FindFirstChildOfClass("Animator") else nil
	if animator then
		for _, track in animator:GetPlayingAnimationTracks() do
			track:Stop(0)
		end
		animator:StepAnimations(0)
	end
	for _, descendant in rig:GetDescendants() do
		if descendant:IsA("Motor6D") or descendant:IsA("AnimationConstraint") then
			descendant.Transform = CFrame.identity
		elseif descendant:IsA("Bone") then
			descendant.Transform = CFrame.identity
		end
	end
end

local function sequenceDuration(sequence: KeyframeSequence): number
	local duration = 0
	for _, keyframe in sequence:GetKeyframes() do
		duration = math.max(duration, keyframe.Time)
	end
	return duration
end

local function applyKeyframePose(rig: Model, keyframe: Keyframe): number
	local posesByName: { [string]: Pose } = {}
	for _, descendant in keyframe:GetDescendants() do
		if descendant:IsA("Pose") then
			posesByName[descendant.Name] = descendant
		end
	end

	local applied = 0
	for _, descendant in rig:GetDescendants() do
		if descendant:IsA("Motor6D") or descendant:IsA("AnimationConstraint") then
			local child = descendant.Part1
			local pose = if child then posesByName[child.Name] else nil
			if pose then
				descendant.Transform = pose.CFrame
				applied += 1
			end
		elseif descendant:IsA("Bone") then
			local pose = posesByName[descendant.Name]
			if pose then
				descendant.Transform = pose.CFrame
				applied += 1
			end
		end
	end
	return applied
end

handlers["animation.poseCommittedAtTime"] = function(params)
	return withRecording("Pose Motion Director review frame", function()
		local rig = selectedRig()
		if not rig then
			error("Select the target rig Model before posing a review frame.")
		end
		local folder = ReplicatedStorage:FindFirstChild("MotionDirectorAnimations")
		local sequence = folder and folder:FindFirstChild(params.animationName)
		if not sequence or not sequence:IsA("KeyframeSequence") then
			error("Committed animation not found: " .. tostring(params.animationName))
		end

		resetRigAnimationPose(rig)
		local duration = sequenceDuration(sequence)
		local normalizedTime = math.clamp(params.normalizedTime or 0, 0, 1)
		local requestedTime = duration * normalizedTime
		local nearest = nil
		local nearestDistance = math.huge
		for _, keyframe in sequence:GetKeyframes() do
			local distance = math.abs(keyframe.Time - requestedTime)
			if distance < nearestDistance then
				nearest = keyframe
				nearestDistance = distance
			end
		end
		if not nearest then
			error("Committed animation has no keyframes: " .. sequence.Name)
		end
		local applied = applyKeyframePose(rig, nearest)
		return {
			status = "posed",
			rig = pathOf(rig),
			sequence = sequence.Name,
			normalizedTime = normalizedTime,
			requestedTime = requestedTime,
			actualTime = nearest.Time,
			keyframe = nearest.Name,
			appliedJoints = applied,
		}
	end)
end

handlers["animation.resetSelectedRigPose"] = function(_params)
	return withRecording("Reset Motion Director review pose", function()
		local rig = selectedRig()
		if not rig then
			error("Select the target rig Model before resetting its pose.")
		end
		resetRigAnimationPose(rig)
		return {
			status = "reset",
			rig = pathOf(rig),
		}
	end)
end

local function retimeSequence(sequence: KeyframeSequence, factor: number)
	for _, keyframe in sequence:GetKeyframes() do
		keyframe.Time *= factor
	end
end

local function reverseSequence(sequence: KeyframeSequence)
	local duration = sequenceDuration(sequence)
	for _, keyframe in sequence:GetKeyframes() do
		keyframe.Time = duration - keyframe.Time
	end
end

local function offsetSequencePose(
	sequence: KeyframeSequence,
	poseName: string,
	xDegrees: number,
	yDegrees: number,
	zDegrees: number
)
	local offset = CFrame.Angles(
		math.rad(xDegrees),
		math.rad(yDegrees),
		math.rad(zDegrees)
	)
	for _, descendant in sequence:GetDescendants() do
		if descendant:IsA("Pose") and descendant.Name == poseName then
			descendant.CFrame = descendant.CFrame * offset
		end
	end
end

handlers["animation.rebuildParkourV2"] = function(_params)
	return withRecording("Rebuild calibrated R15 parkour suite V2", function()
		local rig = selectedRig() or selectedRigAt(1)
		if not rig then
			error("No R15 rig was found in Workspace.")
		end
		local humanoid = rig:FindFirstChildOfClass("Humanoid")
		if not humanoid or humanoid.RigType ~= Enum.HumanoidRigType.R15 then
			error("The target rig must be R15.")
		end
		resetRigAnimationPose(rig)

		local sourceIds = {
			walk = "rbxassetid://507777826",
			run = "rbxassetid://507767714",
			jump = "rbxassetid://507765000",
			fall = "rbxassetid://507767968",
			climb = "rbxassetid://507765644",
		}
		local sources = {}
		for sourceName, assetId in sourceIds do
			local ok, loaded = pcall(function()
				return KeyframeSequenceProvider:GetKeyframeSequenceAsync(assetId)
			end)
			if not ok or not loaded then
				error("Unable to load official R15 reference clip " .. sourceName .. ": " .. tostring(loaded))
			end
			sources[sourceName] = loaded
		end

		local function derived(
			sourceName: string,
			name: string,
			looped: boolean,
			priority: Enum.AnimationPriority,
			timeScale: number,
			offsets: { { string | number } }?,
			reversed: boolean?
		): KeyframeSequence
			local sequence = sources[sourceName]:Clone()
			sequence.Name = name
			sequence.Loop = looped
			sequence.Priority = priority
			if reversed then
				reverseSequence(sequence)
			end
			retimeSequence(sequence, timeScale)
			if offsets then
				for _, values in offsets do
					offsetSequencePose(
						sequence,
						values[1] :: string,
						values[2] :: number,
						values[3] :: number,
						values[4] :: number
					)
				end
			end
			sequence:SetAttribute("MotionDirectorVersion", 2)
			sequence:SetAttribute("CalibratedFromOfficialR15", sourceIds[sourceName])
			sequence:SetAttribute("RootMotionPolicy", "InPlace")
			local finalKeyframe = nil
			for _, keyframe in sequence:GetKeyframes() do
				if not finalKeyframe or keyframe.Time > finalKeyframe.Time then
					finalKeyframe = keyframe
				end
			end
			if finalKeyframe then
				finalKeyframe.Name = "End"
			end
			return sequence
		end

		local movement = Enum.AnimationPriority.Movement
		local action = Enum.AnimationPriority.Action
		local action2 = Enum.AnimationPriority.Action2
		local definitions = {
			derived("walk", "MD_ParkourV2_Walk", true, movement, 1, nil),
			derived("run", "MD_ParkourV2_Run", true, movement, 1, nil),
			derived("run", "MD_ParkourV2_Sprint", true, movement, 0.72, {
				{ "LowerTorso", 7, 0, 0 }, { "UpperTorso", -4, 0, 0 },
			}),
			derived("run", "MD_ParkourV2_DashForward", false, action2, 0.46, {
				{ "LowerTorso", 15, 0, 0 }, { "UpperTorso", -8, 0, 0 },
			}),
			derived("run", "MD_ParkourV2_DashLeft", false, action2, 0.5, {
				{ "LowerTorso", 6, 0, -16 }, { "UpperTorso", -3, 0, 7 },
			}),
			derived("run", "MD_ParkourV2_DashRight", false, action2, 0.5, {
				{ "LowerTorso", 6, 0, 16 }, { "UpperTorso", -3, 0, -7 },
			}),
			derived("run", "MD_ParkourV2_WallRunLeft", true, movement, 0.92, {
				{ "LowerTorso", 5, 0, -18 }, { "UpperTorso", -2, 0, 8 },
				{ "LeftUpperArm", 12, 0, -8 },
			}),
			derived("run", "MD_ParkourV2_WallRunRight", true, movement, 0.92, {
				{ "LowerTorso", 5, 0, 18 }, { "UpperTorso", -2, 0, -8 },
				{ "RightUpperArm", 12, 0, 8 },
			}),
			derived("jump", "MD_ParkourV2_JumpStart", false, action, 1, nil),
			derived("fall", "MD_ParkourV2_FallLoop", true, movement, 1, nil),
			derived("jump", "MD_ParkourV2_Land", false, action, 0.68, {
				{ "LowerTorso", 8, 0, 0 }, { "UpperTorso", -5, 0, 0 },
			}, true),
			derived("climb", "MD_ParkourV2_ClimbLoop", true, movement, 1, nil),
			derived("jump", "MD_ParkourV2_Vault", false, action2, 0.82, {
				{ "LowerTorso", 10, 0, 0 },
				{ "RightUpperArm", 18, 0, 0 }, { "LeftUpperArm", 18, 0, 0 },
			}),
			derived("run", "MD_ParkourV2_Slide", false, action2, 0.82, {
				{ "LowerTorso", 24, 0, -5 }, { "UpperTorso", -12, 0, 4 },
				{ "RightUpperLeg", 18, 0, 0 }, { "LeftLowerLeg", -22, 0, 0 },
			}),
			derived("climb", "MD_ParkourV2_LedgeGrab", false, action2, 0.42, {
				{ "LowerTorso", -6, 0, 0 }, { "UpperTorso", 5, 0, 0 },
			}),
			derived("climb", "MD_ParkourV2_Mantle", false, action2, 0.72, {
				{ "LowerTorso", 9, 0, 0 }, { "UpperTorso", -6, 0, 0 },
			}),
		}

		local destination = ensureFolder(ReplicatedStorage, "MotionDirectorAnimations")
		local committed = {}
		for _, sequence in definitions do
			local existing = destination:FindFirstChild(sequence.Name)
			if existing then
				existing:Destroy()
			end
			sequence.Parent = destination
			table.insert(committed, {
				name = sequence.Name,
				keyframeCount = #sequence:GetKeyframes(),
				duration = sequenceDuration(sequence),
				path = pathOf(sequence),
			})
		end
		for _, source in sources do
			source:Destroy()
		end
		return {
			status = "rebuilt",
			rig = pathOf(rig),
			count = #committed,
			animations = committed,
		}
	end)
end

local function liveAnimationRigs(): { Model }
	local rigs = {}
	for _, candidate in workspace:GetChildren() do
		if candidate:IsA("Model") then
			local animationHost = candidate:FindFirstChildOfClass("Humanoid")
				or candidate:FindFirstChildOfClass("AnimationController")
			if animationHost and candidate:FindFirstChild("HumanoidRootPart", true) then
				table.insert(rigs, candidate)
			end
		end
	end
	table.sort(rigs, function(left, right)
		local leftPosition = left:GetPivot().Position
		local rightPosition = right:GetPivot().Position
		if math.abs(leftPosition.X - rightPosition.X) > 0.001 then
			return leftPosition.X < rightPosition.X
		end
		if math.abs(leftPosition.Z - rightPosition.Z) > 0.001 then
			return leftPosition.Z < rightPosition.Z
		end
		return left.Name < right.Name
	end)
	return rigs
end

handlers["animation.previewCommittedMultiRig"] = function(params)
	if not RunService:IsRunning() then
		error("Enter Play mode before previewing a committed synchronized animation.")
	end
	local animations = ReplicatedStorage:FindFirstChild("MotionDirectorAnimations")
	local encounter = animations and animations:FindFirstChild(params.animationName)
	if not encounter or not encounter:IsA("Folder") then
		error("Committed synchronized animation not found: " .. tostring(params.animationName))
	end
	local sequences = {}
	for _, child in encounter:GetChildren() do
		if child:IsA("KeyframeSequence") then
			table.insert(sequences, child)
		end
	end
	table.sort(sequences, function(left, right)
		return left.Name < right.Name
	end)
	local rigs = liveAnimationRigs()
	if #sequences < 2 then
		error("The committed synchronized animation needs at least two actor sequences.")
	end
	if #rigs < #sequences then
		error(
			"Found "
				.. tostring(#rigs)
				.. " live animation rigs for "
				.. tostring(#sequences)
				.. " actor sequences."
		)
	end

	stopActivePreviews()
	local loaded = {}
	for index, sequence in sequences do
		local rig = rigs[index]
		local track = loadSequenceTrack(sequence, rig, params)
		table.insert(loaded, {
			actorId = sequence.Name,
			rig = rig,
			track = track,
		})
	end
	for _, actor in loaded do
		actor.track:Play(0.05, 1, params.playbackSpeed or 1)
		actor.track.TimePosition = 0
	end
	task.wait(0.15)
	local actors = {}
	for _, actor in loaded do
		table.insert(actors, {
			actorId = actor.actorId,
			rig = pathOf(actor.rig),
			length = actor.track.Length,
			isPlaying = actor.track.IsPlaying,
			timePosition = actor.track.TimePosition,
			weight = actor.track.WeightCurrent,
		})
	end
	return {
		status = "playing",
		animationName = params.animationName,
		studioIsRunning = RunService:IsRunning(),
		looped = params.looped == true,
		speed = params.playbackSpeed or 1,
		actors = actors,
	}
end

handlers["animation.discardDraft"] = function(params)
	return withRecording("Discard Motion Director draft", function()
		local drafts = ServerStorage:FindFirstChild("MotionDirectorDrafts")
		local transaction = drafts and drafts:FindFirstChild(params.transactionId)
		if not transaction then
			error("Draft transaction not found: " .. tostring(params.transactionId))
		end
		transaction:Destroy()
		return { status = "discarded", transactionId = params.transactionId }
	end)
end

local function connect(): boolean
	local ok, result = request("/plugin/connect", {
		installationId = installationId,
		studioUserId = StudioService:GetUserId(),
		placeId = game.PlaceId,
		placeName = game.Name,
		pluginVersion = PLUGIN_VERSION,
	})
	if not ok then
		sessionId = nil
		agentToken = nil
		pairingCode = nil
		status.Text = if bridgeMode == "local"
			then "Companion offline\nStart the MCP server from your AI client."
			else "ChatGPT relay offline\nCheck the relay URL and HTTP permissions."
		status.TextColor3 = Color3.fromRGB(255, 176, 92)
		if bridgeMode == "chatgpt" then
			pairLabel.Text = "Unable to reach relay"
		end
		return false
	end
	sessionId = result.sessionId
	agentToken = result.agentToken
	pairingCode = result.pairingCode
	if type(result.pollIntervalMs) == "number" then
		pollIntervalSeconds = math.clamp(result.pollIntervalMs / 1000, 0.2, 3)
	end
	status.Text = if bridgeMode == "local"
		then "Connected locally\nReady for MCP animation direction."
		else "Connected to ChatGPT\nUse the pairing code below."
	status.TextColor3 = Color3.fromRGB(113, 231, 163)
	if bridgeMode == "chatgpt" then
		pairLabel.Text = if type(pairingCode) == "string"
			then "PAIRING CODE\n" .. pairingCode
			else "Relay did not return a pairing code"
	end
	return true
end

local function returnResult(commandId: string, ok: boolean, value: any)
	local payload: Dictionary = {
		sessionId = sessionId,
		agentToken = agentToken,
		id = commandId,
		ok = ok,
	}
	if ok then
		payload.result = value
	else
		payload.error = {
			code = "STUDIO_COMMAND_FAILED",
			message = tostring(value),
		}
	end
	request("/plugin/result", payload)
end

task.spawn(function()
	while running do
		if not sessionId and not connect() then
			task.wait(2)
			continue
		end
		local ok, response = request("/plugin/poll", {
			sessionId = sessionId,
			agentToken = agentToken,
		})
		if not ok then
			sessionId = nil
			agentToken = nil
			pairingCode = nil
			task.wait(1)
			continue
		end
		local command = response.command
		if command then
			local handler = handlers[command.method]
			if not handler then
				returnResult(command.id, false, "Unsupported Studio command: " .. tostring(command.method))
			else
				local handled, result = pcall(handler, command.params or {})
				returnResult(command.id, handled, result)
			end
		end
		task.wait(pollIntervalSeconds)
	end
end)

plugin.Unloading:Connect(function()
	running = false
end)
