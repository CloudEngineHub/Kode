import { describe, expect, test } from 'bun:test'
import { __getBugFooterTextForTests, __redactBugReportUrlForTests } from './Bug'

describe('Bug footer text', () => {
  test('does not advertise Enter when description is empty', () => {
    expect(
      __getBugFooterTextForTests({
        exitPending: false,
        exitKeyName: 'Esc',
        step: 'userInput',
        canContinue: false,
        isOpening: false,
      }),
    ).toBe('Type a description - Esc to cancel')
  })

  test('shows Enter only after a description is present', () => {
    expect(
      __getBugFooterTextForTests({
        exitPending: false,
        exitKeyName: 'Esc',
        step: 'userInput',
        canContinue: true,
        isOpening: false,
      }),
    ).toBe('Enter to continue - Esc to cancel')
  })

  test('keeps consent and exit-pending footer states', () => {
    expect(
      __getBugFooterTextForTests({
        exitPending: false,
        exitKeyName: 'Esc',
        step: 'consent',
        canContinue: true,
        isOpening: false,
      }),
    ).toBe('Enter to open browser - Esc to cancel')

    expect(
      __getBugFooterTextForTests({
        exitPending: true,
        exitKeyName: 'Ctrl-C',
        step: 'userInput',
        canContinue: true,
        isOpening: false,
      }),
    ).toBe('Press Ctrl-C again to exit')
  })

  test('shows opening state while browser launch is in progress', () => {
    expect(
      __getBugFooterTextForTests({
        exitPending: false,
        exitKeyName: 'Esc',
        step: 'consent',
        canContinue: true,
        isOpening: true,
      }),
    ).toBe('Opening browser...')
  })
})

describe('Bug report URL redaction', () => {
  test('removes URL credentials and sensitive query values', () => {
    expect(
      __redactBugReportUrlForTests(
        'https://user:pass@example.com/v1?api_key=abc&token=def&safe=1',
      ),
    ).toBe(
      'https://example.com/v1?api_key=%5Bredacted%5D&token=%5Bredacted%5D&safe=1',
    )
  })

  test('redacts sensitive key-value pairs in non-URL values', () => {
    expect(
      __redactBugReportUrlForTests(
        'proxy.local/v1 apiKey=abc password=def keep=this',
      ),
    ).toBe('proxy.local/v1 apiKey=[redacted] password=[redacted] keep=this')
  })
})
