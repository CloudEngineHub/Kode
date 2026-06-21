import {
  appendFileSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'fs'
import { dirname, join } from 'path'
import { getKodeRoot } from '#config/dataRoots'
import { LEGACY_ENV } from '#config/compat/legacyEnv'
import { resolveSandboxTmpDir } from './shell/sandboxEnv'

function getKodeBaseDir(): string {
  return getKodeRoot()
}

// Compatibility: project directory is a sanitized cwd string.
function getProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

function getProjectRootForTaskOutputs(): string {
  const override = process.env.KODE_PROJECT_DIR
  if (typeof override === 'string' && override.trim()) return override.trim()

  const legacyOverride = process.env[LEGACY_ENV.projectDir]
  if (typeof legacyOverride === 'string' && legacyOverride.trim())
    return legacyOverride.trim()

  return process.cwd()
}

export function getTaskOutputsStoreDir(): string {
  return join(
    getKodeBaseDir(),
    getProjectDir(getProjectRootForTaskOutputs()),
    'tasks',
  )
}

export function getTaskOutputsUserFacingDir(): string {
  const tmpBase = resolveSandboxTmpDir()
  return join(tmpBase, getProjectDir(getProjectRootForTaskOutputs()), 'tasks')
}

export function getTaskOutputStoreFilePath(taskId: string): string {
  return join(getTaskOutputsStoreDir(), `${taskId}.output`)
}

export function getTaskOutputUserFacingFilePath(taskId: string): string {
  return join(getTaskOutputsUserFacingDir(), `${taskId}.output`)
}

export function ensureTaskOutputsDirExists(): void {
  const storeDir = getTaskOutputsStoreDir()
  if (!existsSync(storeDir)) mkdirSync(storeDir, { recursive: true })

  const userFacingDir = getTaskOutputsUserFacingDir()
  if (!existsSync(userFacingDir)) mkdirSync(userFacingDir, { recursive: true })
}

function isSymlink(filePath: string): boolean {
  try {
    return lstatSync(filePath).isSymbolicLink()
  } catch {
    return false
  }
}

function tryEnsureUserFacingSymlink(taskId: string): boolean {
  const storeFilePath = getTaskOutputStoreFilePath(taskId)
  const userFacingFilePath = getTaskOutputUserFacingFilePath(taskId)
  try {
    const parent = dirname(userFacingFilePath)
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true })

    if (existsSync(userFacingFilePath)) {
      return isSymlink(userFacingFilePath)
    }

    // Windows can require the "type" arg, but it's harmless elsewhere.
    symlinkSync(storeFilePath, userFacingFilePath, 'file')
    return true
  } catch {
    return false
  }
}

export function touchTaskOutputFile(taskId: string): string {
  ensureTaskOutputsDirExists()
  const storeFilePath = getTaskOutputStoreFilePath(taskId)
  if (!existsSync(storeFilePath)) {
    const parent = dirname(storeFilePath)
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true })
    writeFileSync(storeFilePath, '', 'utf8')
  }

  return tryEnsureUserFacingSymlink(taskId)
    ? getTaskOutputUserFacingFilePath(taskId)
    : storeFilePath
}

export function getTaskOutputFilePath(taskId: string): string {
  const storeFilePath = getTaskOutputStoreFilePath(taskId)
  const userFacingFilePath = getTaskOutputUserFacingFilePath(taskId)

  if (existsSync(userFacingFilePath) && isSymlink(userFacingFilePath)) {
    return userFacingFilePath
  }

  if (existsSync(storeFilePath) && tryEnsureUserFacingSymlink(taskId)) {
    return userFacingFilePath
  }

  return storeFilePath
}

export function appendTaskOutput(taskId: string, chunk: string): void {
  try {
    ensureTaskOutputsDirExists()
    appendFileSync(getTaskOutputStoreFilePath(taskId), chunk, 'utf8')
    tryEnsureUserFacingSymlink(taskId)
  } catch {
    // Best-effort: never crash the session on output persistence failures.
  }
}

export function readTaskOutputDelta(
  taskId: string,
  offset: number,
): {
  content: string
  newOffset: number
} {
  try {
    const filePath = getTaskOutputStoreFilePath(taskId)
    if (!existsSync(filePath)) return { content: '', newOffset: offset }
    const size = statSync(filePath).size
    if (size <= offset) return { content: '', newOffset: offset }
    return {
      content: readFileSync(filePath, 'utf8').slice(offset),
      newOffset: size,
    }
  } catch {
    return { content: '', newOffset: offset }
  }
}

export function readTaskOutput(taskId: string): string {
  try {
    const filePath = getTaskOutputStoreFilePath(taskId)
    if (!existsSync(filePath)) return ''
    return readFileSync(filePath, 'utf8')
  } catch {
    return ''
  }
}

export function readTaskOutputTailLines(
  taskId: string,
  maxLines: number,
): string[] {
  try {
    const filePath = getTaskOutputStoreFilePath(taskId)
    if (!existsSync(filePath)) return []

    const size = statSync(filePath).size
    if (size <= 0) return []

    const MAX_BYTES = 64 * 1024
    const start = Math.max(0, size - MAX_BYTES)
    const length = size - start
    if (length <= 0) return []

    const fd = openSync(filePath, 'r')
    try {
      const buf = Buffer.alloc(length)
      readSync(fd, buf, 0, length, start)
      let text = buf.toString('utf8')
      if (start > 0) {
        const firstNewline = text.indexOf('\n')
        if (firstNewline >= 0) text = text.slice(firstNewline + 1)
        else text = ''
      }
      if (!text) return []

      const lines = text.replace(/\r\n/g, '\n').split('\n')
      return lines.slice(-Math.max(0, maxLines))
    } finally {
      closeSync(fd)
    }
  } catch {
    return []
  }
}
