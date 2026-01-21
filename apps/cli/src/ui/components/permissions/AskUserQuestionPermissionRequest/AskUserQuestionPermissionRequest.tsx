import React, { useCallback, useMemo, useState } from 'react'
import { Box, Text } from 'ink'
import { getTheme } from '#core/utils/theme'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import type { PermissionRequestProps } from '#ui-ink/components/permissions/PermissionRequest'
import { AskUserQuestionTool } from '#tools/tools/interaction/AskUserQuestionTool/AskUserQuestionTool'
import { AskUserQuestionTabs } from './QuestionTabs'
import { AskUserQuestionView } from './QuestionView'
import { AskUserQuestionSubmitView } from './SubmitView'
import { useAskUserQuestionKeyboard } from './useAskUserQuestionKeyboard'
import type { Question, QuestionState } from './types'
import { getTabHeaders } from './utils'

export {
  applyMultiSelectNav as __applyMultiSelectNavForTests,
  applySingleSelectNav as __applySingleSelectNavForTests,
  formatMultiSelectAnswer as __formatMultiSelectAnswerForTests,
  getTabHeaders as __getTabHeadersForTests,
  getTrimmedOtherAnswer as __getTrimmedOtherAnswerForTests,
  isTextInputChar as __isTextInputCharForTests,
} from './utils'

export function AskUserQuestionPermissionRequest({
  toolUseConfirm,
  onDone,
}: PermissionRequestProps): React.ReactNode {
  const theme = getTheme()
  const { columns } = useTerminalSize()

  const parsed = useMemo(() => {
    const result = AskUserQuestionTool.inputSchema.safeParse(
      toolUseConfirm.input,
    )
    if (!result.success)
      return {
        questions: [] as Question[],
      }
    return {
      questions: (result.data.questions as Question[]) ?? [],
    }
  }, [toolUseConfirm.input])

  const questions = parsed.questions

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [focusedOptionIndex, setFocusedOptionIndex] = useState(0)
  const [isMultiSelectSubmitFocused, setIsMultiSelectSubmitFocused] =
    useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [questionStates, setQuestionStates] = useState<
    Record<string, QuestionState>
  >({})

  const currentQuestion = questions[currentQuestionIndex]
  const isSubmitTab = currentQuestionIndex === questions.length
  const hideSubmitTab = questions.length === 1 && !questions[0]?.multiSelect

  const maxTabIndex = hideSubmitTab
    ? Math.max(0, questions.length - 1)
    : questions.length
  const tabHeaders = useMemo(
    () =>
      getTabHeaders({
        questions,
        currentQuestionIndex,
        columns,
        hideSubmitTab,
      }),
    [questions, currentQuestionIndex, columns, hideSubmitTab],
  )

  const activeQuestionState: QuestionState | undefined =
    currentQuestion?.question
      ? questionStates[currentQuestion.question]
      : undefined
  const isOtherFocused =
    !isSubmitTab &&
    currentQuestion &&
    !isMultiSelectSubmitFocused &&
    focusedOptionIndex === currentQuestion.options.length

  const cancel = useCallback(() => {
    toolUseConfirm.onReject()
    onDone()
  }, [toolUseConfirm, onDone])

  const allowWithAnswers = useCallback(
    (nextAnswers: Record<string, string>) => {
      const toolUseId =
        toolUseConfirm.toolUseContext.toolUseId ??
        toolUseConfirm.toolUseContext.messageId
      const options = (toolUseConfirm.toolUseContext.options ??= {})
      if (toolUseId) {
        options.askUserQuestionAnswersByToolUseId ??= {}
        options.askUserQuestionAnswersByToolUseId[toolUseId] = nextAnswers
      } else {
        options.askUserQuestionAnswers = nextAnswers
      }
      toolUseConfirm.onAllow('temporary')
      onDone()
    },
    [toolUseConfirm, onDone],
  )

  useAskUserQuestionKeyboard({
    questions,
    currentQuestionIndex,
    setCurrentQuestionIndex,
    focusedOptionIndex,
    setFocusedOptionIndex,
    isMultiSelectSubmitFocused,
    setIsMultiSelectSubmitFocused,
    answers,
    setAnswers,
    questionStates,
    setQuestionStates,
    maxTabIndex,
    hideSubmitTab,
    onCancel: cancel,
    onAllowWithAnswers: next => allowWithAnswers(next),
  })

  const allQuestionsAnswered =
    questions.every(q => q?.question && Boolean(answers[q.question])) ?? false

  if (questions.length === 0) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.error}>Invalid AskUserQuestion input.</Text>
        <Text dimColor>Esc to cancel.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box
        borderTop
        borderColor={theme.secondaryText}
        flexDirection="column"
        paddingTop={0}
      >
        <AskUserQuestionTabs
          theme={theme}
          questions={questions}
          currentQuestionIndex={currentQuestionIndex}
          maxTabIndex={maxTabIndex}
          hideSubmitTab={hideSubmitTab}
          tabHeaders={tabHeaders}
          answers={answers}
        />

        {!isSubmitTab && currentQuestion && (
          <AskUserQuestionView
            theme={theme}
            question={currentQuestion}
            questionState={activeQuestionState}
            otherText={
              questionStates[currentQuestion.question]?.textInputValue ?? ''
            }
            focusedOptionIndex={focusedOptionIndex}
            isOtherFocused={isOtherFocused}
            isMultiSelectSubmitFocused={isMultiSelectSubmitFocused}
            isLastQuestion={currentQuestionIndex === questions.length - 1}
          />
        )}

        {isSubmitTab && (
          <AskUserQuestionSubmitView
            theme={theme}
            questions={questions}
            answers={answers}
            allQuestionsAnswered={allQuestionsAnswered}
            onCancel={cancel}
            onSubmit={() => allowWithAnswers(answers)}
          />
        )}
      </Box>
    </Box>
  )
}
