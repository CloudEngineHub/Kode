import React from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'

import type { Theme } from '#core/utils/theme'

import type { Question } from './types'

export function AskUserQuestionTabs(props: {
  theme: Theme
  questions: Question[]
  currentQuestionIndex: number
  maxTabIndex: number
  hideSubmitTab: boolean
  tabHeaders: string[]
  answers: Record<string, string>
}): React.ReactNode {
  const inverseText = props.theme.text === '#fff' ? '#000' : '#fff'
  const showArrows = !(props.questions.length === 1 && props.hideSubmitTab)
  const isSubmitTab = props.currentQuestionIndex === props.questions.length
  const rightArrowInactive = props.currentQuestionIndex === props.maxTabIndex

  return (
    <Box flexDirection="row" marginBottom={1}>
      {showArrows && (
        <Text
          color={
            props.currentQuestionIndex === 0
              ? props.theme.secondaryText
              : undefined
          }
        >
          ←{' '}
        </Text>
      )}
      {props.questions.map((question, index) => {
        const isSelected = index === props.currentQuestionIndex
        const checkbox =
          question.question && props.answers[question.question]
            ? figures.checkboxOn
            : figures.checkboxOff
        const headerText =
          props.tabHeaders[index] ?? question.header ?? `Q${index + 1}`
        const tabText = ` ${checkbox} ${headerText} `

        return (
          <React.Fragment key={question.question || `question-${index}`}>
            <Text
              backgroundColor={isSelected ? props.theme.permission : undefined}
              color={isSelected ? inverseText : undefined}
            >
              {tabText}
            </Text>
          </React.Fragment>
        )
      })}
      {!props.hideSubmitTab && (
        <Text
          backgroundColor={isSubmitTab ? props.theme.permission : undefined}
          color={isSubmitTab ? inverseText : undefined}
        >
          {' '}
          {figures.tick} Submit{' '}
        </Text>
      )}
      {showArrows && (
        <Text
          color={rightArrowInactive ? props.theme.secondaryText : undefined}
        >
          {' '}
          →
        </Text>
      )}
    </Box>
  )
}
