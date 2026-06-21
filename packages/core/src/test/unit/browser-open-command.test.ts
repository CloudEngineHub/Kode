import { describe, expect, test } from 'bun:test'
import { __getOpenBrowserCommandForTests } from '#core/utils/browser'

describe('openBrowser command selection', () => {
  test('uses the Windows URL protocol handler without shell metacharacter parsing', () => {
    const url = 'https://example.com/issues/new?title=a&body=b'

    expect(__getOpenBrowserCommandForTests(url, 'win32')).toEqual({
      file: 'rundll32.exe',
      args: ['url.dll,FileProtocolHandler', url],
    })
  })

  test('uses platform launchers on macOS and Linux', () => {
    expect(
      __getOpenBrowserCommandForTests('https://example.com', 'darwin'),
    ).toEqual({
      file: 'open',
      args: ['https://example.com'],
    })
    expect(
      __getOpenBrowserCommandForTests('https://example.com', 'linux'),
    ).toEqual({
      file: 'xdg-open',
      args: ['https://example.com'],
    })
  })
})
