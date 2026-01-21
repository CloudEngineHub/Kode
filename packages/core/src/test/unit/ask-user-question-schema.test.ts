import { describe, expect, test } from 'bun:test'
import { AskUserQuestionTool } from '#tools/tools/interaction/AskUserQuestionTool/AskUserQuestionTool'

function makeValidInput(overrides?: Partial<any>) {
  return {
    questions: [
      {
        question: 'Which option?',
        header: 'Header',
        options: [
          { label: 'A', description: 'Option A' },
          { label: 'B', description: 'Option B' },
        ],
        multiSelect: false,
      },
    ],
    ...overrides,
  }
}

describe('AskUserQuestionTool schema parity', () => {
  test('accepts 1-4 questions and 2-4 options', () => {
    expect(
      AskUserQuestionTool.inputSchema.safeParse(makeValidInput()).success,
    ).toBe(true)

    expect(
      AskUserQuestionTool.inputSchema.safeParse(
        makeValidInput({
          questions: Array.from({ length: 4 }, (_, index) => ({
            question: `Q${index}?`,
            header: `H${index}`,
            options: [
              { label: 'A', description: 'A' },
              { label: 'B', description: 'B' },
            ],
            multiSelect: false,
          })),
        }),
      ).success,
    ).toBe(true)

    expect(
      AskUserQuestionTool.inputSchema.safeParse(
        makeValidInput({
          questions: [
            {
              question: 'Q?',
              header: 'H',
              options: [
                { label: 'A', description: 'A' },
                { label: 'B', description: 'B' },
                { label: 'C', description: 'C' },
                { label: 'D', description: 'D' },
              ],
              multiSelect: false,
            },
          ],
        }),
      ).success,
    ).toBe(true)
  })

  test('accepts optional answers and metadata (official schema)', () => {
    expect(
      AskUserQuestionTool.inputSchema.safeParse(
        makeValidInput({
          answers: { 'Which option?': 'A' },
          metadata: { source: 'remember' },
        }),
      ).success,
    ).toBe(true)
  })

  test('rejects out-of-range question counts', () => {
    expect(
      AskUserQuestionTool.inputSchema.safeParse({ questions: [] }).success,
    ).toBe(false)

    expect(
      AskUserQuestionTool.inputSchema.safeParse(
        makeValidInput({
          questions: Array.from({ length: 5 }, (_, index) => ({
            question: `Q${index}?`,
            header: `H${index}`,
            options: [
              { label: 'A', description: 'A' },
              { label: 'B', description: 'B' },
            ],
            multiSelect: false,
          })),
        }),
      ).success,
    ).toBe(false)
  })

  test('rejects out-of-range option counts', () => {
    expect(
      AskUserQuestionTool.inputSchema.safeParse(
        makeValidInput({
          questions: [
            {
              question: 'Q?',
              header: 'H',
              options: [{ label: 'A', description: 'A' }],
              multiSelect: false,
            },
          ],
        }),
      ).success,
    ).toBe(false)

    expect(
      AskUserQuestionTool.inputSchema.safeParse(
        makeValidInput({
          questions: [
            {
              question: 'Q?',
              header: 'H',
              options: [
                { label: 'A', description: 'A' },
                { label: 'B', description: 'B' },
                { label: 'C', description: 'C' },
                { label: 'D', description: 'D' },
                { label: 'E', description: 'E' },
              ],
              multiSelect: false,
            },
          ],
        }),
      ).success,
    ).toBe(false)
  })

  test('does not enforce header length (CLI truncates in UI instead)', () => {
    expect(
      AskUserQuestionTool.inputSchema.safeParse(
        makeValidInput({
          questions: [
            {
              question: 'Q?',
              header: 'This header is definitely longer than 12 chars',
              options: [
                { label: 'A', description: 'A' },
                { label: 'B', description: 'B' },
              ],
              multiSelect: false,
            },
          ],
        }),
      ).success,
    ).toBe(true)
  })

  test('requires unique question texts and option labels', () => {
    expect(
      AskUserQuestionTool.inputSchema.safeParse(
        makeValidInput({
          questions: [
            {
              question: 'Same?',
              header: 'H1',
              options: [
                { label: 'A', description: 'A' },
                { label: 'B', description: 'B' },
              ],
              multiSelect: false,
            },
            {
              question: 'Same?',
              header: 'H2',
              options: [
                { label: 'A', description: 'A' },
                { label: 'B', description: 'B' },
              ],
              multiSelect: false,
            },
          ],
        }),
      ).success,
    ).toBe(false)

    expect(
      AskUserQuestionTool.inputSchema.safeParse(
        makeValidInput({
          questions: [
            {
              question: 'Q?',
              header: 'H',
              options: [
                { label: 'A', description: 'A' },
                { label: 'A', description: 'A2' },
              ],
              multiSelect: false,
            },
          ],
        }),
      ).success,
    ).toBe(false)
  })

  test('ignores unknown keys at the top level and inside nested objects', () => {
    const topLevel = AskUserQuestionTool.inputSchema.safeParse(
      makeValidInput({ extra: 'nope' }),
    )
    expect(topLevel.success).toBe(true)
    if (topLevel.success) {
      expect('extra' in topLevel.data).toBe(false)
    }

    const nested = AskUserQuestionTool.inputSchema.safeParse(
      makeValidInput({
        questions: [
          {
            question: 'Q?',
            header: 'H',
            extraQuestionField: 123,
            options: [
              { label: 'A', description: 'A', extraOptionField: true },
              { label: 'B', description: 'B', extraOptionField: false },
            ],
            multiSelect: false,
          },
        ],
      }),
    )
    expect(nested.success).toBe(true)
    if (nested.success) {
      const q = nested.data.questions[0]
      expect('extraQuestionField' in q).toBe(false)
      expect('extraOptionField' in q.options[0]).toBe(false)
    }
  })

  test('renderResultForAssistant matches expected formatting', () => {
    const result = AskUserQuestionTool.renderResultForAssistant({
      questions: [],
      answers: { 'Q1?': 'A', 'Q2?': 'B, C' },
    })

    expect(result).toBe(
      `User has answered your questions: "Q1?"="A", "Q2?"="B, C". You can now continue with the user's answers in mind.`,
    )
  })
})
