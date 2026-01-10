import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

import { SESSION_ID } from '#core/utils/log'

import { isDebugMode } from './mode'
import type { LogEntry } from './types'

export const STARTUP_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-')
const REQUEST_START_TIME = Date.now()

export const KODE_DIR = join(homedir(), '.kode')

function getProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

export const DEBUG_PATHS = {
  base: () => join(KODE_DIR, getProjectDir(process.cwd()), 'debug'),
  detailed: () => join(DEBUG_PATHS.base(), `${STARTUP_TIMESTAMP}-detailed.log`),
  flow: () => join(DEBUG_PATHS.base(), `${STARTUP_TIMESTAMP}-flow.log`),
  api: () => join(DEBUG_PATHS.base(), `${STARTUP_TIMESTAMP}-api.log`),
  state: () => join(DEBUG_PATHS.base(), `${STARTUP_TIMESTAMP}-state.log`),
}

export function ensureDebugDir(): void {
  const debugDir = DEBUG_PATHS.base()
  if (!existsSync(debugDir)) {
    mkdirSync(debugDir, { recursive: true })
  }
}

export function writeToFile(filePath: string, entry: LogEntry): void {
  if (!isDebugMode()) return

  try {
    ensureDebugDir()
    const logLine =
      JSON.stringify(
        {
          ...entry,
          sessionId: SESSION_ID,
          pid: process.pid,
          uptime: Date.now() - REQUEST_START_TIME,
        },
        null,
        2,
      ) + ',\n'

    appendFileSync(filePath, logLine)
  } catch {
    // ignore
  }
}
