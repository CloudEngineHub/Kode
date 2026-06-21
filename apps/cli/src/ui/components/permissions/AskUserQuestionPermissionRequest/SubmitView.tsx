import React from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'

import type { Theme } from '#core/utils/theme'
import { Select } from '#ui-ink/components/CustomSelect/select'

import type { Question } from './types'

export function AskUserQuestionSubmitView(props: {
  theme: Theme
  questions: Question[]
  answers: Record<string, string>
  allQuestionsAnswered: boolean
  onCancel: () => void
  onSubmit: () => void
}): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Text bold>Review your answers</Text>
      {!props.allQuestionsAnswered && (
        <Box marginTop={1}>
          <Text color={props.theme.warning}>
            {figures.warning} You have not answered all questions
          </Text>
        </Box>
      )}
      <Box flexDirection="column" marginTop={1}>
        {props.questions
          .filter(q => q?.question && props.answers[q.question])
          .map(q => (
            <Box key={q.question} flexDirection="column" marginLeft={1}>
              <Text>
                {figures.bullet} {q.question}
              </Text>
              <Box marginLeft={2}>
                <Text color={props.theme.success}>
                  {figures.arrowRight} {props.answers[q.question]}
                </Text>
              </Box>
            </Box>
          ))}
      </Box>

      <Box marginTop={1}>
        <Text color={props.theme.secondaryText}>
          Ready to submit your answers?
        </Text>
      </Box>

      <Box marginTop={1}>
        <Select
          options={[
            { label: 'Submit answers', value: 'submit' },
            { label: 'Cancel', value: 'cancel' },
          ]}
          onChange={value => {
            if (value === 'cancel') {
              props.onCancel()
              return
            }
            if (value === 'submit') {
              props.onSubmit()
            }
          }}
        />
      </Box>
    </Box>
  )
}
