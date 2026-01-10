import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'bun:test'
import {
  getRipgrepPath,
  resetRipgrepPathCacheForTests,
} from '#core/utils/ripgrep'
const vscodeRgPath = (
  createRequire(import.meta.url)('@vscode/ripgrep') as { rgPath: string }
).rgPath

const ORIGINAL_ENV = { ...process.env }

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key]
    }
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

function setEnv(next: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  resetRipgrepPathCacheForTests()
}

beforeEach(() => {
  restoreEnv()
  resetRipgrepPathCacheForTests()
})

afterEach(() => {
  restoreEnv()
  resetRipgrepPathCacheForTests()
})

test('uses KODE_RIPGREP_PATH when set', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kode-rg-path-'))
  try {
    const fakeRg = join(dir, process.platform === 'win32' ? 'rg.exe' : 'rg')
    writeFileSync(fakeRg, '#!/bin/sh\necho rg\n')

    setEnv({ KODE_RIPGREP_PATH: fakeRg })
    expect(getRipgrepPath()).toBe(fakeRg)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('prefers rg found on PATH over bundled fallback', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kode-rg-path-first-'))
  try {
    const fakeRg = join(process.platform === 'win32' ? 'rg.exe' : 'rg')
    writeFileSync(fakeRg, 'stub')
    if (process.platform !== 'win32') {
      chmodSync(fakeRg, 0o755)
    }

    const oldPath = process.env.PATH
    const sep = process.platform === 'win32' ? ';' : ':'
    setEnv({ PATH: [dir, oldPath].filter(Boolean).join(sep) })

    expect(getRipgrepPath()).toBe(fakeRg)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('falls back to @vscode/ripgrep when rg is missing from PATH', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kode-rg-fallback-'))
  try {
    setEnv({
      PATH: '',
    })

    expect(getRipgrepPath()).toBe(vscodeRgPath)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('falls back to @vscode/ripgrep when forced (USE_BUILTIN_RIPGREP)', () => {
  setEnv({
    USE_BUILTIN_RIPGREP: '1',
    PATH: '',
  })

  expect(getRipgrepPath()).toBe(vscodeRgPath)
})
