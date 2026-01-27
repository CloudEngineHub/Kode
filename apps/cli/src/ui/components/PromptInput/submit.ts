import type React from 'react'
import type { Command } from '#cli-commands'
import type { Message } from '#core/query'
import type { PermissionMode } from '#core/types/PermissionMode'
import type { ToolPermissionContext } from '#core/types/toolPermissionContext'
import type { SetToolJSXFn, Tool } from '#core/tooling/Tool'
import { addToHistory } from '#core/history'
import { logError } from '#core/utils/log'
import { handleHashCommand } from '#core/utils/hashCommand'
import { processUserInput } from '#ui-ink/utils/processUserInput'
import type { PromptMode } from './types'
import type { PastedImageAttachment, PastedTextSegment } from './pastes'
import { expandPastedTextPlaceholders } from './pastes'
import { interpretHashCommand } from './hashCommand'
import { getCwd } from '#core/utils/state'
import type { SetForkConvoWithMessagesOnTheNextRender } from '#ui-ink/types/conversationReset'

const EXIT_COMMANDS = new Set(['exit', 'quit', ':q', ':q!', ':wq', ':wq!'])

function extractPasteId(placeholder: string): number | null {
  const match = placeholder.match(
    /\[(Pasted text|Image|\.\.\.Truncated text) #(\d+)(?: \+\d+ lines)?(\.)*\]/,
  )
  if (!match?.[2]) return null
  if (match[1] !== 'Pasted text') return null
  const id = Number(match[2])
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

function buildHistoryPastedContents(
  pastedTexts: PastedTextSegment[],
): Record<number, { id: number; type: 'text'; content: string }> {
  const out: Record<number, { id: number; type: 'text'; content: string }> = {}
  for (const pasted of pastedTexts) {
    const id = extractPasteId(pasted.placeholder)
    if (!id) continue
    out[id] = { id, type: 'text', content: pasted.text }
  }
  return out
}

function addPromptToHistory(args: {
  display: string
  pastedTexts: PastedTextSegment[]
}): void {
  const pastedContents = buildHistoryPastedContents(args.pastedTexts)
  if (Object.keys(pastedContents).length > 0) {
    addToHistory({ display: args.display, pastedContents })
    return
  }
  addToHistory(args.display)
}

function getKodingContext(): string {
  return [
    'The user is using Koding mode.',
    'Format your response as a comprehensive, well-structured document suitable for adding to AGENTS.md.',
    'Use proper markdown formatting with headings, lists, code blocks, etc.',
    'The response should be complete and ready to add to AGENTS.md documentation.',
  ].join(' ')
}

export async function submitPrompt(args: {
  input: string
  mode: PromptMode
  completionActive: boolean
  suggestionCount: number
  isSubmittingSlashCommand?: boolean
  isDisabled: boolean
  isLoading: boolean
  isEditingExternally: boolean
  abortController: AbortController | null
  setIsLoading: (isLoading: boolean) => void
  setAbortController: (abortController: AbortController | null) => void
  onInputChange: (value: string) => void
  onModeChange: (mode: PromptMode) => void
  setCursorOffset: (offset: number) => void
  onSubmitCountChange: (updater: (prev: number) => number) => void
  onQuery: (
    newMessages: Message[],
    abortController?: AbortController,
  ) => Promise<void>
  setToolJSX: SetToolJSXFn<React.ReactNode>
  commands: Command[]
  forkNumber: number
  messageLogName: string
  tools: Tool[]
  verbose: boolean
  disableSlashCommands?: boolean
  permissionMode: PermissionMode
  toolPermissionContext: ToolPermissionContext
  setForkConvoWithMessagesOnTheNextRender: SetForkConvoWithMessagesOnTheNextRender
  onShowMessageSelector?: () => void
  readFileTimestamps: { [filename: string]: number }
  pastedTexts: PastedTextSegment[]
  pastedImages: PastedImageAttachment[]
  clearPastes: () => void
  resetHistory: () => void
  setCurrentPwd: (pwd: string) => void
  exit: () => never
}): Promise<void> {
  if (args.isEditingExternally) return

  if (
    !args.isSubmittingSlashCommand &&
    args.completionActive &&
    args.suggestionCount > 0
  ) {
    return
  }

  if (!args.input) return
  if (args.isDisabled) return
  if (args.isLoading) return

  const trimmed = args.input.trim()
  if (!trimmed) return

  if (EXIT_COMMANDS.has(trimmed)) {
    args.exit()
  }

  const isKoding = args.mode === 'koding' || args.input.startsWith('#')
  const isKodingActionPrompt =
    isKoding &&
    args.input.match(/^(#\s*)?(put|create|generate|write|give|provide)/i)

  if (isKoding && !isKodingActionPrompt) {
    try {
      const contentToInterpret =
        args.mode === 'koding' && !args.input.startsWith('#')
          ? args.input.trim()
          : args.input.substring(1).trim()
      const interpreted = await interpretHashCommand(contentToInterpret)
      handleHashCommand(interpreted)
    } catch (error) {
      logError(error)
    }

    args.onInputChange('')
    args.setCursorOffset(0)
    addPromptToHistory({
      display: args.mode === 'koding' ? `#${args.input}` : args.input,
      pastedTexts: args.pastedTexts,
    })
    args.resetHistory()
    args.onModeChange('prompt')
    return
  }

  const effectiveMode: PromptMode =
    isKodingActionPrompt && args.mode !== 'bash' ? 'prompt' : args.mode

  const finalInput = expandPastedTextPlaceholders({
    input:
      isKodingActionPrompt && args.mode === 'koding'
        ? args.input.trim()
        : args.input,
    pastedTexts: args.pastedTexts,
  })

  const imagesForMessage = args.pastedImages

  args.clearPastes()
  args.onInputChange('')
  args.setCursorOffset(0)
  args.onSubmitCountChange(prev => prev + 1)

  if (effectiveMode !== 'bash' && effectiveMode !== 'background') {
    args.onModeChange('prompt')
  }

  args.setIsLoading(true)

  const controller = new AbortController()
  args.setAbortController(controller)

  const kodingContext = isKodingActionPrompt ? getKodingContext() : undefined

  let newMessages: Message[]
  try {
    newMessages = await processUserInput(
      finalInput,
      effectiveMode,
      args.setToolJSX,
      {
        options: {
          commands: args.commands,
          forkNumber: args.forkNumber,
          messageLogName: args.messageLogName,
          openMessageSelector: args.onShowMessageSelector,
          tools: args.tools,
          verbose: args.verbose,
          maxThinkingTokens: 0,
          permissionMode: args.permissionMode,
          toolPermissionContext: args.toolPermissionContext,
          disableSlashCommands: args.disableSlashCommands,
          isKodingRequest: isKodingActionPrompt ? true : undefined,
          kodingContext,
        },
        messageId: undefined,
        abortController: controller,
        readFileTimestamps: args.readFileTimestamps,
        setForkConvoWithMessagesOnTheNextRender:
          args.setForkConvoWithMessagesOnTheNextRender,
      },
      imagesForMessage.length > 0 ? imagesForMessage : null,
    )
  } catch (error) {
    args.setIsLoading(false)
    logError(error)
    return
  }

  if (newMessages.length === 0) {
    addPromptToHistory({ display: args.input, pastedTexts: args.pastedTexts })
    args.resetHistory()
    args.setIsLoading(false)
    return
  }

  const shouldUpdatePwdAfterBash =
    effectiveMode === 'bash' || effectiveMode === 'background'

  // Save prompt to history immediately after we successfully construct the user messages.
  // This ensures history is preserved even if the query is aborted (e.g. Escape) or errors mid-flight.
  const inputToAdd =
    effectiveMode === 'bash'
      ? `!${args.input}`
      : effectiveMode === 'background'
        ? `&${args.input}`
        : args.input

  if (newMessages.some(message => message.type === 'user')) {
    addPromptToHistory({ display: inputToAdd, pastedTexts: args.pastedTexts })
    args.resetHistory()
  }

  try {
    await args.onQuery(newMessages, controller)
    if (shouldUpdatePwdAfterBash) {
      args.setCurrentPwd(getCwd())
    }
  } catch (error) {
    logError(error)
  }
}
