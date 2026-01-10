import type { ContentBlock, JsonObject, SessionModeId } from './base'

export type SessionUpdateKind =
  | 'user_message_chunk'
  | 'agent_message_chunk'
  | 'agent_thought_chunk'
  | 'tool_call'
  | 'tool_call_update'
  | 'plan'
  | 'available_commands_update'
  | 'current_mode_update'

export type PlanEntryPriority = 'high' | 'medium' | 'low'

export type PlanEntryStatus = 'pending' | 'in_progress' | 'completed'

export type PlanEntry = {
  content: string
  priority: PlanEntryPriority
  status: PlanEntryStatus
  _meta?: JsonObject | null
}

export type PlanUpdate = {
  sessionUpdate: 'plan'
  entries: PlanEntry[]
  _meta?: JsonObject | null
}

export type ToolKind =
  | 'read'
  | 'edit'
  | 'delete'
  | 'move'
  | 'search'
  | 'execute'
  | 'think'
  | 'fetch'
  | 'switch_mode'
  | 'other'

export type ToolCallStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export type ToolCallLocation = {
  path: string
  line?: number | null
  _meta?: JsonObject | null
}

export type ToolCallContent =
  | { type: 'content'; content: ContentBlock; _meta?: JsonObject | null }
  | {
      type: 'diff'
      path: string
      newText: string
      oldText?: string | null
      _meta?: JsonObject | null
    }
  | { type: 'terminal'; terminalId: string; _meta?: JsonObject | null }

export type ToolCall = {
  sessionUpdate: 'tool_call'
  toolCallId: string
  title: string
  kind?: ToolKind
  status?: ToolCallStatus
  content?: ToolCallContent[]
  locations?: ToolCallLocation[]
  rawInput?: JsonObject
  rawOutput?: JsonObject
  _meta?: JsonObject | null
}

export type ToolCallUpdate = {
  sessionUpdate: 'tool_call_update'
  toolCallId: string
  title?: string | null
  kind?: ToolKind | null
  status?: ToolCallStatus | null
  content?: ToolCallContent[] | null
  locations?: ToolCallLocation[] | null
  rawInput?: JsonObject
  rawOutput?: JsonObject
  _meta?: JsonObject | null
}

export type ToolCallUpdatePermissionRequest = Omit<
  ToolCallUpdate,
  'sessionUpdate'
>

export type PermissionOptionKind =
  | 'allow_once'
  | 'allow_always'
  | 'reject_once'
  | 'reject_always'

export type PermissionOption = {
  optionId: string
  name: string
  kind: PermissionOptionKind
  _meta?: JsonObject | null
}

export type OutcomeCancelled = {
  outcome: 'cancelled'
  _meta?: JsonObject | null
}
export type OutcomeSelected = {
  outcome: 'selected'
  optionId: string
  _meta?: JsonObject | null
}
export type RequestPermissionOutcome = OutcomeCancelled | OutcomeSelected

export type RequestPermissionParams = {
  sessionId: string
  toolCall: ToolCallUpdatePermissionRequest
  options: PermissionOption[]
  _meta?: JsonObject | null
}

export type RequestPermissionResponse = {
  outcome: RequestPermissionOutcome
  _meta?: JsonObject | null
}

export type AvailableCommandInput = { hint: string; _meta?: JsonObject | null }
export type AvailableCommand = {
  name: string
  description: string
  input?: AvailableCommandInput | null
  _meta?: JsonObject | null
}

export type AvailableCommandsUpdate = {
  sessionUpdate: 'available_commands_update'
  availableCommands: AvailableCommand[]
  _meta?: JsonObject | null
}

export type CurrentModeUpdate = {
  sessionUpdate: 'current_mode_update'
  currentModeId: SessionModeId
  _meta?: JsonObject | null
}

export type UserMessageChunk = {
  sessionUpdate: 'user_message_chunk'
  content: ContentBlock
  _meta?: JsonObject | null
}

export type AgentMessageChunk = {
  sessionUpdate: 'agent_message_chunk'
  content: ContentBlock
  _meta?: JsonObject | null
}

export type AgentThoughtChunk = {
  sessionUpdate: 'agent_thought_chunk'
  content: ContentBlock
  _meta?: JsonObject | null
}

export type SessionUpdate =
  | UserMessageChunk
  | AgentMessageChunk
  | AgentThoughtChunk
  | ToolCall
  | ToolCallUpdate
  | PlanUpdate
  | AvailableCommandsUpdate
  | CurrentModeUpdate

export type SessionUpdateNotification = {
  sessionId: string
  update: SessionUpdate
  _meta?: JsonObject | null
}
