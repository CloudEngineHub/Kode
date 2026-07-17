import { describe, expect, test } from 'bun:test'

import { expandPastedTextPlaceholders } from '#ui-ink/components/PromptInput/pastes'

describe('prompt text paste placeholders', () => {
  test('expands every occurrence of a referenced pasted text placeholder', () => {
    expect(
      expandPastedTextPlaceholders({
        input: '[Pasted text #1] then [Pasted text #1]',
        pastedTexts: [
          {
            placeholder: '[Pasted text #1]',
            text: 'large pasted text',
          },
        ],
      }),
    ).toBe('large pasted text then large pasted text')
  })

  test('leaves unrelated placeholders untouched', () => {
    expect(
      expandPastedTextPlaceholders({
        input: '[Pasted text #1] [Pasted text #2]',
        pastedTexts: [
          {
            placeholder: '[Pasted text #1]',
            text: 'known paste',
          },
        ],
      }),
    ).toBe('known paste [Pasted text #2]')
  })
})
