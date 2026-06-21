import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { BunShell } from '#runtime/shell'
import { getTaskOutputFilePath, readTaskOutput } from '#runtime/taskOutputStore'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('background task output persistence', () => {
  test('execInBackground creates an output file and appends stdout/stderr', async () => {
    if (process.platform === 'win32') return

    const originalCwd = process.cwd()
    const originalConfigDir = process.env.KODE_CONFIG_DIR

    const configRoot = mkdtempSync(join(tmpdir(), 'kode-bg-out-root-'))
    const projectDir = mkdtempSync(join(tmpdir(), 'kode-bg-out-proj-'))

    try {
      process.env.KODE_CONFIG_DIR = configRoot
      process.chdir(projectDir)

      BunShell.restart()
      const shell = BunShell.getInstance()

      const { bashId } = shell.execInBackground(
        'echo "tick 1"; echo "tick 2"; echo "err 1" 1>&2',
        10_000,
      )

      const outputPath = getTaskOutputFilePath(bashId)
      expect(existsSync(outputPath)).toBe(true)

      await sleep(150)
      const content = readTaskOutput(bashId)
      expect(content).toContain('tick 1')
      expect(content).toContain('tick 2')
      expect(content).toContain('err 1')
    } finally {
      process.chdir(originalCwd)
      if (originalConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
      else process.env.KODE_CONFIG_DIR = originalConfigDir
      rmSync(configRoot, { recursive: true, force: true })
      rmSync(projectDir, { recursive: true, force: true })
    }
  })
})
