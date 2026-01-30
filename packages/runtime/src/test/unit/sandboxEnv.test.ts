import { describe, expect, test } from 'bun:test'
import {
  buildSandboxEnvAssignments,
  resolveSandboxTmpDir,
} from '#runtime/shell/sandboxEnv'

describe('sandbox env (TMPDIR)', () => {
  test('defaults to /tmp/kode when no overrides are set', () => {
    const prevKode = process.env.KODE_TMPDIR
    const prevClaudeTmp = process.env.CLAUDE_TMPDIR
    const prevClaude = process.env.CLAUDE_CODE_TMPDIR
    delete process.env.KODE_TMPDIR
    delete process.env.CLAUDE_TMPDIR
    delete process.env.CLAUDE_CODE_TMPDIR
    try {
      expect(resolveSandboxTmpDir({ platform: 'linux' })).toBe('/tmp/kode')
      expect(buildSandboxEnvAssignments({ platform: 'linux' })).toContain(
        'TMPDIR=/tmp/kode',
      )
    } finally {
      if (prevKode === undefined) delete process.env.KODE_TMPDIR
      else process.env.KODE_TMPDIR = prevKode
      if (prevClaudeTmp === undefined) delete process.env.CLAUDE_TMPDIR
      else process.env.CLAUDE_TMPDIR = prevClaudeTmp
      if (prevClaude === undefined) delete process.env.CLAUDE_CODE_TMPDIR
      else process.env.CLAUDE_CODE_TMPDIR = prevClaude
    }
  })

  test('prefers KODE_TMPDIR when set', () => {
    const prevKode = process.env.KODE_TMPDIR
    const prevClaudeTmp = process.env.CLAUDE_TMPDIR
    const prevClaude = process.env.CLAUDE_CODE_TMPDIR
    process.env.KODE_TMPDIR = '/tmp/custom-kode'
    delete process.env.CLAUDE_TMPDIR
    process.env.CLAUDE_CODE_TMPDIR = '/tmp'
    try {
      expect(resolveSandboxTmpDir({ platform: 'linux' })).toBe(
        '/tmp/custom-kode',
      )
      expect(buildSandboxEnvAssignments({ platform: 'linux' })).toContain(
        'TMPDIR=/tmp/custom-kode',
      )
    } finally {
      if (prevKode === undefined) delete process.env.KODE_TMPDIR
      else process.env.KODE_TMPDIR = prevKode
      if (prevClaudeTmp === undefined) delete process.env.CLAUDE_TMPDIR
      else process.env.CLAUDE_TMPDIR = prevClaudeTmp
      if (prevClaude === undefined) delete process.env.CLAUDE_CODE_TMPDIR
      else process.env.CLAUDE_CODE_TMPDIR = prevClaude
    }
  })

  test('uses CLAUDE_CODE_TMPDIR base when set and KODE_TMPDIR is unset', () => {
    const prevKode = process.env.KODE_TMPDIR
    const prevClaudeTmp = process.env.CLAUDE_TMPDIR
    const prevClaude = process.env.CLAUDE_CODE_TMPDIR
    delete process.env.KODE_TMPDIR
    delete process.env.CLAUDE_TMPDIR
    process.env.CLAUDE_CODE_TMPDIR = '/tmp'
    try {
      expect(resolveSandboxTmpDir({ platform: 'linux' })).toBe('/tmp/kode')
      expect(buildSandboxEnvAssignments({ platform: 'linux' })).toContain(
        'TMPDIR=/tmp/kode',
      )
    } finally {
      if (prevKode === undefined) delete process.env.KODE_TMPDIR
      else process.env.KODE_TMPDIR = prevKode
      if (prevClaudeTmp === undefined) delete process.env.CLAUDE_TMPDIR
      else process.env.CLAUDE_TMPDIR = prevClaudeTmp
      if (prevClaude === undefined) delete process.env.CLAUDE_CODE_TMPDIR
      else process.env.CLAUDE_CODE_TMPDIR = prevClaude
    }
  })

  test('uses CLAUDE_TMPDIR when set and maps legacy directory name', () => {
    const prevKode = process.env.KODE_TMPDIR
    const prevClaudeTmp = process.env.CLAUDE_TMPDIR
    const prevClaude = process.env.CLAUDE_CODE_TMPDIR
    delete process.env.KODE_TMPDIR
    process.env.CLAUDE_TMPDIR = '/tmp/claude'
    delete process.env.CLAUDE_CODE_TMPDIR
    try {
      expect(resolveSandboxTmpDir({ platform: 'linux' })).toBe('/tmp/kode')
    } finally {
      if (prevKode === undefined) delete process.env.KODE_TMPDIR
      else process.env.KODE_TMPDIR = prevKode
      if (prevClaudeTmp === undefined) delete process.env.CLAUDE_TMPDIR
      else process.env.CLAUDE_TMPDIR = prevClaudeTmp
      if (prevClaude === undefined) delete process.env.CLAUDE_CODE_TMPDIR
      else process.env.CLAUDE_CODE_TMPDIR = prevClaude
    }
  })
})
