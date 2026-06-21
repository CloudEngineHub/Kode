import { execFileNoThrow } from './execFileNoThrow'
import { memoize } from 'lodash-es'
import { join } from 'path'
import { homedir } from 'os'
import { CONFIG_FILE } from '#core/constants/product'
import { getKodeRoot } from '#config/dataRoots'
// Base directory for local Kode data files.
//
// Note: this must be a function (not a fixed const) because tests (and some host
// integrations) may set env vars after modules are loaded.
export function getKodeBaseDir(): string {
  return getKodeRoot()
}

// Config and data paths
export function getGlobalConfigFilePath(): string {
  const hasOverride = Boolean(
    process.env.KODE_CONFIG_DIR || process.env.ANYKODE_CONFIG_DIR,
  )
  return hasOverride
    ? join(getKodeBaseDir(), 'config.json')
    : join(homedir(), CONFIG_FILE)
}

export function getMemoryDir(): string {
  return join(getKodeBaseDir(), 'memory')
}

// Back-compat exports (prefer calling the functions above in new code).
export const KODE_BASE_DIR = getKodeBaseDir()
export const GLOBAL_CONFIG_FILE = getGlobalConfigFilePath()
export const MEMORY_DIR = getMemoryDir()

const getIsDocker = memoize(async (): Promise<boolean> => {
  // Check for .dockerenv file
  const { code } = await execFileNoThrow('test', ['-f', '/.dockerenv'])
  if (code !== 0) {
    return false
  }
  return process.platform === 'linux'
})

const hasInternetAccess = memoize(async (): Promise<boolean> => {
  const offline =
    process.env.KODE_OFFLINE ??
    process.env.OFFLINE ??
    process.env.NO_NETWORK ??
    ''
  const normalized = String(offline).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return false
  return true
})

// all of these should be immutable
export const env = {
  getIsDocker,
  hasInternetAccess,
  isCI: Boolean(process.env.CI),
  platform:
    process.platform === 'win32'
      ? 'windows'
      : process.platform === 'darwin'
        ? 'macos'
        : 'linux',
  nodeVersion: process.version,
  terminal: process.env.TERM_PROGRAM,
}
