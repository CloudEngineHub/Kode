const IN_MEMORY_ERROR_LOG: Array<{ error: string; timestamp: string }> = []
const MAX_IN_MEMORY_ERRORS = 100

export function logError(error: unknown): void {
  try {
    if (process.env.NODE_ENV === 'test') {
      console.error(error)
    }

    const errorStr =
      error instanceof Error ? error.stack || error.message : String(error)

    if (IN_MEMORY_ERROR_LOG.length >= MAX_IN_MEMORY_ERRORS) {
      IN_MEMORY_ERROR_LOG.shift()
    }
    IN_MEMORY_ERROR_LOG.push({
      error: errorStr,
      timestamp: new Date().toISOString(),
    })
  } catch {
    // best-effort logging
  }
}

export function getInMemoryHookErrors(): object[] {
  return [...IN_MEMORY_ERROR_LOG]
}
