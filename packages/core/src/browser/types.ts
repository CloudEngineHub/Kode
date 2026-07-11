export type BrowserAdapterKind = 'disabled' | 'mcp'

export type BrowserErrorCode =
  | 'disabled'
  | 'approval_required'
  | 'invalid_request'
  | 'origin_not_allowlisted'
  | 'navigation_unverified'
  | 'navigation_required'
  | 'sensitive_input_not_allowed'
  | 'mcp_error'

type BrowserRequestBase = {
  /** Must be set by the host after its normal permission flow has approved it. */
  approved?: boolean
  signal?: AbortSignal
}

export type BrowserNavigateRequest = BrowserRequestBase & {
  action: 'navigate'
  url: string
}

export type BrowserSnapshotRequest = BrowserRequestBase & {
  action: 'snapshot'
  maxChars?: number
}

export type BrowserClickRequest = BrowserRequestBase & {
  action: 'click'
  selector: string
}

export type BrowserTypeRequest = BrowserRequestBase & {
  action: 'type'
  selector: string
  text: string
  /** Explicit acknowledgement for approved integrations that intentionally type secrets. */
  sensitive?: boolean
}

export type BrowserScreenshotRequest = BrowserRequestBase & {
  action: 'screenshot'
}

export type BrowserCloseRequest = BrowserRequestBase & {
  action: 'close'
}

export type BrowserRequest =
  | BrowserNavigateRequest
  | BrowserSnapshotRequest
  | BrowserClickRequest
  | BrowserTypeRequest
  | BrowserScreenshotRequest
  | BrowserCloseRequest

export type BrowserSuccess = {
  ok: true
  action: BrowserRequest['action']
  data: unknown
}

export type BrowserFailure = {
  ok: false
  action: BrowserRequest['action']
  code: BrowserErrorCode
  message: string
}

export type BrowserResult = BrowserSuccess | BrowserFailure

export interface BrowserAdapter {
  readonly kind: BrowserAdapterKind
  readonly isAvailable: boolean
  execute(request: BrowserRequest): Promise<BrowserResult>
}

/**
 * Thin transport boundary for a browser-capable MCP server. The adapter has no
 * direct dependency on the MCP client, so the host owns connection lifecycle
 * and permission context.
 */
export type BrowserMcpInvoker = (args: {
  toolName: string
  input: Record<string, unknown>
  signal?: AbortSignal
}) => Promise<unknown>

export type BrowserMcpToolNames = Partial<
  Record<BrowserRequest['action'], string>
>

export type McpBrowserAdapterOptions = {
  invoke: BrowserMcpInvoker
  /** Exact allowed origins. Empty is fail-closed for navigation. */
  allowedOrigins?: readonly string[]
  toolNames?: BrowserMcpToolNames
  requireApproval?: boolean
  allowSensitiveInput?: boolean
}
