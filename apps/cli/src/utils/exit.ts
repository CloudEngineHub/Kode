type CliExitHandler = (code: number) => void | Promise<void>

let exitHandler: CliExitHandler | null = null
let exitRequested = false

export function setCliExitHandler(handler: CliExitHandler | null): void {
  exitHandler = handler
}

export function requestCliExit(code = 0): void {
  if (exitRequested) {
    process.exit(code)
  }

  exitRequested = true

  if (!exitHandler) {
    process.exit(code)
  }

  try {
    const result = exitHandler(code)
    if (result && typeof result.catch === 'function') {
      result.catch(() => process.exit(code))
    }
  } catch {
    process.exit(code)
  }
}

export function resetCliExitRequestForTests(): void {
  exitRequested = false
  exitHandler = null
}
