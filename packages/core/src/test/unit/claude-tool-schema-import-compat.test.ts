import { describe, expect, test } from 'bun:test'
import { TaskTool } from '#tools/tools/ai/TaskTool/TaskTool'
import { AskUserQuestionTool } from '#tools/tools/interaction/AskUserQuestionTool/AskUserQuestionTool'
import { SkillTool } from '#tools/tools/interaction/SkillTool/SkillTool'
import { WebFetchTool } from '#tools/tools/network/WebFetchTool/WebFetchTool'
import { WebSearchTool } from '#tools/tools/search/WebSearchTool/WebSearchTool'
import { BashTool } from '#tools/tools/system/BashTool/BashTool'

describe('Claude transcript import schema compatibility', () => {
  test('WebSearchTool accepts 1-char queries', () => {
    expect(WebSearchTool.inputSchema.safeParse({ query: 'a' }).success).toBe(
      true,
    )
  })

  test('WebFetchTool accepts URL as plain string (schema-level)', () => {
    expect(
      WebFetchTool.inputSchema.safeParse({
        url: 'example.com',
        prompt: 'Summarize',
      }).success,
    ).toBe(true)
  })

  test('AskUserQuestionTool accepts answers/metadata fields', () => {
    expect(
      AskUserQuestionTool.inputSchema.safeParse({
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
        answers: { 'Which option?': 'A' },
        metadata: { source: 'remember' },
      }).success,
    ).toBe(true)
  })

  test('BashTool accepts _simulatedSedEdit and ignores unknown keys', () => {
    const parsed = BashTool.inputSchema.parse({
      command: 'echo hi',
      _simulatedSedEdit: { filePath: '/tmp/file.txt', newContent: 'hi' },
      extra_key: true,
    } as any)

    expect(parsed.command).toBe('echo hi')
    expect(parsed._simulatedSedEdit?.filePath).toBe('/tmp/file.txt')
    expect('extra_key' in parsed).toBe(false)
  })

  test('TaskTool accepts max_turns', () => {
    const parsed = TaskTool.inputSchema.parse({
      description: 'Warmup task',
      prompt: 'Do a short task',
      subagent_type: 'general-purpose',
      max_turns: 3,
    })
    expect(parsed.max_turns).toBe(3)
  })

  test('SkillTool accepts unknown keys and strips them', () => {
    const parsed = SkillTool.inputSchema.parse({
      skill: 'pdf',
      args: 'hello',
      extra_key: true,
    } as any)

    expect(parsed.skill).toBe('pdf')
    expect(parsed.args).toBe('hello')
    expect('extra_key' in parsed).toBe(false)
  })
})
