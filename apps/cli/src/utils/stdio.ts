import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CACHE_PATHS, DATE } from '#core/logging/log/paths'

type WriteFn = typeof process.stdout.write
type WriteCallback = (err?: NodeJS.ErrnoException | null) => void

// Capture original write fns before any monkey patching.
const originalStdoutWrite: WriteFn = process.stdout.write.bind(process.stdout)
const originalStderrWrite: WriteFn = process.stderr.write.bind(process.stderr)

// Expose original write fns for code outside the CLI layer (e.g. core notifier) so
// terminal control sequences can bypass the TUI stdio guard without corrupting Ink.
;(globalThis as any).__KODE_ORIGINAL_STDOUT_WRITE__ ??= originalStdoutWrite
;(globalThis as any).__KODE_ORIGINAL_STDERR_WRITE__ ??= originalStderrWrite

export function writeToStdout(
  chunk: Uint8Array | string,
  cb?: WriteCallback,
): boolean
export function writeToStdout(
  chunk: Uint8Array | string,
  encoding?: BufferEncoding,
  cb?: WriteCallback,
): boolean
export function writeToStdout(
  chunk: Uint8Array | string,
  encodingOrCb?: BufferEncoding | WriteCallback,
  cb?: WriteCallback,
): boolean {
  return (originalStdoutWrite as unknown as any)(chunk, encodingOrCb, cb)
}

export function writeToStderr(
  chunk: Uint8Array | string,
  cb?: WriteCallback,
): boolean
export function writeToStderr(
  chunk: Uint8Array | string,
  encoding?: BufferEncoding,
  cb?: WriteCallback,
): boolean
export function writeToStderr(
  chunk: Uint8Array | string,
  encodingOrCb?: BufferEncoding | WriteCallback,
  cb?: WriteCallback,
): boolean {
  return (originalStderrWrite as unknown as any)(chunk, encodingOrCb, cb)
}

const CSI = '\x1b['
const SYNC_OUTPUT_START = `${CSI}?2026h`
const SYNC_OUTPUT_END = `${CSI}?2026l`

let syncOutputActive = false
let syncOutputFlushHandle: ReturnType<typeof setImmediate> | null = null
let syncOutputExitHooked = false

function shouldUseSynchronizedOutput(): boolean {
  if (process.env.NODE_ENV === 'test') return false
  if (!process.stdout?.isTTY) return false
  const screenReaderEnv =
    process.env.KODE_SCREEN_READER ?? process.env.SCREENREADER
  if (screenReaderEnv) return false

  const env = process.env.KODE_SYNC_OUTPUT
  if (env === '0' || env === 'false') return false

  // Default to enabled on TTY unless explicitly disabled.
  return true
}

function ensureSyncOutputExitHooked(): void {
  if (syncOutputExitHooked) return
  syncOutputExitHooked = true
  process.once('exit', () => {
    if (!syncOutputActive) return
    try {
      originalStdoutWrite(SYNC_OUTPUT_END)
    } catch {
      // best-effort only
    }
  })
}

function beginSynchronizedOutput(): void {
  if (syncOutputActive) return
  syncOutputActive = true
  ensureSyncOutputExitHooked()
  originalStdoutWrite(SYNC_OUTPUT_START)
}

function scheduleEndSynchronizedOutput(): void {
  if (!syncOutputActive) return

  if (syncOutputFlushHandle) {
    clearImmediate(syncOutputFlushHandle)
  }

  syncOutputFlushHandle = setImmediate(() => {
    syncOutputFlushHandle = null
    if (!syncOutputActive) return
    syncOutputActive = false
    originalStdoutWrite(SYNC_OUTPUT_END)
  })
}

function writeToInkStdout(
  chunk: Uint8Array | string,
  cb?: WriteCallback,
): boolean
function writeToInkStdout(
  chunk: Uint8Array | string,
  encoding?: BufferEncoding,
  cb?: WriteCallback,
): boolean
function writeToInkStdout(
  chunk: Uint8Array | string,
  encodingOrCb?: BufferEncoding | WriteCallback,
  cb?: WriteCallback,
): boolean {
  if (!shouldUseSynchronizedOutput()) {
    return (originalStdoutWrite as unknown as any)(chunk, encodingOrCb, cb)
  }

  beginSynchronizedOutput()
  const result = (originalStdoutWrite as unknown as any)(
    chunk,
    encodingOrCb,
    cb,
  )
  scheduleEndSynchronizedOutput()
  return result
}

