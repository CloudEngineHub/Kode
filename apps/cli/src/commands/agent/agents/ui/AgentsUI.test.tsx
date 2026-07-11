import { afterEach, describe, expect, mock, test } from 'bun:test'
import { render, Text } from 'ink'
import React from 'react'
import { PassThrough } from 'node:stream'
import stripAnsi from 'strip-ansi'

const getAllAgents = mock(async () => [
  {
    agentType: 'reviewer',
    source: 'built-in',
    tools: '*',
  },
])
const getActiveAgents = mock(async () => [
  {
    agentType: 'reviewer',
    source: 'built-in',
    tools: '*',
  },
])
const getAvailableTools = mock(() => new Promise<never>(() => {}))

mock.module('@kode/agent', () => ({
  clearAgentCache: () => {},
  getAllAgents,
  getActiveAgents,
}))

mock.module('../tooling', () => ({
  getAvailableTools,
  getCoreTools: () => [{ name: 'Read' }],
}))

mock.module('./AgentsListView', () => ({
  AgentsListView: () => <Text>Agent list ready</Text>,
}))

mock.module('./AgentMenu', () => ({ AgentMenu: () => null }))
mock.module('./CreateAgentWizard', () => ({ CreateAgentWizard: () => null }))
mock.module('./DeleteConfirm', () => ({ DeleteConfirm: () => null }))
mock.module('./EditAgent', () => ({ EditAgent: () => null }))
mock.module('./ViewAgent', () => ({ ViewAgent: () => null }))
mock.module('./components', () => ({
  Instructions: () => null,
  Panel: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const { AgentsUI } = await import('./AgentsUI')

describe('AgentsUI', () => {
  let unmount: (() => void) | undefined

  afterEach(() => {
    unmount?.()
    unmount = undefined
    getAllAgents.mockClear()
    getActiveAgents.mockClear()
    getAvailableTools.mockClear()
  })

  test('renders the agent list without waiting for optional MCP tool discovery', async () => {
    const stdout = new PassThrough() as PassThrough & {
      isTTY?: boolean
      columns?: number
      rows?: number
    }
    stdout.isTTY = true
    stdout.columns = 100
    stdout.rows = 30

    let output = ''
    stdout.on('data', chunk => {
      output += chunk.toString('utf8')
    })

    const instance = render(<AgentsUI onExit={() => {}} />, {
      stdout: stdout as unknown as NodeJS.WriteStream,
      exitOnCtrlC: false,
    })
    unmount = () => instance.unmount()

    await new Promise(resolve => setTimeout(resolve, 120))

    expect(stripAnsi(output)).toContain('Agent list ready')
    expect(getAvailableTools).not.toHaveBeenCalled()
  })
})
