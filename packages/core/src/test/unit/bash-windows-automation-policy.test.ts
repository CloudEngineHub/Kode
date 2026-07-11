import { describe, expect, test } from 'bun:test'

import { BashTool } from '#tools/tools/system/BashTool/BashTool'

async function callBash(
  input: {
    command: string
    run_in_background?: boolean
  },
  automationKind?: 'goal' | 'scheduled_loop',
) {
  const chunks = [] as any[]
  for await (const chunk of BashTool.call(input, {
    agentId: 'main',
    abortController: new AbortController(),
    messageId: undefined,
    readFileTimestamps: {},
    setToolJSX: () => {},
    options: {
      safeMode: false,
      __sandboxPlatform: 'win32',
      ...(automationKind ? { automationKind } : {}),
    },
  } as any)) {
    chunks.push(chunk)
  }
  return chunks
}

describe('Bash Windows automation execution policy', () => {
  test('blocks a goal turn instead of pretending local Windows execution is isolated', async () => {
    const [result] = await callBash({ command: 'git status' }, 'goal')
    expect(result?.type).toBe('result')
    expect(result?.data.stderr).toContain(
      'Blocked by the Windows execution policy',
    )
    expect(result?.data.stderr).toContain('remote_strongly_isolated_kernel')
  })

  test('blocks background execution on a simulated Windows host', async () => {
    const [result] = await callBash({
      command: 'echo background',
      run_in_background: true,
    })
    expect(result?.data.stderr).toContain('windows_requires_remote_isolation')
  })
})
