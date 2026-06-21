export type Question = {
  question: string
  header: string
  options: { label: string; description: string }[]
  multiSelect: boolean
}

export type QuestionState = {
  selectedValue: string | string[]
  textInputValue: string
}

export type MultiSelectNavState = {
  focusedOptionIndex: number
  isSubmitFocused: boolean
}

export type MultiSelectNavKey = {
  downArrow?: boolean
  upArrow?: boolean
  tab?: boolean
  shift?: boolean
}

export type TextInputKey = {
  ctrl?: boolean
  meta?: boolean
  tab?: boolean
  return?: boolean
}

export type SingleSelectNavKey = {
  downArrow?: boolean
  upArrow?: boolean
}
