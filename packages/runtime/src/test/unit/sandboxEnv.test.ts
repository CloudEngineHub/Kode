import { describe, expect, test } from 'bun:test'
import path from 'node:path'
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

  test('win32: prefers TEMP over TMP and USERPROFILE', () => {
    const prev = {
      KODE_TMPDIR: process.env.KODE_TMPDIR,
      CLAUDE_TMPDIR: process.env.CLAUDE_TMPDIR,
      CLAUDE_CODE_TMPDIR: process.env.CLAUDE_CODE_TMPDIR,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      USERPROFILE: process.env.USERPROFILE,
    }
    delete process.env.KODE_TMPDIR
    delete process.env.CLAUDE_TMPDIR
    delete process.env.CLAUDE_CODE_TMPDIR
    process.env.TEMP = 'D:\\temp'
    process.env.TMP = 'E:\\tmp'
    process.env.USERPROFILE = 'C:\\Users\\tester'
    try {
      expect(resolveSandboxTmpDir({ platform: 'win32' })).toBe(
        path.join('D:\\temp', 'kode'),
      )
    } finally {
      for (const [key, value] of Object.entries(prev)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })

  test('win32: falls back to C:\\Windows\\Temp when no env base is set', () => {
    const prev = {
      KODE_TMPDIR: process.env.KODE_TMPDIR,
      CLAUDE_TMPDIR: process.env.CLAUDE_TMPDIR,
      CLAUDE_CODE_TMPDIR: process.env.CLAUDE_CODE_TMPDIR,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      USERPROFILE: process.env.USERPROFILE,
    }
    delete process.env.KODE_TMPDIR
    delete process.env.CLAUDE_TMPDIR
    delete process.env.CLAUDE_CODE_TMPDIR
    delete process.env.TEMP
    delete process.env.TMP
    delete process.env.USERPROFILE
    try {
      expect(resolveSandboxTmpDir({ platform: 'win32' })).toBe(
        path.join('C:\\Windows\\Temp', 'kode'),
      )
    } finally {
      for (const [key, value] of Object.entries(prev)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })
})
