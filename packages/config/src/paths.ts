import { join } from 'node:path'
import { homedir } from 'node:os'
import { getKodeRoot } from './dataRoots'

const CONFIG_FILE = '.kode.json'

export function getKodeBaseDir(): string {
  return getKodeRoot()
}

export function getGlobalConfigFilePath(): string {
  const hasOverride = Boolean(
    process.env.KODE_CONFIG_DIR || process.env.ANYKODE_CONFIG_DIR,
  )
  return hasOverride
    ? join(getKodeBaseDir(), 'config.json')
    : join(homedir(), CONFIG_FILE)
}
