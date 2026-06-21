import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

import { getKodeAgentSessionId } from '#protocol/utils/kodeAgentSessionId'

import { appendToJsonLog, readJsonLog } from './jsonLog'
import { CACHE_PATHS, DATE, getErrorsPath, getLegacyErrorsPath } from './paths'

const IN_MEMORY_ERROR_LOG: Array<{ error: string; timestamp: string }> = []
const MAX_IN_MEMORY_ERRORS = 100 // Limit to prevent memory issues

export function logError(error: unknown): void {
  try {
    if (process.env.NODE_ENV === 'test') {
      console.error(error)
    }

    const errorStr =
      error instanceof Error ? error.stack || error.message : String(error)

    const errorInfo = {
      error: errorStr,
      timestamp: new Date().toISOString(),
    }

    if (IN_MEMORY_ERROR_LOG.length >= MAX_IN_MEMORY_ERRORS) {
      IN_MEMORY_ERROR_LOG.shift() // Remove oldest error
    }
    IN_MEMORY_ERROR_LOG.push(errorInfo)

    appendToJsonLog(getErrorsPath(), {
      error: errorStr,
    })
  } catch {
    // pass
  }
}

export function getErrorsLog(): object[] {
  return [
    ...readJsonLog(getErrorsPath()),
    ...readJsonLog(getLegacyErrorsPath()),
  ]
}

export function getInMemoryErrors(): object[] {
  return [...IN_MEMORY_ERROR_LOG]
}

export function logMCPError(serverName: string, error: unknown): void {
  try {
    const logDir = CACHE_PATHS.mcpLogs(serverName)
    const errorStr =
      error instanceof Error ? error.stack || error.message : String(error)
    const timestamp = new Date().toISOString()

    const logFile = join(logDir, DATE + '.txt')

    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }

    if (!existsSync(logFile)) {
      writeFileSync(logFile, '[]', 'utf8')
    }

    const errorInfo = {
      error: errorStr,
      timestamp,
      sessionId: getKodeAgentSessionId(),
      cwd: process.cwd(),
    }

    const messages = readJsonLog(logFile)
    messages.push(errorInfo)
    writeFileSync(logFile, JSON.stringify(messages, null, 2), 'utf8')
  } catch {
    // Silently fail
  }
}
