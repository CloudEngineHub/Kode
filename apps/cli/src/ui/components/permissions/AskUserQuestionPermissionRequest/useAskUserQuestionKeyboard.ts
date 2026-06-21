import { useEffect, useRef } from 'react'
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
  const questionStatesRef = useRef(args.questionStates)
  const answersRef = useRef(args.answers)
  const currentQuestionIndexRef = useRef(args.currentQuestionIndex)
  const focusedOptionIndexRef = useRef(args.focusedOptionIndex)
  const isMultiSelectSubmitFocusedRef = useRef(args.isMultiSelectSubmitFocused)

  useEffect(() => {
    questionStatesRef.current = args.questionStates
  }, [args.questionStates])

  useEffect(() => {
    answersRef.current = args.answers
  }, [args.answers])

  useEffect(() => {
    currentQuestionIndexRef.current = args.currentQuestionIndex
  }, [args.currentQuestionIndex])

  useEffect(() => {
    focusedOptionIndexRef.current = args.focusedOptionIndex
  }, [args.focusedOptionIndex])

  useEffect(() => {
    isMultiSelectSubmitFocusedRef.current = args.isMultiSelectSubmitFocused
  }, [args.isMultiSelectSubmitFocused])

  const setCurrentQuestionIndex = (next: React.SetStateAction<number>) => {
    const prev = currentQuestionIndexRef.current
    const resolved = typeof next === 'function' ? next(prev) : next
    currentQuestionIndexRef.current = resolved
    args.setCurrentQuestionIndex(resolved)
  }

  const setFocusedOptionIndex = (next: React.SetStateAction<number>) => {
    const prev = focusedOptionIndexRef.current
    const resolved = typeof next === 'function' ? next(prev) : next
    focusedOptionIndexRef.current = resolved
    args.setFocusedOptionIndex(resolved)
  }

  const setIsMultiSelectSubmitFocused = (
    next: React.SetStateAction<boolean>,
  ) => {
    const prev = isMultiSelectSubmitFocusedRef.current
    const resolved = typeof next === 'function' ? next(prev) : next
    isMultiSelectSubmitFocusedRef.current = resolved
    args.setIsMultiSelectSubmitFocused(resolved)
  }

  const setQuestionState = (
    questionText: string,
    next: Partial<QuestionState>,
    isMultiSelect: boolean,
  ) => {
    const prev = questionStatesRef.current
    const existing = prev[questionText]
    const selectedValue =
      next.selectedValue ??
      existing?.selectedValue ??
      (isMultiSelect ? ([] as string[]) : '')
    const textInputValue = next.textInputValue ?? existing?.textInputValue ?? ''
    const updated = {
      ...prev,
      [questionText]: { selectedValue, textInputValue },
    }
    questionStatesRef.current = updated
    args.setQuestionStates(updated)
  }

  const setAnswer = (
    questionText: string,
    answer: string,
    shouldAdvance: boolean,
  ) => {
    const updated = { ...answersRef.current, [questionText]: answer }
    answersRef.current = updated
    args.setAnswers(updated)
    if (shouldAdvance) {
      setCurrentQuestionIndex(prev => prev + 1)
      setFocusedOptionIndex(0)
    }
  }

  useKeypress((input, key) => {
    const currentQuestionIndex = currentQuestionIndexRef.current
    const focusedOptionIndex = focusedOptionIndexRef.current
    const multiSelectSubmitFocused = isMultiSelectSubmitFocusedRef.current

    const currentQuestion = args.questions[currentQuestionIndex]
    const isSubmitTab = currentQuestionIndex === args.questions.length

    if (key.escape) {
      args.onCancel()
      return true
    }

    const isMultiSelectQuestion =
      Boolean(currentQuestion?.multiSelect) && !isSubmitTab
    const isOtherFocused =
      !isSubmitTab &&
      currentQuestion &&
      !multiSelectSubmitFocused &&
      focusedOptionIndex === currentQuestion.options.length
    const isInTextInput = isOtherFocused
    const allowQuestionTabNav = !(isInTextInput && !isSubmitTab)

    if (!key.return && allowQuestionTabNav) {
      const prevQuestion =
        key.leftArrow || (!isMultiSelectQuestion && key.shift && key.tab)
      const nextQuestion =
        key.rightArrow || (!isMultiSelectQuestion && key.tab && !key.shift)

      if (prevQuestion && currentQuestionIndex > 0) {
        setCurrentQuestionIndex(prev => Math.max(0, prev - 1))
        setFocusedOptionIndex(0)
        setIsMultiSelectSubmitFocused(false)
        return
      }

      if (nextQuestion && currentQuestionIndex < args.maxTabIndex) {
        setCurrentQuestionIndex(prev => Math.min(args.maxTabIndex, prev + 1))
        setFocusedOptionIndex(0)
        setIsMultiSelectSubmitFocused(false)
        return
      }
    }

    if (isSubmitTab) return
    if (!currentQuestion) return

    const optionCount = currentQuestion.options.length + 1 // + Other
    const questionText = currentQuestion.question

    if (currentQuestion.multiSelect) {
      if (isOtherFocused) {
        if (key.backspace || key.delete) {
          const existing =
            questionStatesRef.current[questionText]?.textInputValue ?? ''
          const nextText = existing.slice(0, -1)
          const existingSelected =
            questionStatesRef.current[questionText]?.selectedValue
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
          const updated = {
            ...answersRef.current,
            [questionText]: formatMultiSelectAnswer(nextSelected, nextText),
          }
          answersRef.current = updated
          args.setAnswers(updated)
          return
        }

        if (isTextInputChar(input, key)) {
          const existing =
            questionStatesRef.current[questionText]?.textInputValue ?? ''
          const nextText = existing + input
          const existingSelected =
            questionStatesRef.current[questionText]?.selectedValue
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
          const updated = {
            ...answersRef.current,
            [questionText]: formatMultiSelectAnswer(nextSelected, nextText),
          }
          answersRef.current = updated
          args.setAnswers(updated)
          return
        }
      }

      if (key.downArrow || key.upArrow || key.tab) {
        const next = applyMultiSelectNav({
          state: {
            focusedOptionIndex,
            isSubmitFocused: multiSelectSubmitFocused,
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
          next.focusedOptionIndex !== focusedOptionIndex ||
          next.isSubmitFocused !== multiSelectSubmitFocused
        ) {
          setFocusedOptionIndex(next.focusedOptionIndex)
          setIsMultiSelectSubmitFocused(next.isSubmitFocused)
        }
        return
      }

      if (multiSelectSubmitFocused && (key.return || input === ' ')) {
        setCurrentQuestionIndex(prev => prev + 1)
        setFocusedOptionIndex(0)
        setIsMultiSelectSubmitFocused(false)
        return
      }

      if (key.return || (input === ' ' && !isOtherFocused)) {
        const existing = args.questionStates[questionText]?.selectedValue
        const selected = Array.isArray(existing) ? existing : []
        const value = isOtherFocused
          ? '__other__'
          : currentQuestion.options[focusedOptionIndex]?.label
        if (!value) return

        const next = selected.includes(value)
          ? selected.filter(v => v !== value)
          : [...selected, value]

        setQuestionState(questionText, { selectedValue: next }, true)

        const otherText =
          questionStatesRef.current[questionText]?.textInputValue ?? ''
        const updated = {
          ...answersRef.current,
          [questionText]: formatMultiSelectAnswer(next, otherText),
        }
        answersRef.current = updated
        args.setAnswers(updated)
      }
      return
    }

    if (isOtherFocused) {
      if (key.backspace || key.delete) {
        const existing =
          questionStatesRef.current[questionText]?.textInputValue ?? ''
        setQuestionState(
          questionText,
          { textInputValue: existing.slice(0, -1) },
          false,
        )
        return
      }

      if (isTextInputChar(input, key)) {
        const existing =
          questionStatesRef.current[questionText]?.textInputValue ?? ''
        setQuestionState(
          questionText,
          { textInputValue: existing + input },
          false,
        )
        return
      }
    }

    if (key.downArrow || key.upArrow) {
      setFocusedOptionIndex(prev =>
        applySingleSelectNav({
          focusedOptionIndex: prev,
          key: { downArrow: key.downArrow, upArrow: key.upArrow },
          optionCount,
        }),
      )
      return
    }

    if (!key.return) return

    const isSelectingOther =
      focusedOptionIndex === currentQuestion.options.length

    if (isSelectingOther) {
      const otherText =
        questionStatesRef.current[questionText]?.textInputValue ?? ''
      const trimmed = getTrimmedOtherAnswer(otherText)
      if (!trimmed) return

      const selectedValue = '__other__'
      setQuestionState(questionText, { selectedValue }, false)

      if (args.hideSubmitTab) {
        args.onAllowWithAnswers({
          ...answersRef.current,
          [questionText]: trimmed,
        })
        return
      }

      setAnswer(questionText, trimmed, true)
      return
    }

    const selectedValue = currentQuestion.options[focusedOptionIndex]?.label
    if (!selectedValue) return

    setQuestionState(questionText, { selectedValue }, false)

    if (args.hideSubmitTab) {
      args.onAllowWithAnswers({
        ...answersRef.current,
        [questionText]: selectedValue,
      })
      return
    }

    setAnswer(questionText, selectedValue, true)
  })
}
