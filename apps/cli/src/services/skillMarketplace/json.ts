import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { ensureDir } from './fsUtils'

export function readJsonFile<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback
    const raw = readFileSync(path, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJsonFile(path: string, value: unknown): void {
  ensureDir(dirname(path))
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
