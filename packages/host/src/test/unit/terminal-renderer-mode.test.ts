import { describe, expect, test } from 'bun:test'
import {
  EXPERIMENTAL_TUI_RENDERER_ENV,
  getTerminalRendererMode,
} from '../../terminal'

describe('terminal renderer mode', () => {
  test('defaults to current Ink renderer', () => {
    expect(getTerminalRendererMode({})).toBe('ink')
  })

  test('enables experimental renderer only by explicit env', () => {
    expect(
      getTerminalRendererMode({ [EXPERIMENTAL_TUI_RENDERER_ENV]: 'true' }),
    ).toBe('experimental')
    expect(
      getTerminalRendererMode({ [EXPERIMENTAL_TUI_RENDERER_ENV]: '0' }),
    ).toBe('ink')
  })
})
