import type React from 'react'
import { useKeypress } from '#ui-ink/hooks/useKeypress'

import {
  applyMultiSelectNav,
  applySingleSelectNav,
  formatMultiSelectAnswer,
  getTrimmedOtherAnswer,
  isTextInputChar,
} from './utils'
import type { Question, QuestionState } from './types'

export function useAskUserQuestionKeyboard(args: {
  questions: Question[]
  currentQuestionIndex: number
  setCurrentQuestionIndex: React.Dispatch<React.SetStateAction<number>>
  focusedOptionIndex: number
  setFocusedOptionIndex: React.Dispatch<React.SetStateAction<number>>
  isMultiSelectSubmitFocused: boolean
  setIsMultiSelectSubmitFocused: React.Dispatch<React.SetStateAction<boolean>>
  answers: Record<string, string>
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>
  questionStates: Record<string, QuestionState>
  setQuestionStates: React.Dispatch<
    React.SetStateAction<Record<string, QuestionState>>
  >
  maxTabIndex: number
  hideSubmitTab: boolean
  onCancel: () => void
  onAllowWithAnswers: (answers: Record<string, string>) => void
}): void {
  const currentQuestion = args.questions[args.currentQuestionIndex]
  const isSubmitTab = args.currentQuestionIndex === args.questions.length

  const setQuestionState = (
    questionText: string,
    next: Partial<QuestionState>,
    isMultiSelect: boolean,
  ) => {
    args.setQuestionStates(prev => {
      const existing = prev[questionText]
      const selectedValue =
        next.selectedValue ??
        existing?.selectedValue ??
        (isMultiSelect ? ([] as string[]) : '')
      const textInputValue =
        next.textInputValue ?? existing?.textInputValue ?? ''
      return {
        ...prev,
        [questionText]: { selectedValue, textInputValue },
      }
    })
  }

  const setAnswer = (
    questionText: string,
    answer: string,
    shouldAdvance: boolean,
  ) => {
    args.setAnswers(prev => ({ ...prev, [questionText]: answer }))
    if (shouldAdvance) {
      args.setCurrentQuestionIndex(prev => prev + 1)
      args.setFocusedOptionIndex(0)
    }
  }

  useKeypress((input, key) => {
    if (key.escape) {
      args.onCancel()
      return true
    }

    const isMultiSelectQuestion =
      Boolean(currentQuestion?.multiSelect) && !isSubmitTab
    const isOtherFocused =
      !isSubmitTab &&
      currentQuestion &&
      !args.isMultiSelectSubmitFocused &&
      args.focusedOptionIndex === currentQuestion.options.length
    const isInTextInput = isOtherFocused
    const allowQuestionTabNav = !(isInTextInput && !isSubmitTab)

    if (!key.return && allowQuestionTabNav) {
      const prevQuestion =
        key.leftArrow || (!isMultiSelectQuestion && key.shift && key.tab)
      const nextQuestion =
        key.rightArrow || (!isMultiSelectQuestion && key.tab && !key.shift)

      if (prevQuestion && args.currentQuestionIndex > 0) {
        args.setCurrentQuestionIndex(prev => Math.max(0, prev - 1))
        args.setFocusedOptionIndex(0)
        args.setIsMultiSelectSubmitFocused(false)
        return
      }

      if (nextQuestion && args.currentQuestionIndex < args.maxTabIndex) {
        args.setCurrentQuestionIndex(prev =>
          Math.min(args.maxTabIndex, prev + 1),
        )
        args.setFocusedOptionIndex(0)
        args.setIsMultiSelectSubmitFocused(false)
        return
      }
    }

    if (isSubmitTab) return
    if (!currentQuestion) return

    const optionCount = currentQuestion.options.length + 1 // + Other
    const questionText = currentQuestion.question

    if (currentQuestion.multiSelect) {
      if (key.downArrow || key.upArrow || key.tab) {
        const next = applyMultiSelectNav({
          state: {
            focusedOptionIndex: args.focusedOptionIndex,
            isSubmitFocused: args.isMultiSelectSubmitFocused,
          },
          key: {
            downArrow: key.downArrow,
            upArrow: key.upArrow,
            tab: key.tab,
            shift: key.shift,
          },
          optionCount,
        })

        if (
          next.focusedOptionIndex !== args.focusedOptionIndex ||
          next.isSubmitFocused !== args.isMultiSelectSubmitFocused
        ) {
          args.setFocusedOptionIndex(next.focusedOptionIndex)
          args.setIsMultiSelectSubmitFocused(next.isSubmitFocused)
        }
        return
      }

      if (args.isMultiSelectSubmitFocused && (key.return || input === ' ')) {
        args.setCurrentQuestionIndex(prev => prev + 1)
        args.setFocusedOptionIndex(0)
        args.setIsMultiSelectSubmitFocused(false)
        return
      }

      if (isOtherFocused) {
        if (key.backspace || key.delete) {
          const existing =
            args.questionStates[questionText]?.textInputValue ?? ''
          const nextText = existing.slice(0, -1)
          const existingSelected =
            args.questionStates[questionText]?.selectedValue
          const selected = Array.isArray(existingSelected)
            ? existingSelected
            : []
          const trimmed = nextText.trim()
          const nextSelected = trimmed
            ? selected.includes('__other__')
              ? selected
              : [...selected, '__other__']
            : selected.filter(v => v !== '__other__')

          setQuestionState(
            questionText,
            { textInputValue: nextText, selectedValue: nextSelected },
            true,
          )
          args.setAnswers(prev => ({
            ...prev,
            [questionText]: formatMultiSelectAnswer(nextSelected, nextText),
          }))
          return
        }

        if (isTextInputChar(input, key)) {
          const existing =
            args.questionStates[questionText]?.textInputValue ?? ''
          const nextText = existing + input
          const existingSelected =
            args.questionStates[questionText]?.selectedValue
          const selected = Array.isArray(existingSelected)
            ? existingSelected
            : []
          const trimmed = nextText.trim()
          const nextSelected = trimmed
            ? selected.includes('__other__')
              ? selected
              : [...selected, '__other__']
            : selected.filter(v => v !== '__other__')

          setQuestionState(
            questionText,
            { textInputValue: nextText, selectedValue: nextSelected },
            true,
          )
          args.setAnswers(prev => ({
            ...prev,
            [questionText]: formatMultiSelectAnswer(nextSelected, nextText),
          }))
          return
        }
      }

      if (key.return || (input === ' ' && !isOtherFocused)) {
        const existing = args.questionStates[questionText]?.selectedValue
        const selected = Array.isArray(existing) ? existing : []
        const value = isOtherFocused
          ? '__other__'
          : currentQuestion.options[args.focusedOptionIndex]?.label
        if (!value) return

        const next = selected.includes(value)
          ? selected.filter(v => v !== value)
          : [...selected, value]

        setQuestionState(questionText, { selectedValue: next }, true)

        const otherText =
          args.questionStates[questionText]?.textInputValue ?? ''
        args.setAnswers(prev => ({
          ...prev,
          [questionText]: formatMultiSelectAnswer(next, otherText),
        }))
      }
      return
    }

    if (key.downArrow || key.upArrow) {
      args.setFocusedOptionIndex(prev =>
        applySingleSelectNav({
          focusedOptionIndex: prev,
          key: { downArrow: key.downArrow, upArrow: key.upArrow },
          optionCount,
        }),
      )
      return
    }

    if (isOtherFocused) {
      if (key.backspace || key.delete) {
        const existing = args.questionStates[questionText]?.textInputValue ?? ''
        setQuestionState(
          questionText,
          { textInputValue: existing.slice(0, -1) },
          false,
        )
        return
      }

      if (isTextInputChar(input, key)) {
        const existing = args.questionStates[questionText]?.textInputValue ?? ''
        setQuestionState(
          questionText,
          { textInputValue: existing + input },
          false,
        )
        return
      }
    }

    if (!key.return) return

    const isSelectingOther =
      args.focusedOptionIndex === currentQuestion.options.length

    if (isSelectingOther) {
      const otherText = args.questionStates[questionText]?.textInputValue ?? ''
      const trimmed = getTrimmedOtherAnswer(otherText)
      if (!trimmed) return

      const selectedValue = '__other__'
      setQuestionState(questionText, { selectedValue }, false)

      if (args.hideSubmitTab) {
        args.onAllowWithAnswers({ ...args.answers, [questionText]: trimmed })
        return
      }

      setAnswer(questionText, trimmed, true)
      return
    }

    const selectedValue =
      currentQuestion.options[args.focusedOptionIndex]?.label
    if (!selectedValue) return

    setQuestionState(questionText, { selectedValue }, false)

    if (args.hideSubmitTab) {
      args.onAllowWithAnswers({
        ...args.answers,
        [questionText]: selectedValue,
      })
      return
    }

    setAnswer(questionText, selectedValue, true)
  })
}
