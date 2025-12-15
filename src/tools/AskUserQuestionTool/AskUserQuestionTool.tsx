import { Box, Text } from 'ink'
import { useInput } from 'ink'
import React, { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { Cost } from '@components/Cost'
import { FallbackToolUseRejectedMessage } from '@components/FallbackToolUseRejectedMessage'
import { Tool } from '@tool'
import { DESCRIPTION, PROMPT, TOOL_NAME_FOR_PROMPT } from './prompt'
import type { ExtendedToolUseContext } from '@tool'

const optionSchema = z.strictObject({
  label: z.string(),
  description: z.string(),
})

const questionSchema = z.strictObject({
  question: z.string(),
  header: z.string().max(12),
  options: z.array(optionSchema).min(2).max(4),
  multiSelect: z.boolean(),
})

const inputSchema = z.strictObject({
  questions: z.array(questionSchema).min(1).max(4),
  // Claude Code permission UI may populate this field; accept it for parity.
  answers: z.record(z.string()).optional(),
})

type Input = z.infer<typeof inputSchema>
type Output = {
  questions: Input['questions']
  answers: Record<string, string>
}

type Question = Input['questions'][number]

function AskUserQuestionForm({
  questions,
  initialAnswers,
  onDone,
  onCancel,
}: {
  questions: Question[]
  initialAnswers?: Record<string, string>
  onDone: (answers: Record<string, string>) => void
  onCancel: () => void
}) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>(
    initialAnswers ?? {},
  )
  const [otherDraft, setOtherDraft] = useState('')
  const [isOtherInput, setIsOtherInput] = useState(false)
  const [multiSelected, setMultiSelected] = useState<string[]>([])

  const current = questions[index]

  useEffect(() => {
    if (!current) {
      onDone(answers)
    } else {
      setOtherDraft('')
      setIsOtherInput(false)
      setMultiSelected([])
    }
  }, [current, answers, onDone])

  useInput((input, key) => {
    if (key.escape) {
      if (isOtherInput) {
        setIsOtherInput(false)
        setOtherDraft('')
        return
      }
      onCancel()
      return
    }

    if (!isOtherInput) return

    if (key.return) {
      const text = otherDraft.trim()
      if (!text) return

      if (current?.multiSelect) {
        setMultiSelected(prev =>
          prev.includes(text) ? prev : [...prev, text],
        )
        setIsOtherInput(false)
        setOtherDraft('')
        return
      }

      setAnswers(prev => ({ ...prev, [current!.question]: text }))
      setIndex(prev => prev + 1)
      return
    }

    if (key.backspace || key.delete) {
      setOtherDraft(prev => prev.slice(0, -1))
      return
    }

    if (typeof input === 'string' && input.length === 1 && !key.ctrl) {
      setOtherDraft(prev => prev + input)
    }
  })

  const options = useMemo(() => {
    if (!current) return []
    const base = current.options.map(o => o.label)
    if (current.multiSelect) {
      return [...base, 'Other', 'Done']
    }
    return [...base, 'Other']
  }, [current])

  if (!current) {
    return null
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box marginBottom={1} flexDirection="column">
        <Text bold>
          {current.header}: {current.question}
        </Text>
        {current.multiSelect && (
          <Text dimColor>
            Selected: {multiSelected.length ? multiSelected.join(', ') : '(none)'}
          </Text>
        )}
      </Box>

      {isOtherInput ? (
        <Box flexDirection="column">
          <Text dimColor>Other (type and press Enter):</Text>
          <Text>
            {otherDraft}
            <Text color="gray">▌</Text>
          </Text>
          <Text dimColor>Esc to go back</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {options.map(label => {
            const isSelected =
              current.multiSelect &&
              label !== 'Other' &&
              label !== 'Done' &&
              multiSelected.includes(label)
            return (
              <React.Fragment key={label}>
                <Text>
                  {current.multiSelect ? (isSelected ? '[x] ' : '[ ] ') : '- '}
                  {label}
                </Text>
              </React.Fragment>
            )
          })}
          <Text dimColor>
            {current.multiSelect
              ? 'Use this menu to toggle options; type "Done" to continue'
              : 'Type an option label to select'}
          </Text>
        </Box>
      )}

      {!isOtherInput && (
        <SelectInput
          options={options}
          onSelect={value => {
            if (value === 'Other') {
              setIsOtherInput(true)
              return
            }

            if (current.multiSelect) {
              if (value === 'Done') {
                const final = multiSelected.join(', ')
                setAnswers(prev => ({ ...prev, [current.question]: final }))
                setIndex(prev => prev + 1)
                return
              }

              setMultiSelected(prev =>
                prev.includes(value)
                  ? prev.filter(v => v !== value)
                  : [...prev, value],
              )
              return
            }

            setAnswers(prev => ({ ...prev, [current.question]: value }))
            setIndex(prev => prev + 1)
          }}
        />
      )}
    </Box>
  )
}

