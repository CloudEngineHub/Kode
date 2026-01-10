import figures from 'figures'
import { getCachedStringWidth } from '#cli-utils/textWidth'

import type {
  MultiSelectNavKey,
  MultiSelectNavState,
  Question,
  SingleSelectNavKey,
  TextInputKey,
} from './types'

export function isTextInputChar(
  input: unknown,
  key: TextInputKey,
): input is string {
  if (key.ctrl || key.meta || key.tab) return false
  if (typeof input !== 'string' || input.length === 0) return false
  for (const char of input) {
    const code = char.codePointAt(0)
    if (code === undefined) return false
    if (code < 32 || code === 127) return false
  }
  return true
}

export function applySingleSelectNav(args: {
  focusedOptionIndex: number
  key: SingleSelectNavKey
  optionCount: number
}): number {
  const { focusedOptionIndex, key, optionCount } = args

  if (key.downArrow) return Math.min(optionCount - 1, focusedOptionIndex + 1)
  if (key.upArrow) return Math.max(0, focusedOptionIndex - 1)
  return focusedOptionIndex
}

export function applyMultiSelectNav(args: {
  state: MultiSelectNavState
  key: MultiSelectNavKey
  optionCount: number
}): MultiSelectNavState {
  const { state, key, optionCount } = args

  const nextKey = key.downArrow || (key.tab && !key.shift)
  const prevKey = key.upArrow || (key.tab && key.shift)

  if (state.isSubmitFocused) {
    if (prevKey) {
      return {
        focusedOptionIndex: Math.max(0, optionCount - 1),
        isSubmitFocused: false,
      }
    }
    return state
  }

  if (nextKey) {
    if (state.focusedOptionIndex >= optionCount - 1) {
      return { ...state, isSubmitFocused: true }
    }
    return { ...state, focusedOptionIndex: state.focusedOptionIndex + 1 }
  }

  if (prevKey) {
    return {
      ...state,
      focusedOptionIndex: Math.max(0, state.focusedOptionIndex - 1),
    }
  }

  return state
}

function truncateWithEllipsis(label: string, maxWidth: number): string {
  if (getCachedStringWidth(label) <= maxWidth) return label

  let candidate = label
  while (
    candidate.length > 1 &&
    getCachedStringWidth(candidate + '…') > maxWidth
  ) {
    candidate = candidate.slice(0, -1)
  }
  return candidate.length ? candidate + '…' : '…'
}

export function getTabHeaders(args: {
  questions: Question[]
  currentQuestionIndex: number
  columns: number
  hideSubmitTab: boolean
}): string[] {
  const submitLabel = args.hideSubmitTab ? '' : ` ${figures.tick} Submit `
  const reserved =
    getCachedStringWidth('← ') +
    getCachedStringWidth(' →') +
    getCachedStringWidth(submitLabel)
  const available = args.columns - reserved

  const headers = args.questions.map(
    (question, index) => question?.header || `Q${index + 1}`,
  )

  if (available <= 0) {
    return headers.map((header, index) =>
      index === args.currentQuestionIndex ? header.slice(0, 3) : '',
    )
  }

  const total = headers.reduce(
    (sum, header) => sum + 4 + getCachedStringWidth(header),
    0,
  )
  if (total <= available) return headers

  const currentHeader = headers[args.currentQuestionIndex] ?? ''
  const currentTabWidth = 4 + getCachedStringWidth(currentHeader)
  const currentBudget = Math.min(currentTabWidth, Math.floor(available / 2))
  const remaining = available - currentBudget
  const otherCount = args.questions.length - 1
  const otherBudget = Math.max(
    6,
    Math.floor(remaining / Math.max(otherCount, 1)),
  )

  return headers.map((header, index) => {
    const labelBudget =
      (index === args.currentQuestionIndex ? currentBudget : otherBudget) - 4
    if (getCachedStringWidth(header) <= labelBudget) return header

    const truncated = truncateWithEllipsis(header, labelBudget)
    if (index === args.currentQuestionIndex) return truncated
    if (truncated.length > 1) return truncated
    return truncateWithEllipsis(header[0] ?? header, labelBudget)
  })
}

export function formatMultiSelectAnswer(
  selectedValues: string[],
  otherText: string,
): string {
  const selections = selectedValues.filter(value => value !== '__other__')
  const trimmedOther = otherText.trim()
  if (selectedValues.includes('__other__') && trimmedOther) {
    selections.push(trimmedOther)
  }
  return selections.join(', ')
}

export function getTrimmedOtherAnswer(otherText: string): string | null {
  const trimmed = otherText.trim()
  return trimmed.length > 0 ? trimmed : null
}
