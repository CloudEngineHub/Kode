import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'bun:test'
import { getRipgrepPath, resetRipgrepPathCacheForTests } from '@utils/ripgrep'

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

test('falls back to bundled vendor rg when forced', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kode-rg-vendor-'))
  try {
    const vendorRoot = join(dir, 'vendor', 'ripgrep')
    const targetDir =
      process.platform === 'win32'
        ? join(vendorRoot, `${process.arch}-win32`)
        : join(vendorRoot, `${process.arch}-${process.platform}`)
    mkdirSync(targetDir, { recursive: true })
    const fakeRg = join(targetDir, process.platform === 'win32' ? 'rg.exe' : 'rg')
    writeFileSync(fakeRg, 'stub')

    setEnv({
      USE_BUILTIN_RIPGREP: '1',
      KODE_RIPGREP_VENDOR_ROOT: vendorRoot,
      KODE_RIPGREP_PATH: undefined,
    })

    expect(getRipgrepPath()).toBe(fakeRg)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('throws a helpful error when bundled rg is missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kode-rg-missing-'))
  try {
    const vendorRoot = join(dir, 'vendor', 'ripgrep')
    mkdirSync(vendorRoot, { recursive: true })

    setEnv({
      USE_BUILTIN_RIPGREP: '1',
      KODE_RIPGREP_VENDOR_ROOT: vendorRoot,
      KODE_RIPGREP_PATH: undefined,
    })

    expect(() => getRipgrepPath()).toThrow(/Bundled ripgrep missing|no bundled ripgrep/i)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
