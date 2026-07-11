import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import checkpoint from './checkpoint'
import rollback from './rollback'
import worktree from './worktree'
import runs from './runs'
import { createDurableRun } from '#core/runs'
import { setCwd, setOriginalCwd } from '#core/utils/state'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

describe('long-running command adapters', () => {
  const originalCwd = process.cwd()
  let root: string
  let repo: string
  let previousConfig: string | undefined

  beforeEach(async () => {
    previousConfig = process.env.KODE_CONFIG_DIR
    root = mkdtempSync(join(tmpdir(), 'kode-command-'))
    repo = join(root, 'repo')
    process.env.KODE_CONFIG_DIR = join(root, 'config')
    mkdirSync(repo)
    git(repo, 'init')
    git(repo, 'config', 'user.email', 'test@example.com')
    git(repo, 'config', 'user.name', 'Kode Test')
    git(repo, 'config', 'core.autocrlf', 'false')
    writeFileSync(join(repo, 'tracked.txt'), 'base\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'initial')
    setOriginalCwd(repo)
    await setCwd(repo)
  })

  afterEach(async () => {
    await setCwd(originalCwd)
    setOriginalCwd(originalCwd)
    if (previousConfig === undefined) delete process.env.KODE_CONFIG_DIR
    else process.env.KODE_CONFIG_DIR = previousConfig
    rmSync(root, { recursive: true, force: true })
  })

  test('/checkpoint and /rollback expose safe drift behavior', async () => {
    writeFileSync(join(repo, 'tracked.txt'), 'checkpoint\n')
    const created = await checkpoint.call('create demo')
    const id = created.match(/Created checkpoint (\S+)/)?.[1]
    expect(id).toBeTruthy()
    expect(await checkpoint.call('list')).toContain(id!)
    writeFileSync(join(repo, 'tracked.txt'), 'changed\n')
    expect(await rollback.call(id!)).toContain('Rollback refused')
    expect(await rollback.call(`${id} --force`)).toContain(
      'Restored checkpoint',
    )
    expect(readFileSync(join(repo, 'tracked.txt'), 'utf8')).toBe('checkpoint\n')
  })

  test('/worktree and /runs adapt the independent managers', async () => {
    const created = await worktree.call('create cli-test')
    const id = created.match(/Created managed worktree (\S+)/)?.[1]
    expect(id).toBeTruthy()
    expect(await worktree.call('list')).toContain(id!)
    expect(await worktree.call(`release ${id} --force`)).toContain('Released')

    createDurableRun({ id: 'command-run', kind: 'agent', cwd: repo })
    expect(await runs.call('status')).toContain('command-run')
    expect(await runs.call('reconcile')).toContain('requeueable')
  })
})
