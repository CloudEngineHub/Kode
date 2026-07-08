import { afterEach, describe, expect, test } from 'bun:test'
import { render } from 'ink'
import React from 'react'
import { PassThrough } from 'node:stream'
import stripAnsi from 'strip-ansi'
import { ASCII_LOGO } from '#core/constants/product'
import { Logo } from './Logo'

type TestHarness = {
  unmount: () => void
  getOutput: () => string
  wait: (ms: number) => Promise<void>
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
  stdout.columns = 80
  stdout.rows = 24

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
    getOutput: () => stripAnsi(rawOutput),
    wait: async ms => new Promise(resolve => setTimeout(resolve, ms)),
  }
  mounted.push(harness)
  return harness
}

describe('Logo', () => {
  test('uses compact layout for narrow or short terminals', async () => {
    const harness = createHarness(
      <Logo
        mcpClients={[{ type: 'connected', name: 'codegraph' }]}
        terminalColumns={40}
        terminalRows={12}
      />,
    )

    await harness.wait(20)
    const output = harness.getOutput().trimEnd()

    expect(output).toContain('KODE CLI')
    expect(output).toContain('/help')
    expect(output).toContain('MCP Servers')
    expect(output).toContain('codegraph')
    expect(output).not.toMatch(/(?:\n\s*){4,}/)
  })

  test('uses compact layout on standard 80x24 terminals', async () => {
    const harness = createHarness(
      <Logo
        mcpClients={[{ type: 'connected', name: 'codegraph' }]}
        terminalColumns={80}
        terminalRows={24}
      />,
    )

    await harness.wait(20)
    const output = harness.getOutput().trimEnd()
    const firstLogoLine = ASCII_LOGO.trim().split(/\r?\n/)[0]

    expect(output).toContain('KODE CLI')
    expect(output).toContain('codegraph')
    expect(output).not.toContain(firstLogoLine)
    expect(output).not.toMatch(/(?:\n\s*){4,}/)
  })

  test('keeps the full logo on spacious terminals', async () => {
    const harness = createHarness(
      <Logo mcpClients={[]} terminalColumns={100} terminalRows={30} />,
    )

    await harness.wait(20)
    const output = harness.getOutput()
    const firstLogoLine = ASCII_LOGO.trim().split(/\r?\n/)[0]

    expect(output).toContain(firstLogoLine)
    expect(output).not.toContain('KODE CLI')
  })
})
