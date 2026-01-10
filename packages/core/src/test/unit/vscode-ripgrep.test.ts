import { expect, test } from 'bun:test'
import { createRequire } from 'node:module'
import { existsSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

test('@vscode/ripgrep ships an executable rg', () => {
  const req = createRequire(import.meta.url)
  const { rgPath } = req('@vscode/ripgrep') as { rgPath: string }

  expect(existsSync(rgPath)).toBe(true)
  expect(statSync(rgPath).isFile()).toBe(true)

  const res = spawnSync(rgPath, ['--version'], {
    encoding: 'utf8',
    timeout: 10_000,
  })

  expect(res.error).toBeUndefined()
  expect(res.status).toBe(0)
  expect(String(res.stdout || '')).toMatch(/ripgrep/i)
})
