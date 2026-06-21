import { describe, expect, test } from 'bun:test'
import { join } from 'path'
import { BashTool } from '#tools/tools/system/BashTool/BashTool'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

function makeContext(): any {
  return {
    abortController: new AbortController(),
    messageId: 'test',
    safeMode: false,
    options: {
      safeMode: false,
      verbose: false,
      tools: [],
      commands: [],
      forkNumber: 0,
      messageLogName: 'bash-tool-progress-test',
      maxThinkingTokens: 0,
      bashLlmGateQuery: async () => {
        return 'ALLOW'
      },
    },
    readFileTimestamps: {},
  }
}

const describeBashProgress =
  process.platform === 'win32' ? describe.skip : describe

describeBashProgress('BashTool progress parity (Reference CLI gH5)', () => {
  test('yields progress for long-running commands and then yields final result', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'kode-config-'))
    process.env.KODE_CONFIG_DIR = configDir
    try {
      const ctx = makeContext()
      const command =
        process.platform === 'win32'
          ? 'powershell -NoProfile -Command "Write-Output a; Start-Sleep -Seconds 3; Write-Output b"'
          : 'echo a; sleep 3; echo b'
      const gen = BashTool.call(
        {
          command,
          description: 'Produce output with a delay',
          timeout: 10_000,
        },
        ctx,
      )

      const events: any[] = []
      for await (const ev of gen) events.push(ev)

      const progress = events.filter(e => e.type === 'progress')
      const results = events.filter(e => e.type === 'result')

      expect(progress.length).toBeGreaterThan(0)
      expect(results).toHaveLength(1)

      const progressText: string =
        progress[0]?.content?.message?.content?.[0]?.text ?? ''
      expect(progressText).toContain('<tool-progress>')
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  test('abort still produces a final tool result (interrupted=true)', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'kode-config-'))
    process.env.KODE_CONFIG_DIR = configDir
    try {
      const ctx = makeContext()
      const command =
        process.platform === 'win32'
          ? 'powershell -NoProfile -Command "Write-Output a; Start-Sleep -Seconds 10"'
          : 'echo a; sleep 10'
      const gen = BashTool.call(
        {
          command,
          description: 'Test abort handling',
          timeout: 60_000,
        },
        ctx,
      )

      const events: any[] = []
      for await (const ev of gen) {
        events.push(ev)
        if (ev.type === 'progress') {
          ctx.abortController.abort()
        }
      }

      const result = events.find(e => e.type === 'result')
      expect(result).toBeTruthy()
      expect(result.data.interrupted).toBe(true)
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })
})
