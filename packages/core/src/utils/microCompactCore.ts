import type { Message } from '#core/query'
import { getMessagesSetter } from '#core/messages'
import { debug as debugLogger } from '#core/utils/debugLogger'
import { getModelManager } from '#core/utils/model'
import { createAssistantMessage } from '#core/utils/messages'
import {
  appendMicrocompactRecord,
  maybePersistOversizedToolResult,
  OLD_TOOL_RESULT_CONTENT_CLEARED_MARKER,
  PERSISTED_OUTPUT_OPEN_TAG,
} from '#core/utils/toolResultPersistence'
import { estimateTokens } from '#core/utils/tokens'
import {
  WARNING_MARGIN_TOKENS,
  calculateAutoCompactThresholds,
  getEffectiveConversationContextLimit,
} from '#core/utils/autoCompactThreshold'
import { getOriginalCwd } from '#core/utils/state'

const MICROCOMPACT_MAX_UNCOMPACTED_TOOL_RESULT_TOKENS = 40_000
const MICROCOMPACT_MIN_TOKENS_SAVED = 20_000
const MICROCOMPACT_KEEP_LAST_TOOL_USES = 3
const MICROCOMPACT_PREVIEW_CHARS = 400

const MICROCOMPACT_TOOL_NAMES = new Set([
  'Read',
  'Bash',
  'Grep',
  'Glob',
  'LS',
  'Edit',
  'Write',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
])

type Trigger = 'auto' | 'manual'

type MicroCompactOutcome = {
  messages: Message[]
  boundaryMessage?: Message
  tokensSaved: number
  compactedToolUseIds: string[]
  trigger: Trigger
}

function getConversationContextLimit(modelPointer: string): number {
  try {
    const modelManager = getModelManager()
    const resolution = modelManager.resolveModelWithInfo(modelPointer)
    const modelProfile = resolution.success ? resolution.profile : null

    if (modelProfile?.contextLength) {
      return modelProfile.contextLength
    }

    const main = modelManager.resolveModelWithInfo('main')
    if (main.success && main.profile?.contextLength) {
      return main.profile.contextLength
    }

    return 200_000
  } catch {
    return 200_000
  }
}

function getActiveConversationModelPointer(toolUseContext: any): string {
  const raw = toolUseContext?.options?.model
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return 'main'
}

function isToolUseLikeBlock(value: unknown): value is {
  type: 'tool_use' | 'server_tool_use' | 'mcp_tool_use'
  id?: unknown
  name?: unknown
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const type = record.type
  return (
    type === 'tool_use' || type === 'server_tool_use' || type === 'mcp_tool_use'
  )
}

function getMicrocompactedToolUseIds(messages: Message[]): Set<string> {
  const ids = new Set<string>()
  for (const message of messages) {
    if (message?.type !== 'user') continue
    const content = message.message.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (!block || typeof block !== 'object') continue
      const rec = block as unknown as Record<string, unknown>
      if (rec.type !== 'tool_result') continue
      const toolUseId =
        typeof rec.tool_use_id === 'string' ? rec.tool_use_id : null
      if (!toolUseId) continue
      if (
        typeof rec.content === 'string' &&
        rec.content.includes(PERSISTED_OUTPUT_OPEN_TAG)
      ) {
        ids.add(toolUseId)
      }
      if (
        typeof rec.content === 'string' &&
        rec.content === OLD_TOOL_RESULT_CONTENT_CLEARED_MARKER
      ) {
        ids.add(toolUseId)
      }
    }
  }
  return ids
}

