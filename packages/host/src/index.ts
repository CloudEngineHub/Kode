import type { ToolRenderOutput } from '@kode/tool-interface/Tool'

export type HostRenderable = ToolRenderOutput

export type HostDisplayMode = 'inline' | 'fullscreen'

export interface HostRenderOptions {
  displayMode?: HostDisplayMode
  verbose?: boolean
}

export interface HostCapabilities {
  interactive: boolean
  supportsAnsi: boolean
  supportsAlternateScreen: boolean
  supportsInlineImages: boolean
  supportsStreaming: boolean
  supportsToolProgress: boolean
}

export interface AgentMessage {
  id?: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: unknown
}

export interface ToolUseDisplay {
  id?: string
  toolName: string
  input: unknown
}

export interface ToolResultDisplay {
  toolUseId?: string
  toolName?: string
  output: unknown
  isError?: boolean
}

export interface FileDiff {
  filePath: string
  oldText?: string
  newText?: string
  unifiedDiff?: string
}

export interface ProgressUpdate {
  message?: string
  current?: number
  total?: number
}

export interface AgentError {
  message: string
  code?: string
  cause?: unknown
}

export interface PermissionRequest {
  toolName: string
  description: string
  input: Record<string, unknown>
  riskScore: number | null
  suggestions?: unknown[]
}

export interface PermissionResponse {
  result: boolean
  type?: 'permanent' | 'temporary'
  rejectionMessage?: string
}

export interface UserPrompt {
  message: string
  placeholder?: string
}

export interface Question {
  message: string
  choices?: SelectOption[]
}

export interface Answer {
  value: string
  index?: number
}

export interface SelectOption {
  label: string
  value?: string
  description?: string
}

export interface Session {
  id: string
  cwd?: string
}

export interface AgentInfo {
  id: string
  type?: string
  name?: string
}

export interface AgentResult {
  status: 'success' | 'error' | 'aborted'
  output?: unknown
  error?: AgentError
}

export interface KodeHost {
  renderMessage(message: AgentMessage): void
  renderAssistantText(text: string, options?: HostRenderOptions): void
  renderToolUse(toolUse: ToolUseDisplay): void
  renderToolResult(result: ToolResultDisplay): void
  renderDiff(diff: FileDiff): void
  renderProgress(taskId: string, progress: ProgressUpdate): void
  renderError(error: AgentError): void

  requestPermission(request: PermissionRequest): Promise<PermissionResponse>
  getUserInput(prompt: UserPrompt): Promise<string>
  askQuestion(question: Question): Promise<Answer>
  confirmAction(message: string): Promise<boolean>
  selectOption(options: SelectOption[]): Promise<number>

  onSessionStart(session: Session): void
  onSessionEnd(session: Session): void
  onAgentStart(agent: AgentInfo): void
  onAgentEnd(agent: AgentInfo, result: AgentResult): void
  onError(error: AgentError): void

  readonly capabilities: HostCapabilities
}
