import React from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'

import type { Theme } from '#core/utils/theme'

import type { Question, QuestionState } from './types'

export function AskUserQuestionView(props: {
  theme: Theme
  question: Question
  questionState: QuestionState | undefined
  otherText: string
  focusedOptionIndex: number
  isOtherFocused: boolean
  isMultiSelectSubmitFocused: boolean
  isLastQuestion: boolean
}): React.ReactNode {
  const rawSelected = props.questionState?.selectedValue
  const selectedValues = Array.isArray(rawSelected) ? rawSelected : []
  const otherSelected = props.question.multiSelect
    ? selectedValues.includes('__other__')
    : rawSelected === '__other__'

  const otherPlaceholder = props.question.multiSelect
    ? 'Type something'
    : 'Type something.'
  const otherLine =
    props.otherText.length > 0
      ? props.otherText
      : props.isOtherFocused || otherSelected
        ? otherPlaceholder
        : ''

  return (
    <>
      <Text bold>{props.question.question}</Text>

      <Box flexDirection="column" marginTop={1}>
        {props.question.options.map((option, index) => {
          const isFocused =
            !props.isMultiSelectSubmitFocused &&
            index === props.focusedOptionIndex
          const isSelected = props.question.multiSelect
            ? selectedValues.includes(option.label)
            : rawSelected === option.label
          const pointer = isFocused ? figures.pointer : ' '
          const color = isFocused ? props.theme.kode : props.theme.text
          const indicator = props.question.multiSelect
            ? isSelected
              ? figures.checkboxOn
              : figures.checkboxOff
            : isSelected
              ? figures.tick
              : ' '
          return (
            <Box key={option.label} flexDirection="column">
              <Text color={color}>
                {pointer} {indicator} {option.label}
              </Text>
              <Text color={props.theme.secondaryText}>
                {'  '}
                {option.description}
              </Text>
            </Box>
          )
        })}

        <Box flexDirection="column">
          <Text
            color={props.isOtherFocused ? props.theme.kode : props.theme.text}
          >
            {props.isOtherFocused ? figures.pointer : ' '}{' '}
            {props.question.multiSelect
              ? otherSelected
                ? figures.checkboxOn
                : figures.checkboxOff
              : otherSelected
                ? figures.tick
                : ' '}{' '}
            Other
          </Text>
          {(props.isOtherFocused ||
            otherSelected ||
            props.otherText.trim().length > 0) && (
            <Text color={props.theme.secondaryText}>
              {otherLine}
              {props.isOtherFocused && <Text color="gray">▌</Text>}
            </Text>
          )}
        </Box>

        {props.question.multiSelect && (
          <Box marginTop={0}>
            <Text
              color={
                props.isMultiSelectSubmitFocused
                  ? props.theme.kode
                  : props.theme.text
              }
              bold={props.isMultiSelectSubmitFocused}
            >
              {props.isMultiSelectSubmitFocused ? figures.pointer : ' '}{' '}
              {props.isLastQuestion ? 'Submit' : 'Next'}
            </Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text color={props.theme.secondaryText} dimColor>
            Enter to select · Tab/Arrow keys to navigate · Esc to cancel
          </Text>
        </Box>
      </Box>
    </>
  )
}
