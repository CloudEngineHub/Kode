let activePrintSignalAbortHandlers = 0

export function beginPrintModeSignalAbortHandling(): () => void {
  activePrintSignalAbortHandlers += 1
  let disposed = false

  return () => {
    if (disposed) return
    disposed = true
    activePrintSignalAbortHandlers = Math.max(
      0,
      activePrintSignalAbortHandlers - 1,
    )
  }
}

export function isPrintModeSignalAbortHandlingActive(): boolean {
  return activePrintSignalAbortHandlers > 0
}
