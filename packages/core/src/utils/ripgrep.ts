import { memoize } from 'lodash-es'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as path from 'path'
import which from 'which'
import { logError } from './log'
import { execFile } from 'child_process'
import debug from 'debug'
import { quote } from 'shell-quote'
import type { BunShellSandboxOptions } from '#runtime/shell'
import { BunShell } from '#runtime/shell'

const d = debug('kode:ripgrep')

function getCurrentModuleUrl(): string {
  // CJS builds (for SDK require()) don't have `import.meta.url`.
  // ESM builds don't have `__filename`.
  if (typeof __filename === 'string' && __filename) {
    return pathToFileURL(__filename).href
  }
  return import.meta.url
}

function clearMemoizeCache(value: unknown): void {
  const candidate = value as { cache?: { clear?: () => void } }
  candidate.cache?.clear?.()
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized === '0' || normalized === 'false' || normalized === 'no')
    return false
  if (normalized === '1' || normalized === 'true' || normalized === 'yes')
    return true
  return undefined
}

function shouldUseBuiltinRipgrep(): boolean {
  // Upstream compatibility: USE_BUILTIN_RIPGREP=0 opts out.
  // Kode-first alias: KODE_USE_BUILTIN_RIPGREP (same semantics).
  const raw =
    process.env.KODE_USE_BUILTIN_RIPGREP ?? process.env.USE_BUILTIN_RIPGREP
  const parsed = parseBooleanEnv(raw)
  if (parsed !== undefined) return parsed
  return true
}

function getKodeRipgrepPackageNames(): string[] {
  const platform = process.platform
  const arch = process.arch

  const names = [`@shareai-lab/kode-ripgrep-${platform}-${arch}`]

  // Some Windows ARM setups can run x64 binaries under emulation.
  if (platform === 'win32' && arch === 'arm64') {
    names.push(`@shareai-lab/kode-ripgrep-win32-x64`)
  }

  return names
}

function getKodeRipgrepPathOrNull(): string | null {
  const req = createRequire(getCurrentModuleUrl())
  for (const name of getKodeRipgrepPackageNames()) {
    try {
      const mod = req(name) as { rgPath?: unknown }
      const rgPath = typeof mod?.rgPath === 'string' ? mod.rgPath : null
      if (rgPath && existsSync(rgPath)) {
        d('packaged ripgrep resolved as: %s (%s)', rgPath, name)
        return rgPath
      }
    } catch {
      // Optional dependency; ignore if not present.
    }
  }

  return null
}