function estimateTokensFromText(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

function estimateToolResultTokens(content: unknown): number {
  if (!content) return 0
  if (typeof content === 'string') return estimateTokensFromText(content)
  if (Array.isArray(content)) {
    return content.reduce((sum, item) => {
      if (!item || typeof item !== 'object') {
        return sum + estimateTokensFromText(String(item ?? ''))
      }
      const rec = item as Record<string, unknown>
      const type = typeof rec.type === 'string' ? rec.type : 'unknown'
      if (type === 'text')
        return sum + estimateTokensFromText(String(rec.text ?? ''))
      if (type === 'image') return sum + 2_000
      try {
        return sum + estimateTokensFromText(JSON.stringify(rec))
      } catch {
        return sum + estimateTokensFromText(String(rec))
      }
    }, 0)
  }
  try {
    return estimateTokensFromText(JSON.stringify(content))
  } catch {
    return estimateTokensFromText(String(content))
  }
}

function getToolResultTokenMap(args: {
  messages: Message[]
  toolUseIds: string[]
  alreadyMicrocompacted: Set<string>
}): Map<string, number> {
  const wanted = new Set(args.toolUseIds)
  const map = new Map<string, number>()

  for (const message of args.messages) {
    if (message?.type !== 'user') continue
    const content = message.message.content
    if (!Array.isArray(content)) continue

    for (const block of content) {
      if (!block || typeof block !== 'object') continue
      const rec = block as unknown as Record<string, unknown>
      if (rec.type !== 'tool_result') continue
      const toolUseId =
        typeof rec.tool_use_id === 'string' ? rec.tool_use_id : null
      if (!toolUseId || !wanted.has(toolUseId)) continue
      if (args.alreadyMicrocompacted.has(toolUseId)) continue
      if (map.has(toolUseId)) continue

      map.set(toolUseId, estimateToolResultTokens(rec.content))
    }
  }

  return map
}

function pickToolUseIdsToCompact(args: {
  toolUseIds: string[]
  toolResultTokenMap: Map<string, number>
  keepLastToolUses?: number
  maxUncompactedToolResultTokens?: number
}): { compacted: Set<string>; tokensSaved: number; totalTokens: number } {
  const keepLast = args.keepLastToolUses ?? MICROCOMPACT_KEEP_LAST_TOOL_USES
  const maxTokens =
    args.maxUncompactedToolResultTokens ??
    MICROCOMPACT_MAX_UNCOMPACTED_TOOL_RESULT_TOKENS

  const totalTokens = Array.from(args.toolResultTokenMap.values()).reduce(
    (sum, t) => sum + t,
    0,
  )

  const tailIds = new Set(args.toolUseIds.slice(-Math.max(0, keepLast)))

  const compacted = new Set<string>()
  let tokensSaved = 0

  for (const toolUseId of args.toolUseIds) {
    if (tailIds.has(toolUseId)) continue
    if (totalTokens - tokensSaved <= maxTokens) break

    compacted.add(toolUseId)
    tokensSaved += args.toolResultTokenMap.get(toolUseId) ?? 0
  }

  return { compacted, tokensSaved, totalTokens }
}

function buildMicrocompactBoundaryMessage(args: {
  tokensSaved: number
  toolCount: number
  trigger: Trigger
}): Message {
  const plural = args.toolCount === 1 ? 'tool result' : 'tool results'
  const content =
    `<tool-progress>` +
    `Context microcompacted (${args.trigger}): persisted ${args.toolCount} ${plural} ` +
    `(saved ~${Math.max(0, Math.round(args.tokensSaved / 1000))}k tokens).` +
    `</tool-progress>`

  return { ...createAssistantMessage(content), isMeta: true }
}

function shouldRunAutoMicrocompact(args: {
  tokenUsage: number
  contextLimit: number
  minTokensSaved: number
  tokensSaved: number
}): boolean {
  const effectiveLimit = getEffectiveConversationContextLimit(args.contextLimit)
  const { autoCompactThreshold } = calculateAutoCompactThresholds(
    args.tokenUsage,
    effectiveLimit,
  )
  const safeThreshold = Math.max(1, Math.floor(autoCompactThreshold))
  const warningThreshold = Math.max(0, safeThreshold - WARNING_MARGIN_TOKENS)

  return (
    args.tokenUsage >= warningThreshold &&
    args.tokensSaved >= args.minTokensSaved
  )
}

function applyMicrocompactToMessages(args: {
  messages: Message[]
  cwd: string
  toolUseIdsToCompact: Set<string>
  previewChars?: number
}): Message[] {
  const previewChars =
    typeof args.previewChars === 'number' && Number.isFinite(args.previewChars)
      ? Math.max(0, Math.trunc(args.previewChars))
      : MICROCOMPACT_PREVIEW_CHARS

  return args.messages.map(message => {
    if (message?.type !== 'user') return message
    const content = message.message.content
    if (!Array.isArray(content)) return message

    let changed = false
    const nextBlocks = content.map(block => {
      if (!block || typeof block !== 'object') return block
      const rec = block as unknown as Record<string, unknown>
      if (rec.type !== 'tool_result') return block
      const toolUseId =
        typeof rec.tool_use_id === 'string' ? rec.tool_use_id : null
      if (!toolUseId || !args.toolUseIdsToCompact.has(toolUseId)) return block

      const existingContent = rec.content
      if (
        typeof existingContent === 'string' &&
        existingContent.includes(PERSISTED_OUTPUT_OPEN_TAG)
      ) {
        return block
      }

      const persisted = maybePersistOversizedToolResult({
        cwd: args.cwd,
        toolUseId,
        content: existingContent as any,
        maxResultSizeChars: 0,
        previewChars,
      })

      if (
        typeof persisted === 'string' &&
        persisted.includes(PERSISTED_OUTPUT_OPEN_TAG)
      ) {
        changed = true
        return { ...(block as any), content: persisted }
      }

      if (typeof existingContent === 'string') {
        changed = true
        return {
          ...(block as any),
          content: OLD_TOOL_RESULT_CONTENT_CLEARED_MARKER,
        }
      }

      // If we couldn't persist non-string content (e.g., image blocks), keep as-is.
      return block
    })

    if (!changed) return message
    return {
      ...message,
      message: {
        ...message.message,
        content: nextBlocks as any,
      },
    }
  })
}

export async function checkMicroCompact(
  messages: Message[],
  toolUseContext: any,
  options?: {
    trigger?: Trigger
    contextLimit?: number
    maxUncompactedToolResultTokens?: number
    minTokensSaved?: number
    keepLastToolUses?: number
    previewChars?: number
  },
): Promise<MicroCompactOutcome> {
  const trigger = options?.trigger ?? 'auto'
  if (process.env.KODE_DISABLE_MICROCOMPACT === '1') {
    return {
      messages,
      tokensSaved: 0,
      compactedToolUseIds: [],
      trigger,
    }
  }

  const alreadyMicrocompacted = getMicrocompactedToolUseIds(messages)

  const toolUseIds: string[] = []
  for (const message of messages) {
    if (message?.type !== 'assistant') continue
    const content = message.message.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (!isToolUseLikeBlock(block)) continue
      const name = typeof block.name === 'string' ? block.name : ''
      const id = typeof block.id === 'string' ? block.id : ''
      if (!id || !name) continue
      if (!MICROCOMPACT_TOOL_NAMES.has(name)) continue
      if (alreadyMicrocompacted.has(id)) continue
      toolUseIds.push(id)
    }
  }

  if (toolUseIds.length === 0) {
    return {
      messages,
      tokensSaved: 0,
      compactedToolUseIds: [],
      trigger,
    }
  }

  const toolResultTokenMap = getToolResultTokenMap({
    messages,
    toolUseIds,
    alreadyMicrocompacted,
  })

  const { compacted, tokensSaved, totalTokens } = pickToolUseIdsToCompact({
    toolUseIds,
    toolResultTokenMap,
    keepLastToolUses: options?.keepLastToolUses,
    maxUncompactedToolResultTokens: options?.maxUncompactedToolResultTokens,
  })

  if (compacted.size === 0) {
    return {
      messages,
      tokensSaved: 0,
      compactedToolUseIds: [],
      trigger,
    }
  }

  const minTokensSaved =
    options?.minTokensSaved ?? MICROCOMPACT_MIN_TOKENS_SAVED

  if (trigger === 'auto') {
    const tokenUsage = estimateTokens(messages)
    const activePointer = getActiveConversationModelPointer(toolUseContext)
    const contextLimit =
      typeof options?.contextLimit === 'number' &&
      Number.isFinite(options.contextLimit)
        ? Math.max(1, Math.trunc(options.contextLimit))
        : getConversationContextLimit(activePointer)

    const shouldRun = shouldRunAutoMicrocompact({
      tokenUsage,
      contextLimit,
      minTokensSaved,
      tokensSaved,
    })

    if (!shouldRun) {
      return {
        messages,
        tokensSaved: 0,
        compactedToolUseIds: [],
        trigger,
      }
    }
  }

  const cwd = getOriginalCwd()
  const tokenUsageBefore = estimateTokens(messages)
  const nextMessages = applyMicrocompactToMessages({
    messages,
    cwd,
    toolUseIdsToCompact: compacted,
    previewChars: options?.previewChars,
  })
  const tokenUsageAfter = estimateTokens(nextMessages)

  // Ensure the interactive transcript updates before the next model call.
  getMessagesSetter()?.(nextMessages)

  if (process.env.NODE_ENV !== 'test') {
    const shouldPersistSession =
      toolUseContext?.options?.persistSession !== false
    if (shouldPersistSession) {
      appendMicrocompactRecord({
        cwd,
        record: {
          timestamp: Date.now(),
          trigger,
          tokenUsageBefore,
          tokenUsageAfter,
          totalToolResultTokens: totalTokens,
          tokensSaved,
          toolUseIds: Array.from(compacted),
        },
      })
    }
  }

  const boundaryMessage = buildMicrocompactBoundaryMessage({
    tokensSaved,
    toolCount: compacted.size,
    trigger,
  })

  debugLogger.info('MICROCOMPACT_APPLIED', {
    trigger,
    toolUseIdsCompacted: compacted.size,
    totalToolResultTokens: totalTokens,
    tokensSaved,
  })

  return {
    messages: nextMessages,
    boundaryMessage,
    tokensSaved,
    compactedToolUseIds: Array.from(compacted),
    trigger,
  }
}
