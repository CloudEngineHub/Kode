import { existsSync, readFileSync } from 'fs'
import { dirname } from 'path'
import { MACRO } from '#core/constants/macros'

import { safeMkdir, safeWriteFile } from './filesystem'
import { SESSION_ID } from './paths'

export function readJsonLog(path: string): object[] {
  if (!existsSync(path)) {
    return []
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return []
  }
}

export function appendToJsonLog(path: string, message: object): void {
  if (process.env.USER_TYPE === 'external') {
    return
  }

  const dir = dirname(path)
  if (!safeMkdir(dir)) {
    return
  }

  // Create messages file with empty array if it doesn't exist
  if (!existsSync(path) && !safeWriteFile(path, '[]')) {
    return
  }

  const messages = readJsonLog(path)
  const messageWithTimestamp = {
    ...message,
    cwd: process.cwd(),
    userType: process.env.USER_TYPE,
    sessionId: SESSION_ID,
    timestamp: new Date().toISOString(),
    version: MACRO.VERSION,
  }
  messages.push(messageWithTimestamp)

  safeWriteFile(path, JSON.stringify(messages, null, 2))
}
