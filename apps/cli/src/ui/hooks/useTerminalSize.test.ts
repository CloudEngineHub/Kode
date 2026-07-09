import { afterEach, describe, expect, test } from 'bun:test'
import { Box, Text, render } from 'ink'
import React from 'react'
import { PassThrough } from 'node:stream'
import stripAnsi from 'strip-ansi'

import {
  __terminalSizeStoreForTests,
  areTerminalSizesEqual,
  readTerminalSize,
  useTerminalSize,
} from './useTerminalSize'

type TestHarness = {
  unmount: () => void
  resize: (columns: number, rows: number) => void
  output: () => string
  wait: (ms: number) => Promise<void>
  stdout: PassThrough & { isTTY?: boolean; columns?: number; rows?: number }
}

const mounted: TestHarness[] = []

afterEach(() => {
  while (mounted.length > 0) {
    mounted.pop()?.unmount()
  }
})

function createHarness(element: React.ReactElement): TestHarness {
  const stdout = new PassThrough() as PassThrough & {
    isTTY?: boolean
    columns?: number
    rows?: number
  }
  stdout.isTTY = true
  stdout.columns = 100
  stdout.rows = 30

  let rawOutput = ''
  stdout.on('data', chunk => {
    rawOutput += chunk.toString('utf8')
  })

  const instance = render(element, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
  })

  const harness: TestHarness = {
    unmount: () => instance.unmount(),
    resize: (columns, rows) => {
      stdout.columns = columns
      stdout.rows = rows
      stdout.emit('resize')
    },
    output: () => stripAnsi(rawOutput),
    wait: async ms => new Promise(resolve => setTimeout(resolve, ms)),
    stdout,
  }
  mounted.push(harness)
  return harness
}

function SizeProbe({ label }: { label: string }): React.ReactNode {
  const size = useTerminalSize()
  return React.createElement(Text, null, `${label}:${size.columns}x${size.rows}`)
}

describe('terminal size helpers', () => {
  test('normalizes missing terminal dimensions while preserving minimized axes', () => {
    expect(readTerminalSize({ columns: undefined, rows: undefined })).toEqual({
      columns: 80,
      rows: 24,
    })
    expect(readTerminalSize({ columns: Number.NaN, rows: Number.NaN })).toEqual(
      {
        columns: 80,
        rows: 24,
      },
    )
    expect(readTerminalSize({ columns: 0, rows: 0 })).toEqual({
      columns: 0,
      rows: 0,
    })
  })

  test('identifies duplicate resize dimensions before notifying subscribers', () => {
    expect(
      areTerminalSizesEqual(
        { columns: 100, rows: 30 },
        { columns: 100, rows: 30 },
      ),
    ).toBe(true)
    expect(
      areTerminalSizesEqual(
        { columns: 100, rows: 30 },
        { columns: 100, rows: 29 },
      ),
    ).toBe(false)
    expect(
      areTerminalSizesEqual(
        { columns: 100, rows: 30 },
        { columns: 99, rows: 30 },
      ),
    ).toBe(false)
  })

  test('shares one terminal size snapshot across multiple subscribers', async () => {
    const harness = createHarness(
      React.createElement(
        Box,
        { flexDirection: 'column' },
        React.createElement(SizeProbe, { label: 'A' }),
        React.createElement(SizeProbe, { label: 'B' }),
      ),
    )

    await harness.wait(50)
    expect(harness.output()).toContain('A:100x30')
    expect(harness.output()).toContain('B:100x30')

    const state = __terminalSizeStoreForTests.getStreamState(
      harness.stdout as unknown as NodeJS.WriteStream,
    )
    expect(state.attached).toBe(true)
    expect(state.listeners.size).toBe(2)

    harness.resize(80, 20)
    await harness.wait(50)

    expect(harness.output()).toContain('A:80x20')
    expect(harness.output()).toContain('B:80x20')
  })
})
