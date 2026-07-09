import { describe, expect, test } from 'bun:test'
import {
  prepareAssistantMarkdownTextForRender,
  prepareToolProgressTextForRender,
} from './AssistantTextMessage'

describe('prepareAssistantMarkdownTextForRender', () => {
  test('folds very long final assistant output before markdown rendering', () => {
    const text = Array.from({ length: 300 }, (_, index) => `line-${index}`).join(
      '\n',
    )

    const prepared = prepareAssistantMarkdownTextForRender(text)

    expect(prepared.folded).toBe(true)
    expect(prepared.text).toContain('line-0')
    expect(prepared.text).toContain('line-119')
    expect(prepared.text).not.toContain('line-120')
    expect(prepared.text).not.toContain('line-299')
    expect(prepared.text).toContain('Output folded: 180 lines hidden')
  })

  test('closes a visible fenced code block before adding the folded indicator', () => {
    const code = [
      '```ts',
      ...Array.from({ length: 300 }, (_, index) => `const v${index} = ${index}`),
    ].join('\n')

    const prepared = prepareAssistantMarkdownTextForRender(code)

    expect(prepared.folded).toBe(true)
    expect(prepared.text).toContain('const v118 = 118')
    expect(prepared.text).not.toContain('const v299 = 299')
    expect(prepared.text).toContain('\n```\n\n[Output folded:')
  })

  test('leaves short assistant output unchanged', () => {
    const text = 'Short **markdown** response'

    expect(prepareAssistantMarkdownTextForRender(text)).toEqual({
      text,
      folded: false,
    })
  })
})

describe('prepareToolProgressTextForRender', () => {
  test('extracts a summary and detail lines from tool progress text', () => {
    const prepared = prepareToolProgressTextForRender(
      '\n  Refactor auth.ts (2 tools)\n- Read auth.ts\n- Edit auth.ts\n',
    )

    expect(prepared).toEqual({
      summary: 'Refactor auth.ts (2 tools)',
      details: ['- Read auth.ts', '- Edit auth.ts'],
      hiddenLines: 0,
    })
  })

  test('folds long tool progress detail lists', () => {
    const prepared = prepareToolProgressTextForRender(
      [
        'SubAgent running',
        ...Array.from({ length: 10 }, (_, index) => `- action ${index + 1}`),
      ].join('\n'),
    )

    expect(prepared.summary).toBe('SubAgent running')
    expect(prepared.details).toHaveLength(7)
    expect(prepared.details).toContain('- action 7')
    expect(prepared.details).not.toContain('- action 8')
    expect(prepared.hiddenLines).toBe(3)
  })

  test('returns an empty summary for blank progress text', () => {
    expect(prepareToolProgressTextForRender('\n  \n')).toEqual({
      summary: '',
      details: [],
      hiddenLines: 0,
    })
  })
})
