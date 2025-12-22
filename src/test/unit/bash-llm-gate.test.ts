import { describe, expect, test } from 'bun:test'
import { runBashLlmSafetyGate } from '@tools/BashTool/llmSafetyGate'

async function withEnv<T>(
  updates: Record<string, string | undefined>,
  fn: () => Promise<T> | T,
): Promise<T> {
  const previous: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(updates)) {
    previous[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    return await fn()
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

describe('Bash LLM safety gate', () => {
  test('disabled when KODE_BASH_LLM_GATE=0', async () => {
    await withEnv(
      {
        KODE_BASH_LLM_GATE: '0',
        KODE_BASH_LLM_GATE_BYPASS: undefined,
      },
      async () => {
        let calls = 0
        const result = await runBashLlmSafetyGate({
          command: 'echo hi',
          reason: 'Print greeting',
          platform: process.platform,
          commandSource: 'agent_call',
          safeMode: false,
          willSandbox: true,
          sandboxRequired: false,
          cwd: process.cwd(),
          originalCwd: process.cwd(),
          query: async () => {
            calls++
            return JSON.stringify({
              action: 'allow',
              risk: 'low',
              summary: 'ok',
            })
          },
        })
        expect(result.decision).toBe('disabled')
        expect(calls).toBe(0)
      },
    )
  })

  test('parses JSON even with surrounding text', async () => {
    await withEnv(
      {
        KODE_BASH_LLM_GATE: '1',
        KODE_BASH_LLM_GATE_BYPASS: undefined,
        KODE_BASH_LLM_GATE_CACHE_TTL_MS: '0',
      },
      async () => {
        const result = await runBashLlmSafetyGate({
          command: 'git status',
          reason: 'Check working tree state',
          platform: process.platform,
          commandSource: 'agent_call',
          safeMode: false,
          willSandbox: true,
          sandboxRequired: false,
          cwd: process.cwd(),
          originalCwd: process.cwd(),
          query: async () =>
            `here you go:\n${JSON.stringify({
              action: 'allow',
              risk: 'low',
              summary: 'Read-only git status',
              reasons: ['Matches intent'],
            })}\nthanks`,
        })
        expect(result.decision).toBe('allow')
        if (result.decision === 'allow') {
          expect(result.verdict.risk).toBe('low')
        }
      },
    )
  })

  test('caches verdicts by default', async () => {
    await withEnv(
      {
        KODE_BASH_LLM_GATE: '1',
        KODE_BASH_LLM_GATE_BYPASS: undefined,
        KODE_BASH_LLM_GATE_CACHE_TTL_MS: '300000',
      },
      async () => {
        let calls = 0
        const query = async () => {
          calls++
          return JSON.stringify({
            action: 'allow',
            risk: 'low',
            summary: 'ok',
          })
        }

        const command = `echo cache-${Date.now()}`
        const base = {
          command,
          reason: 'Test cache behavior',
          platform: process.platform,
          commandSource: 'agent_call' as const,
          safeMode: false,
          willSandbox: true,
          sandboxRequired: false,
          cwd: process.cwd(),
          originalCwd: process.cwd(),
          query,
        }

        const first = await runBashLlmSafetyGate(base)
        const second = await runBashLlmSafetyGate(base)

        expect(first.decision).toBe('allow')
        expect(second.decision).toBe('allow')
        if (second.decision === 'allow') {
          expect(second.fromCache).toBe(true)
        }
        expect(calls).toBe(1)
      },
    )
  })

  test('bypass env is ignored in safe mode', async () => {
    await withEnv(
      {
        KODE_BASH_LLM_GATE: '1',
        KODE_BASH_LLM_GATE_BYPASS: '1',
        KODE_BASH_LLM_GATE_CACHE_TTL_MS: '0',
      },
      async () => {
        let calls = 0
        const result = await runBashLlmSafetyGate({
          command: 'echo hi',
          reason: 'Print greeting',
          platform: process.platform,
          commandSource: 'agent_call',
          safeMode: true,
          willSandbox: true,
          sandboxRequired: true,
          cwd: process.cwd(),
          originalCwd: process.cwd(),
          query: async () => {
            calls++
            return JSON.stringify({
              action: 'allow',
              risk: 'low',
              summary: 'ok',
            })
          },
        })
        expect(result.decision).toBe('allow')
        expect(calls).toBe(1)
      },
    )
  })
})
