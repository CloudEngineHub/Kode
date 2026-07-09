import { describe, expect, test } from 'bun:test'
import { prepareAssistantMarkdownTextForRender } from './AssistantTextMessage'

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
