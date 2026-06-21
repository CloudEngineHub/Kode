import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runBuiltinPreToolUseGuards } from '#core/hooks/builtin/preToolUse'

function sanitizeWorkspaceKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-')
}

function writePeerPresence(args: {
  kodeRoot: string
  cwd: string
  pid?: number
}): void {
  const workspaceKey = sanitizeWorkspaceKey(args.cwd)
  const agentsDir = join(args.kodeRoot, 'workspaces', workspaceKey, 'agents')
  mkdirSync(agentsDir, { recursive: true })
  writeFileSync(
    join(agentsDir, `agent-peer-${args.pid ?? 99999}.json`),
    JSON.stringify(
      {
        pid: args.pid ?? 99999,
        workspaceKey,
        lastSeenAt: Date.now(),
      },
      null,
      2,
    ),
    'utf8',
  )
}

describe('builtin preToolUse git branch guard', () => {
  test('blocks git switch/checkout when peers present, avoids echo false positive', () => {
    const previousKodeConfigDir = process.env.KODE_CONFIG_DIR
    const previousDisableGuard = process.env.KODE_DISABLE_GIT_BRANCH_GUARD
    const previousAllowSwitch = process.env.KODE_ALLOW_GIT_BRANCH_SWITCH

    const kodeRoot = mkdtempSync(join(tmpdir(), 'kode-guard-root-'))
    const cwd = mkdtempSync(join(tmpdir(), 'kode-guard-cwd-'))

    process.env.KODE_CONFIG_DIR = kodeRoot
    process.env.KODE_DISABLE_GIT_BRANCH_GUARD = '0'
    process.env.KODE_ALLOW_GIT_BRANCH_SWITCH = ''

    try {
      writePeerPresence({ kodeRoot, cwd })

      expect(
        runBuiltinPreToolUseGuards({
          toolName: 'Bash',
          toolInput: { command: 'git switch main' },
          cwd,
        })?.kind,
      ).toBe('block')

      expect(
        runBuiltinPreToolUseGuards({
          toolName: 'Bash',
          toolInput: { command: 'git checkout main' },
          cwd,
        })?.kind,
      ).toBe('block')

      expect(
        runBuiltinPreToolUseGuards({
          toolName: 'Bash',
          toolInput: { command: 'git checkout -- README.md' },
          cwd,
        }),
      ).toBe(null)

      expect(
        runBuiltinPreToolUseGuards({
          toolName: 'Bash',
          toolInput: { command: 'echo git switch main' },
          cwd,
        }),
      ).toBe(null)

      process.env.KODE_ALLOW_GIT_BRANCH_SWITCH = '1'
      expect(
        runBuiltinPreToolUseGuards({
          toolName: 'Bash',
          toolInput: { command: 'git switch main' },
          cwd,
        }),
      ).toBe(null)
    } finally {
      process.env.KODE_CONFIG_DIR = previousKodeConfigDir
      process.env.KODE_DISABLE_GIT_BRANCH_GUARD = previousDisableGuard
      process.env.KODE_ALLOW_GIT_BRANCH_SWITCH = previousAllowSwitch
      rmSync(kodeRoot, { recursive: true, force: true })
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
