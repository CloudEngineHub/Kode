import type {
  CompletionContext,
  UnifiedSuggestion,
} from '#cli-utils/completion/types'
import type { Command } from '#cli-commands'

export interface UnifiedCompletionProps {
  input: string
  cursorOffset: number
  onInputChange: (value: string) => void
  setCursorOffset: (offset: number) => void
  commands: Command[]
  disableSlashCommands?: boolean
  isEnabled?: boolean
  onSubmit?: (value: string, isSubmittingSlashCommand?: boolean) => void
}

export interface CompletionState {
  suggestions: UnifiedSuggestion[]
  selectedIndex: number
  isActive: boolean
  context: CompletionContext | null
  preview: {
    isActive: boolean
    originalInput: string
    wordRange: [number, number]
  } | null
  emptyDirMessage: string
  suppressUntil: number
}

export const INITIAL_STATE: CompletionState = {
  suggestions: [],
  selectedIndex: 0,
  isActive: false,
  context: null,
  preview: null,
  emptyDirMessage: '',
  suppressUntil: 0,
}
