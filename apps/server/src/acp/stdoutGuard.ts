import { format } from 'node:util'

type WriteFn = typeof process.stdout.write

type GuardHandle = {
  /**
   * Write a single ACP JSON-RPC line to the original stdout (adds `\\n`).
   * Use this for protocol messages only.
   */
  writeAcpLine: (line: string) => void
  /** Restore original stdout/console behavior. */
  restore: () => void
  /** Original stdout write (unmodified). */
  originalStdoutWrite: WriteFn
}

function writeTo(
  write: WriteFn,
  chunk: Parameters<WriteFn>[0],
  encoding?: BufferEncoding | ((err?: Error | null) => void),
  cb?: (err?: Error | null) => void,
): boolean {
  if (typeof encoding === 'function') {
    return write(chunk, encoding)
  }
  return write(chunk, encoding, cb)
}

/**
 * ACP requires stdout to contain only JSON-RPC messages. This guard redirects
 * accidental stdout writes (console.log / process.stdout.write) to stderr while
 * preserving a dedicated writer for ACP output.
 */
export function installStdoutGuard(): GuardHandle {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout)
  const originalStderrWrite = process.stderr.write.bind(process.stderr)

  const originalConsoleLog = console.log.bind(console)
  const originalConsoleInfo = console.info.bind(console)
  const originalConsoleDebug = console.debug.bind(console)
  const originalConsoleWarn = console.warn.bind(console)
  const originalConsoleError = console.error.bind(console)

  const writeAcpLine = (line: string) => {
    // Protocol framing: newline delimited JSON (no embedded newlines in the message).
    writeTo(originalStdoutWrite, `${line}\n`)
  }

  const writeLogToStderr: typeof console.log = (...args) => {
    writeTo(originalStderrWrite, `${format(...args)}\n`)
  }

  // Redirect log-ish output away from stdout. (warn/error are already stderr in Node,
  // but we normalize for Bun/edge runtimes and to avoid surprises.)
  console.log = writeLogToStderr
  console.info = writeLogToStderr
  console.debug = writeLogToStderr
  console.warn = writeLogToStderr
  console.error = writeLogToStderr

  process.stdout.write = (chunk: any, encoding?: any, cb?: any) => {
    return writeTo(originalStderrWrite, chunk, encoding, cb)
  }

  const restore = () => {
    process.stdout.write = originalStdoutWrite
    console.log = originalConsoleLog
    console.info = originalConsoleInfo
    console.debug = originalConsoleDebug
    console.warn = originalConsoleWarn
    console.error = originalConsoleError
  }

  return { writeAcpLine, restore, originalStdoutWrite }
}
