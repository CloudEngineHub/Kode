import { describe, expect, test } from 'bun:test'
import { isWindowsConptyLikeTerminal, resolveTuiMaxFps } from './inkRender'

describe('Ink render option helpers', () => {
  test('uses a conservative default frame rate for Windows-like terminals', () => {
    expect(
      resolveTuiMaxFps({
        env: { WT_SESSION: 'session-id' },
        incrementalRendering: true,
        isScreenReaderEnabled: false,
        isTty: true,
        platform: 'linux',
      }),
    ).toBe(30)
    expect(
      resolveTuiMaxFps({
        env: {},
        incrementalRendering: true,
        isScreenReaderEnabled: false,
        isTty: true,
        platform: 'win32',
      }),
    ).toBe(30)
  })

  test('keeps smoother default rendering for non-Windows TTYs', () => {
    expect(
      resolveTuiMaxFps({
        env: {},
        incrementalRendering: true,
        isScreenReaderEnabled: false,
        isTty: true,
        platform: 'linux',
      }),
    ).toBe(60)
  })

  test('keeps Ink defaults when incremental rendering is inactive or non-interactive', () => {
    expect(
      resolveTuiMaxFps({
        env: {},
        incrementalRendering: false,
        isScreenReaderEnabled: false,
        isTty: true,
        platform: 'linux',
      }),
    ).toBeUndefined()
    expect(
      resolveTuiMaxFps({
        env: {},
        incrementalRendering: true,
        isScreenReaderEnabled: true,
        isTty: true,
        platform: 'linux',
      }),
    ).toBeUndefined()
    expect(
      resolveTuiMaxFps({
        env: {},
        incrementalRendering: true,
        isScreenReaderEnabled: false,
        isTty: false,
        platform: 'linux',
      }),
    ).toBeUndefined()
  })

  test('honors KODE_TUI_MAX_FPS as an explicit override', () => {
    expect(
      resolveTuiMaxFps({
        env: { KODE_TUI_MAX_FPS: '240' },
        incrementalRendering: true,
        isScreenReaderEnabled: false,
        isTty: true,
        platform: 'win32',
      }),
    ).toBe(240)
    expect(
      resolveTuiMaxFps({
        env: { KODE_TUI_MAX_FPS: '999' },
        incrementalRendering: true,
        isScreenReaderEnabled: false,
        isTty: true,
        platform: 'win32',
      }),
    ).toBe(240)
    expect(
      resolveTuiMaxFps({
        env: { KODE_TUI_MAX_FPS: '0' },
        incrementalRendering: true,
        isScreenReaderEnabled: false,
        isTty: true,
        platform: 'win32',
      }),
    ).toBe(1)
  })

  test('detects Windows Terminal from env or platform', () => {
    expect(isWindowsConptyLikeTerminal({}, 'win32')).toBe(true)
    expect(
      isWindowsConptyLikeTerminal(
        { TERM_PROGRAM: 'Windows_Terminal' },
        'linux',
      ),
    ).toBe(true)
    expect(isWindowsConptyLikeTerminal({}, 'linux')).toBe(false)
  })
})
