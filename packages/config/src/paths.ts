import { join } from 'node:path'
import { homedir } from 'node:os'

const CONFIG_BASE_DIR = '.kode'
const CONFIG_FILE = '.kode.json'

export function getKodeBaseDir(): string {
  return (
    process.env.KODE_CONFIG_DIR ??
    process.env.CLAUDE_CONFIG_DIR ??
    join(homedir(), CONFIG_BASE_DIR)
  )
}

export function getGlobalConfigFilePath(): string {
  return process.env.KODE_CONFIG_DIR || process.env.CLAUDE_CONFIG_DIR
    ? join(getKodeBaseDir(), 'config.json')
    : join(homedir(), CONFIG_FILE)
}
