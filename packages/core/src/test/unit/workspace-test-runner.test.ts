import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('workspace runner rejects premature exit(0) and reports completed cases', () => {
  const root = mkdtempSync(join(tmpdir(), 'kode-runner-fixture-'))
  try {
    mkdirSync(join(root, 'test'))
    mkdirSync(join(root, 'apps'))
    writeFileSync(
      join(root, 'test', 'all.test.ts'),
      readFileSync(join(process.cwd(), 'test', 'all.test.ts')),
    )
    writeFileSync(join(root, 'bunfig.toml'), '[test]\nroot="./test"\n')
    writeFileSync(
      join(root, 'apps', 'pass.test.ts'),
      "import { test, expect } from 'bun:test'; test('fixture', () => expect(1).toBe(1))\n",
    )
    writeFileSync(join(root, 'apps', 'exit.test.ts'), 'process.exit(0)\n')
    const run = () =>
      spawnSync(process.execPath, ['test'], {
        cwd: root,
        encoding: 'utf8',
        timeout: 10_000,
      })
    const earlyExit = run()
    expect(earlyExit.status).toBe(1)
    expect(earlyExit.stdout + earlyExit.stderr).toContain(
      'Missing test completion summary',
    )
    rmSync(join(root, 'apps', 'exit.test.ts'))
    const completed = run()
    expect(completed.status).toBe(0)
    expect(completed.stdout + completed.stderr).toContain(
      'Workspace cases: 1 pass, 0 skip, 0 fail',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
