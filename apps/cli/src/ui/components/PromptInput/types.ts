import type { ReactNode } from 'react'
import type { Command } from '#cli-commands'
import type { Message } from '#core/query'
import type { SetToolJSXFn } from '#core/tooling/Tool'
import type { Tool } from '#core/tooling/Tool'
import type { SetForkConvoWithMessagesOnTheNextRender } from '#ui-ink/types/conversationReset'

export type PromptMode = 'bash' | 'background' | 'prompt' | 'koding'

export function toggleBashMode(current: PromptMode): PromptMode {
  return current === 'bash' ? 'prompt' : 'bash'
}

export type PromptInputProps = {
  commands: Command[]
  forkNumber: number
  messageLogName: string
  initialPrompt?: string
  disableSlashCommands?: boolean
  isDisabled: boolean
  isLoading: boolean
  onQuery: (
    newMessages: Message[],
    abortController?: AbortController,
  ) => Promise<void>
  debug: boolean
  verbose: boolean
  messages: Message[]
  setToolJSX: SetToolJSXFn<ReactNode>
  tools: Tool[]
  input: string
  onInputChange: (value: string) => void
  mode: PromptMode
  onModeChange: (mode: PromptMode) => void
  submitCount: number
  onSubmitCountChange: (updater: (prev: number) => number) => void
  setIsLoading: (isLoading: boolean) => void
  setAbortController: (abortController: AbortController | null) => void
  onShowMessageSelector: () => void
  setForkConvoWithMessagesOnTheNextRender: SetForkConvoWithMessagesOnTheNextRender
  readFileTimestamps: { [filename: string]: number }
  abortController: AbortController | null
  onModelChange?: () => void
  uiRefreshCounter?: number
  onManageTasks?: () => void
  shortcutsOpen?: boolean
  restorePastes?: {
    id: number
    pastedTexts: Array<{ placeholder: string; text: string }>
    pastedImages: Array<{
      placeholder: string
      data: string
      mediaType: string
    }>
  }
  onRestorePastesApplied?: (id: number) => void
  draftPastes?: {
    pastedTexts: Array<{ placeholder: string; text: string }>
    pastedImages: Array<{
      placeholder: string
      data: string
      mediaType: string
    }>
  }
  onDraftPastesChange?: (next: {
    pastedTexts: Array<{ placeholder: string; text: string }>
    pastedImages: Array<{
      placeholder: string
      data: string
      mediaType: string
    }>
  }) => void
}