function findRipgrepVendorRoot(): string | null {
  const explicit = process.env.KODE_RIPGREP_VENDOR_ROOT
  if (explicit && existsSync(explicit)) {
    return explicit
  }

  const startDir = path.dirname(fileURLToPath(getCurrentModuleUrl()))
  let dir = startDir
  for (let i = 0; i < 8; i++) {
    const direct = path.join(dir, 'vendor', 'ripgrep')
    if (existsSync(direct)) return direct

    const distVendor = path.join(dir, 'dist', 'vendor', 'ripgrep')
    if (existsSync(distVendor)) return distVendor

    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return null
}

function resolveExplicitRipgrepPathOrThrow(): string | null {
  const explicit = process.env.KODE_RIPGREP_PATH
  if (!explicit) return null
  if (!existsSync(explicit)) {
    throw new Error(`KODE_RIPGREP_PATH points to a missing file: ${explicit}`)
  }
  return explicit
}

function resolveVendorRipgrepPathOrNull(): string | null {
  const rgRoot = findRipgrepVendorRoot()
  if (!rgRoot) {
    return null
  }

  if (process.platform === 'win32') {
    // Prefer native arch, but fall back to x64 (works under emulation on some Windows ARM setups).
    const candidates = [`${process.arch}-win32`, 'x64-win32']
    for (const dirName of candidates) {
      const p = path.resolve(rgRoot, dirName, 'rg.exe')
      if (existsSync(p)) {
        d('internal ripgrep resolved as: %s', p)
        return p
      }
    }
    return null
  }

  const ret = path.resolve(rgRoot, `${process.arch}-${process.platform}`, 'rg')
  if (!existsSync(ret)) {
    return null
  }

  d('internal ripgrep resolved as: %s', ret)
  return ret
}

function resolveSystemRipgrepPathOrNull(): string | null {
  const resolved = which.sync('rg', { nothrow: true })
  if (typeof resolved === 'string' && resolved.trim()) {
    d('system ripgrep resolved as: %s', resolved)
    return resolved
  }
  return null
}

export const getRipgrepPath = memoize((): string => {
  const explicit = resolveExplicitRipgrepPathOrThrow()
  if (explicit) return explicit

  const useBuiltinRipgrep = shouldUseBuiltinRipgrep()
  if (useBuiltinRipgrep) {
    const packaged = getKodeRipgrepPathOrNull()
    if (packaged) return packaged

    const vendor = resolveVendorRipgrepPathOrNull()
    if (vendor) return vendor
  }

  const system = resolveSystemRipgrepPathOrNull()
  if (system) return system

  const useBuiltinRaw =
    process.env.KODE_USE_BUILTIN_RIPGREP ?? process.env.USE_BUILTIN_RIPGREP
  throw new Error(
    [
      'ripgrep (rg) is required but could not be found.',
      '',
      'Fix:',
      '- Install ripgrep and ensure `rg` is on PATH',
      '- Or set KODE_RIPGREP_PATH to a ripgrep executable',
      useBuiltinRipgrep
        ? `- Or install @shareai-lab/kode-ripgrep-${process.platform}-${process.arch}`
        : `- Note: builtin ripgrep is disabled (USE_BUILTIN_RIPGREP=${JSON.stringify(useBuiltinRaw)})`,
    ].join('\n'),
  )
})

export async function ensureRipgrepReady(): Promise<string> {
  return getRipgrepPath()
}

export async function ripGrep(
  args: string[],
  target: string,
  abortSignal: AbortSignal,
  options?: { sandbox?: BunShellSandboxOptions },
): Promise<string[]> {
  const rg = getRipgrepPath()
  d('ripgrep called: %s %o', rg, target, args)

  // NB: When running interactively, ripgrep does not require a path as its last
  // argument, but when run non-interactively, it will hang unless a path or file
  // pattern is provided
  if (options?.sandbox?.enabled === true) {
    const cmd = quote([rg, ...args, target])
    const result = await BunShell.getInstance().exec(cmd, abortSignal, 10_000, {
      sandbox: options.sandbox,
    })
    if (result.code === 1) return []
    if (result.code !== 0) {
      logError(`ripgrep failed with exit code ${result.code}: ${result.stderr}`)
      return []
    }
    return result.stdout.trim().split('\n').filter(Boolean)
  }

  return new Promise(resolve => {
    execFile(
      getRipgrepPath(),
      [...args, target],
      {
        maxBuffer: 1_000_000,
        signal: abortSignal,
        timeout: 10_000,
      },
      (error, stdout) => {
        if (error) {
          // Exit code 1 from ripgrep means "no matches found" - this is normal
          if (error.code !== 1) {
            d('ripgrep error: %o', error)
            logError(error)
          }
          resolve([])
        } else {
          d('ripgrep succeeded with %s', stdout)
          resolve(stdout.trim().split('\n').filter(Boolean))
        }
      },
    )
  })
}

// NB: We do something tricky here. We know that ripgrep processes common
// ignore files for us, so we just ripgrep for any character, which matches
// all non-empty files
export async function listAllContentFiles(
  path: string,
  abortSignal: AbortSignal,
  limit: number,
): Promise<string[]> {
  try {
    d('listAllContentFiles called: %s', path)
    return (await ripGrep(['-l', '.', path], path, abortSignal)).slice(0, limit)
  } catch (e) {
    d('listAllContentFiles failed: %o', e)

    logError(e)
    return []
  }
}

// Test helper: clear memoized path resolution and re-run any one-time checks.
export function resetRipgrepPathCacheForTests(): void {
  clearMemoizeCache(getRipgrepPath)
}
