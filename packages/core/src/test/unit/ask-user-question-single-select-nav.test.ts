import { describe, expect, test } from 'bun:test'
import {
  __applySingleSelectNavForTests,
  __getNumericOptionIndexForTests,
} from '#ui-ink/components/permissions/AskUserQuestionPermissionRequest/AskUserQuestionPermissionRequest'

describe('AskUserQuestion single-select navigation parity', () => {
  test('down then up returns to original index', () => {
    const optionCount = 5
    const start = 1

    const down = __applySingleSelectNavForTests({
      focusedOptionIndex: start,
      key: { downArrow: true },
      optionCount,
    })
    expect(down).toBe(start + 1)

    const up = __applySingleSelectNavForTests({
      focusedOptionIndex: down,
      key: { upArrow: true },
      optionCount,
    })
    expect(up).toBe(start)
  })

  test('clamps at bounds', () => {
    expect(
      __applySingleSelectNavForTests({
        focusedOptionIndex: 0,
        key: { upArrow: true },
        optionCount: 3,
      }),
    ).toBe(0)

    expect(
      __applySingleSelectNavForTests({
        focusedOptionIndex: 2,
        key: { downArrow: true },
        optionCount: 3,
      }),
    ).toBe(2)
  })
})

describe('AskUserQuestion numeric option shortcuts', () => {
  test('maps 1-based digit keys to zero-based option indexes', () => {
    expect(
      __getNumericOptionIndexForTests({
        input: '1',
        key: {},
        optionCount: 4,
      }),
    ).toBe(0)
    expect(
      __getNumericOptionIndexForTests({
        input: '4',
        key: {},
        optionCount: 4,
      }),
    ).toBe(3)
  })

  test('ignores out-of-range and modified digit keys', () => {
    expect(
      __getNumericOptionIndexForTests({
        input: '5',
        key: {},
        optionCount: 4,
      }),
    ).toBeNull()
    expect(
      __getNumericOptionIndexForTests({
        input: '2',
        key: { ctrl: true },
        optionCount: 4,
      }),
    ).toBeNull()
  })
})