function SelectInput({
  options,
  onSelect,
}: {
  options: string[]
  onSelect: (value: string) => void
}) {
  const [buffer, setBuffer] = useState('')

  useInput((input, key) => {
    if (key.return) {
      const trimmed = buffer.trim()
      if (!trimmed) return
      const match = options.find(o => o.toLowerCase() === trimmed.toLowerCase())
      if (match) {
        setBuffer('')
        onSelect(match)
      }
      return
    }
    if (key.backspace || key.delete) {
      setBuffer(prev => prev.slice(0, -1))
      return
    }
    if (key.escape) {
      setBuffer('')
      return
    }
    if (typeof input === 'string' && input.length === 1 && !key.ctrl) {
      setBuffer(prev => prev + input)
    }
  })

  return (
    <Box marginTop={1} flexDirection="column">
      <Text dimColor>Selection (type label + Enter, Esc clears):</Text>
      <Text>
        {buffer}
        <Text color="gray">▌</Text>
      </Text>
    </Box>
  )
}

export const AskUserQuestionTool = {
  name: TOOL_NAME_FOR_PROMPT,
  async description() {
    return DESCRIPTION
  },
  userFacingName() {
    return ''
  },
  inputSchema,
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  async isEnabled() {
    return true
  },
  needsPermissions() {
    return true
  },
  requiresUserInteraction() {
    return true
  },
  async prompt() {
    return PROMPT
  },
  renderToolUseMessage({ questions }: Input) {
    return `Ask user ${questions.length} question(s)`
  },
  renderToolUseRejectedMessage() {
    return <FallbackToolUseRejectedMessage />
  },
  renderToolResultMessage(output: Output) {
    return (
      <Box justifyContent="space-between" width="100%">
        <Box flexDirection="row">
          <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
          <Text bold>Asked user questions</Text>
        </Box>
        <Cost costUSD={0} durationMs={0} debug={false} />
      </Box>
    )
  },
  renderResultForAssistant(output: Output) {
    const formatted = Object.entries(output.answers)
      .map(([question, answer]) => `"${question}"="${answer}"`)
      .join(', ')
    return `User has answered your questions: ${formatted}. You can now continue with the user's answers in mind.`
  },
  async *call({ questions, answers: prefilled }: Input, context: any) {
    // If the UI layer already collected answers, just return them.
    if (prefilled && Object.keys(prefilled).length > 0) {
      const output: Output = { questions, answers: prefilled }
      yield { type: 'result', data: output, resultForAssistant: this.renderResultForAssistant(output) }
      return
    }

    const uiContext = context as ExtendedToolUseContext
    if (typeof uiContext.setToolJSX !== 'function') {
      const output: Output = { questions, answers: {} }
      yield { type: 'result', data: output, resultForAssistant: this.renderResultForAssistant(output) }
      return
    }

    const collected = await new Promise<Record<string, string>>(resolve => {
      uiContext.setToolJSX({
        jsx: (
          <AskUserQuestionForm
            questions={questions}
            onDone={resolve}
            onCancel={() => resolve({})}
          />
        ),
        shouldHidePromptInput: true,
      })
    })

    uiContext.setToolJSX(null)

    const output: Output = { questions, answers: collected }
    yield { type: 'result', data: output, resultForAssistant: this.renderResultForAssistant(output) }
  },
} satisfies Tool<typeof inputSchema, Output>
