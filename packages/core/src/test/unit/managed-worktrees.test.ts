import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  allocateManagedWorktree,
  listManagedWorktrees,
  releaseManagedWorktree,
  validateManagedWorktreePath,
} from '#core/worktrees'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

describe('managed worktrees', () => {
  test('allocates only under manager root and refuses dirty release without force', () => {
    const root = mkdtempSync(join(tmpdir(), 'kode-worktree-'))
    const repo = join(root, 'repo')
    const storageRoot = join(root, 'storage')
    try {
      mkdirSync(repo)
      git(repo, 'init')
      git(repo, 'config', 'user.email', 'test@example.com')
      git(repo, 'config', 'user.name', 'Kode Test')
      git(repo, 'config', 'core.autocrlf', 'false')
      writeFileSync(join(repo, 'README.md'), 'initial\n')
      git(repo, 'add', '.')
      git(repo, 'commit', '-m', 'initial')

      const worktree = allocateManagedWorktree({
        cwd: repo,
        label: 'agent-one',
        storageRoot,
      })
      expect(existsSync(worktree.path)).toBe(true)
      expect(
        validateManagedWorktreePath({
          repoRoot: repo,
          path: worktree.path,
          storageRoot,
        }).ok,
      ).toBe(true)
      expect(
        validateManagedWorktreePath({ repoRoot: repo, path: repo, storageRoot })
          .ok,
      ).toBe(false)
      expect(
        listManagedWorktrees({ cwd: repo, storageRoot }).map(item => item.id),
      ).toContain(worktree.id)

      writeFileSync(join(worktree.path, 'README.md'), 'dirty\n')
      expect(
        releaseManagedWorktree({ cwd: repo, id: worktree.id, storageRoot }).ok,
      ).toBe(false)
      const released = releaseManagedWorktree({
        cwd: repo,
        id: worktree.id,
        storageRoot,
        force: true,
      })
      expect(released.ok).toBe(true)
      expect(existsSync(worktree.path)).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
