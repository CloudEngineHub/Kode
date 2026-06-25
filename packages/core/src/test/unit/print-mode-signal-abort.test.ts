import { describe, expect, test } from 'bun:test'
import { __installPrintModeSignalAbortForTests } from '#host-cli/entrypoints/cli/print/runSingleTurn'

describe('print mode signal cancellation', () => {
  test('SIGINT aborts the active print turn controller', () => {
    const controller = new AbortController()
    const listenerCountBefore = process.listenerCount('SIGINT')
    const cleanup = __installPrintModeSignalAbortForTests(controller)

    try {
      expect(process.listenerCount('SIGINT')).toBe(listenerCountBefore + 1)
      process.emit('SIGINT')
      expect(controller.signal.aborted).toBe(true)
    } finally {
      cleanup()
    }

    expect(process.listenerCount('SIGINT')).toBe(listenerCountBefore)
  })

  test('cleanup removes print turn signal handlers', () => {
    const controller = new AbortController()
    const cleanup = __installPrintModeSignalAbortForTests(controller)
    cleanup()

    process.emit('SIGINT')

    expect(controller.signal.aborted).toBe(false)
  })
})
