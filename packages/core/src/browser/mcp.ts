import { mayContainSensitiveTypedValue } from '#core/memory/redaction'

import type {
  BrowserAdapter,
  BrowserErrorCode,
  BrowserFailure,
  BrowserMcpToolNames,
  BrowserRequest,
  BrowserResult,
  McpBrowserAdapterOptions,
} from './types'

const DEFAULT_TOOL_NAMES: Required<BrowserMcpToolNames> = {
  navigate: 'browser_navigate',
  snapshot: 'browser_snapshot',
  click: 'browser_click',
  type: 'browser_type',
  screenshot: 'browser_screenshot',
  close: 'browser_close',
}

function failure(
  request: BrowserRequest,
  code: BrowserErrorCode,
  message: string,
): BrowserFailure {
  return { ok: false, action: request.action, code, message }
}

function normalizeOrigins(origins: readonly string[] | undefined): Set<string> {
  const normalized = new Set<string>()
  for (const value of origins ?? []) {
    try {
      const url = new URL(value)
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        normalized.add(url.origin)
      }
    } catch {
      // Invalid configuration entries are ignored; this remains fail-closed.
    }
  }
  return normalized
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * The host adapter must report the browser's actual URL after each action. A
 * requested URL is not a security boundary because navigation and clicks can
 * redirect before the next action is dispatched.
 */
function actualPageOrigin(data: unknown): string | null {
  const record = asRecord(data)
  if (!record) return null
  const raw = [record.finalUrl, record.pageUrl, record.url].find(
    value => typeof value === 'string' && value.trim().length > 0,
  )
  if (typeof raw !== 'string') return null
  try {
    const url = new URL(raw)
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password
    ) {
      return null
    }
    return url.origin
  } catch {
    return null
  }
}

function validateSelector(value: string): string | null {
  const selector = String(value ?? '').trim()
  if (!selector || selector.length > 512 || /[\u0000-\u001f]/u.test(selector)) {
    return null
  }
  return selector
}

function requestInput(request: BrowserRequest): Record<string, unknown> {
  switch (request.action) {
    case 'navigate':
      return { url: request.url }
    case 'snapshot':
      return {
        ...(typeof request.maxChars === 'number'
          ? {
              maxChars: Math.max(
                1,
                Math.min(20_000, Math.floor(request.maxChars)),
              ),
            }
          : {}),
      }
    case 'click':
      return { selector: request.selector }
    case 'type':
      return { selector: request.selector, text: request.text }
    case 'screenshot':
    case 'close':
      return {}
  }
}

/**
 * A fail-closed browser bridge for MCP. It deliberately excludes arbitrary
 * JavaScript evaluation, local-file URLs, unapproved navigation, and implicit
 * secret typing. Existing host permission checks must set `approved: true`.
 */
export class McpBrowserAdapter implements BrowserAdapter {
  readonly kind = 'mcp' as const
  readonly isAvailable = true

  private readonly allowedOrigins: Set<string>
  private readonly toolNames: Required<BrowserMcpToolNames>
  private readonly requireApproval: boolean
  private readonly allowSensitiveInput: boolean
  private activeOrigin: string | null = null

  constructor(private readonly options: McpBrowserAdapterOptions) {
    this.allowedOrigins = normalizeOrigins(options.allowedOrigins)
    this.toolNames = { ...DEFAULT_TOOL_NAMES, ...(options.toolNames ?? {}) }
    this.requireApproval = options.requireApproval !== false
    this.allowSensitiveInput = options.allowSensitiveInput === true
  }

  async execute(request: BrowserRequest): Promise<BrowserResult> {
    if (this.requireApproval && request.approved !== true) {
      return failure(
        request,
        'approval_required',
        'Browser action requires approval.',
      )
    }

    const validationError = this.validateRequest(request)
    if (validationError) return validationError

    try {
      const data = await this.options.invoke({
        toolName: this.toolNames[request.action],
        input: requestInput(request),
        signal: request.signal,
      })
      if (request.action === 'close') {
        this.activeOrigin = null
        return { ok: true, action: request.action, data }
      }

      const origin = actualPageOrigin(data)
      if (!origin) {
        this.activeOrigin = null
        return failure(
          request,
          'navigation_unverified',
          'Browser MCP did not report an actual HTTP(S) page URL.',
        )
      }
      if (!this.allowedOrigins.has(origin)) {
        this.activeOrigin = null
        return failure(
          request,
          'origin_not_allowlisted',
          'Browser action ended on an origin that is not allowlisted.',
        )
      }
      this.activeOrigin = origin
      return { ok: true, action: request.action, data }
    } catch {
      return failure(request, 'mcp_error', 'Browser MCP action failed.')
    }
  }

  private validateRequest(request: BrowserRequest): BrowserFailure | null {
    if (request.action === 'navigate') {
      let url: URL
      try {
        url = new URL(request.url)
      } catch {
        return failure(request, 'invalid_request', 'Browser URL is invalid.')
      }
      if (
        (url.protocol !== 'http:' && url.protocol !== 'https:') ||
        url.username ||
        url.password ||
        request.url.length > 4_096
      ) {
        return failure(
          request,
          'invalid_request',
          'Browser URL is not permitted.',
        )
      }
      if (!this.allowedOrigins.has(url.origin)) {
        return failure(
          request,
          'origin_not_allowlisted',
          'Browser origin is not allowlisted.',
        )
      }
      return null
    }

    if (request.action === 'close') return null
    if (!this.activeOrigin) {
      return failure(
        request,
        'navigation_required',
        'Navigate to an allowlisted origin before interacting with the page.',
      )
    }

    if (request.action === 'click' || request.action === 'type') {
      if (!validateSelector(request.selector)) {
        return failure(
          request,
          'invalid_request',
          'Browser selector is invalid.',
        )
      }
    }

    if (request.action === 'type') {
      const text = String(request.text ?? '')
      if (!text || text.length > 4_096) {
        return failure(
          request,
          'invalid_request',
          'Browser typed text is invalid.',
        )
      }
      if (
        (request.sensitive === true || mayContainSensitiveTypedValue(text)) &&
        !this.allowSensitiveInput
      ) {
        return failure(
          request,
          'sensitive_input_not_allowed',
          'Sensitive browser input is disabled.',
        )
      }
    }
    return null
  }
}

export function createMcpBrowserAdapter(
  options: McpBrowserAdapterOptions,
): BrowserAdapter {
  return new McpBrowserAdapter(options)
}
