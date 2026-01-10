function logError(error: unknown): void {
  if (process.env.NODE_ENV === 'test') {
    console.error(error)
  }
}

export function startStreamReader(
  stream: NodeJS.ReadableStream | null | undefined,
  append: (chunk: string) => void,
): void {
  if (!stream) return
  try {
    stream.setEncoding('utf8')
  } catch {}

  stream.on('data', (chunk: unknown) => {
    const text =
      typeof chunk === 'string'
        ? chunk
        : Buffer.isBuffer(chunk)
          ? chunk.toString('utf8')
          : String(chunk)
    if (text) append(text)
  })
  stream.on('error', err => {
    logError(
      `Stream read error: ${err instanceof Error ? err.message : String(err)}`,
    )
  })
}

export function createCancellableTextCollector(
  stream: NodeJS.ReadableStream | null | undefined,
  options?: { onChunk?: (chunk: string) => void; collectText?: boolean },
): {
  getText: () => string
  done: Promise<void>
  cancel: () => Promise<void>
} {
  let text = ''
  const collectText = options?.collectText !== false
  if (!stream) {
    return {
      getText: () => text,
      done: Promise.resolve(),
      cancel: async () => {},
    }
  }

  let doneResolve: (() => void) | null = null
  const done = new Promise<void>(resolve => {
    doneResolve = resolve
  })

  let finished = false
  let cancelled = false

  const finish = () => {
    if (finished) return
    finished = true
    cleanup()
    doneResolve?.()
    doneResolve = null
  }

  const onData = (chunk: unknown) => {
    const value =
      typeof chunk === 'string'
        ? chunk
        : Buffer.isBuffer(chunk)
          ? chunk.toString('utf8')
          : String(chunk)
    if (!value) return
    if (collectText) text += value
    options?.onChunk?.(value)
  }

  const onError = (err: unknown) => {
    if (!cancelled) {
      logError(
        `Stream read error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    finish()
  }

  const onEnd = () => finish()
  const onClose = () => finish()

  const hasDestroy = (
    value: NodeJS.ReadableStream,
  ): value is NodeJS.ReadableStream & { destroy: () => unknown } => {
    return typeof (value as { destroy?: unknown }).destroy === 'function'
  }

  const cleanup = () => {
    stream.removeListener('data', onData)
    stream.removeListener('error', onError)
    stream.removeListener('end', onEnd)
    stream.removeListener('close', onClose)
  }

  try {
    stream.setEncoding('utf8')
  } catch {}

  stream.on('data', onData)
  stream.on('error', onError)
  stream.on('end', onEnd)
  stream.on('close', onClose)

  return {
    getText: () => text,
    done,
    cancel: async () => {
      cancelled = true
      try {
        if (hasDestroy(stream)) {
          stream.destroy()
        }
      } catch {}
      finish()
    },
  }
}
