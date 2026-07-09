import { describe, expect, test } from 'bun:test'
import {
  CLIPBOARD_ERROR_MESSAGE,
  __imagePasteInternalsForTests,
} from '#core/utils/imagePaste'

const MEBIBYTE = 1024 * 1024

describe('Windows clipboard image buffer budget', () => {
  test('accounts for Base64 expansion beyond the previous 20 MiB stdout limit', () => {
    const previousStdoutLimit = 20 * MEBIBYTE
    const fourteenMiBOutput =
      __imagePasteInternalsForTests.getBase64EncodedLength(14 * MEBIBYTE)
    const sixteenMiBOutput =
      __imagePasteInternalsForTests.getBase64EncodedLength(16 * MEBIBYTE)

    expect(fourteenMiBOutput).toBeLessThan(previousStdoutLimit)
    expect(sixteenMiBOutput).toBeGreaterThan(previousStdoutLimit)
    expect(sixteenMiBOutput).toBeLessThan(
      __imagePasteInternalsForTests.windowsClipboardMaxBuffer,
    )
  })

  test('keeps a bounded 20 MiB raw image limit with output headroom', () => {
    const {
      getBase64EncodedLength,
      maxImageBytes,
      windowsClipboardMaxBuffer,
      windowsClipboardOutputMarginBytes,
    } = __imagePasteInternalsForTests

    expect(maxImageBytes).toBe(20 * MEBIBYTE)
    expect(windowsClipboardMaxBuffer).toBe(
      getBase64EncodedLength(maxImageBytes) + windowsClipboardOutputMarginBytes,
    )
    expect(windowsClipboardMaxBuffer).toBeLessThan(28 * MEBIBYTE)
  })
})

describe('Windows clipboard image failure classification', () => {
  const { classifyWindowsClipboardError, parseWindowsClipboardOutput } =
    __imagePasteInternalsForTests

  test('distinguishes an empty clipboard in sync and async process errors', () => {
    expect(classifyWindowsClipboardError({ status: 2 })).toBe('no_image')
    expect(classifyWindowsClipboardError({ code: 2 })).toBe('no_image')
  })

  test('recognizes PowerShell and Node/Bun output limit failures', () => {
    expect(classifyWindowsClipboardError({ status: 3 })).toBe(
      'output_too_large',
    )
    expect(classifyWindowsClipboardError({ code: 3 })).toBe('output_too_large')
    expect(classifyWindowsClipboardError({ code: 'ENOBUFS' })).toBe(
      'output_too_large',
    )
    expect(
      classifyWindowsClipboardError({
        code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
      }),
    ).toBe('output_too_large')
    expect(
      classifyWindowsClipboardError({
        message: 'stdout maxBuffer length exceeded',
      }),
    ).toBe('output_too_large')
  })

  test('classifies other process failures as read failures', () => {
    expect(classifyWindowsClipboardError(new Error('spawn timed out'))).toBe(
      'read_failed',
    )
  })

  test('distinguishes empty, unsupported, oversized, and valid output', () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ])

    expect(parseWindowsClipboardOutput('')).toEqual({
      ok: false,
      kind: 'read_failed',
    })
    expect(
      parseWindowsClipboardOutput(
        Buffer.from('not an image').toString('base64'),
      ),
    ).toMatchObject({ ok: false, kind: 'unsupported_format' })
    expect(
      parseWindowsClipboardOutput(png.toString('base64'), png.length - 1),
    ).toMatchObject({ ok: false, kind: 'output_too_large' })
    expect(
      parseWindowsClipboardOutput(`\r\n${png.toString('base64')}\n`),
    ).toEqual({
      ok: true,
      image: {
        data: png.toString('base64'),
        mediaType: 'image/png',
      },
    })
  })

  test('provides distinct user-facing messages for each failure kind', () => {
    const getMessage =
      __imagePasteInternalsForTests.getWindowsClipboardErrorMessage
    const messages = new Set([
      getMessage('no_image'),
      getMessage('unsupported_format'),
      getMessage('output_too_large'),
      getMessage('read_failed'),
    ])

    expect(messages.size).toBe(4)
  })

  test('updates the existing error display binding with the failure category', () => {
    const { applyWindowsClipboardFailure, getWindowsClipboardErrorMessage } =
      __imagePasteInternalsForTests

    try {
      applyWindowsClipboardFailure('output_too_large')
      expect(CLIPBOARD_ERROR_MESSAGE).toBe(
        getWindowsClipboardErrorMessage('output_too_large'),
      )

      applyWindowsClipboardFailure('unsupported_format')
      expect(CLIPBOARD_ERROR_MESSAGE).toBe(
        getWindowsClipboardErrorMessage('unsupported_format'),
      )
    } finally {
      __imagePasteInternalsForTests.resetClipboardErrorMessage()
    }
  })
})