export function createInkStdio(): {
  stdout: NodeJS.WriteStream
  stderr: NodeJS.WriteStream
} {
  const stdout = new Proxy(process.stdout, {
    get(target, prop, receiver) {
      if (prop === 'write') return writeToInkStdout
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as unknown as NodeJS.WriteStream

  const stderr = new Proxy(process.stderr, {
    get(target, prop, receiver) {
      if (prop === 'write') return writeToStderr
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as unknown as NodeJS.WriteStream

  return { stdout, stderr }
}

const CAPTURE_MAX_BYTES = 128 * 1024
let captureBytes = 0
const captureChunks: string[] = []

function chunkToString(
  chunk: Uint8Array | string,
  encoding: BufferEncoding | undefined,
): string {
  if (typeof chunk === 'string') return chunk
  try {
    // Buffer is a Uint8Array subclass; Buffer.from avoids surprises for non-Buffer Uint8Array.
    return Buffer.from(chunk).toString(encoding ?? 'utf8')
  } catch {
    return String(chunk)
  }
}

function recordPatchedWrite(
  streamLabel: 'stdout' | 'stderr',
  chunk: Uint8Array | string,
  encoding: BufferEncoding | undefined,
): void {
  if (captureBytes >= CAPTURE_MAX_BYTES) return
  const text = chunkToString(chunk, encoding)
  const remaining = CAPTURE_MAX_BYTES - captureBytes
  const slice = text.length > remaining ? text.slice(0, remaining) : text
  captureBytes += slice.length
  captureChunks.push(`[${streamLabel}] ${slice}`)
}

function flushCapturedWritesToFile(): void {
  if (captureChunks.length === 0) return
  try {
    const dir = CACHE_PATHS.errors()
    mkdirSync(dir, { recursive: true })
    const filePath = join(dir, `stdio-${DATE}.log`)
    writeFileSync(filePath, captureChunks.join(''), 'utf8')
  } catch {
    // best-effort only
  }
}

export function getCapturedTuiStdioText(): string | null {
  return captureChunks.length > 0 ? captureChunks.join('') : null
}

export function getCapturedTuiStdioLogPath(): string {
  return join(CACHE_PATHS.errors(), `stdio-${DATE}.log`)
}

export function flushCapturedTuiStdioToFile(): string | null {
  if (captureChunks.length === 0) return null
  try {
    const dir = CACHE_PATHS.errors()
    mkdirSync(dir, { recursive: true })
    const filePath = join(dir, `stdio-${DATE}.log`)
    writeFileSync(filePath, captureChunks.join(''), 'utf8')
    return filePath
  } catch {
    return null
  }
}

export function clearCapturedTuiStdio(): void {
  captureBytes = 0
  captureChunks.length = 0
}

let stdioPatched = false
let restoreStdioPatch: (() => void) | null = null
let inkStdio: ReturnType<typeof createInkStdio> | null = null

export function isStdioPatchedForTui(): boolean {
  return stdioPatched
}

export function ensureTuiStdioPatched(): {
  stdout: NodeJS.WriteStream
  stderr: NodeJS.WriteStream
} {
  if (process.env.NODE_ENV === 'test') {
    return { stdout: process.stdout, stderr: process.stderr }
  }

  if (!inkStdio) {
    inkStdio = createInkStdio()
  }

  if (stdioPatched) {
    return inkStdio
  }

  const previousStdoutWrite = process.stdout.write.bind(process.stdout)
  const previousStderrWrite = process.stderr.write.bind(process.stderr)

  process.stdout.write = (
    chunk: Uint8Array | string,
    encodingOrCb?:
      | BufferEncoding
      | ((err?: NodeJS.ErrnoException | null) => void),
    cb?: (err?: NodeJS.ErrnoException | null) => void,
  ) => {
    const encoding = typeof encodingOrCb === 'string' ? encodingOrCb : undefined
    recordPatchedWrite('stdout', chunk, encoding)
    const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb
    callback?.()
    return true
  }

  process.stderr.write = (
    chunk: Uint8Array | string,
    encodingOrCb?:
      | BufferEncoding
      | ((err?: NodeJS.ErrnoException | null) => void),
    cb?: (err?: NodeJS.ErrnoException | null) => void,
  ) => {
    const encoding = typeof encodingOrCb === 'string' ? encodingOrCb : undefined
    recordPatchedWrite('stderr', chunk, encoding)
    const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb
    callback?.()
    return true
  }

  restoreStdioPatch = () => {
    process.stdout.write = previousStdoutWrite
    process.stderr.write = previousStderrWrite
    stdioPatched = false
    flushCapturedWritesToFile()
  }

  stdioPatched = true
  // Ensure we don't lose evidence when the process terminates.
  process.once('exit', () => flushCapturedWritesToFile())

  return inkStdio
}

export function restoreTuiStdioPatch(): void {
  restoreStdioPatch?.()
  restoreStdioPatch = null
}
