import type { ConnectionTestParams, ConnectionTestResult } from './types'
import { performConnectionTest } from './performConnectionTest'

export async function runConnectionTestFlow({
  params,
  navigateTo,
  setTimeoutFn,
  onProgress,
  performConnectionTestFn,
}: {
  params: ConnectionTestParams
  navigateTo: (screen: 'confirmation') => void
  setTimeoutFn?: (callback: () => void, delayMs: number) => unknown
  onProgress?: (result: ConnectionTestResult) => void
  performConnectionTestFn?: (
    params: ConnectionTestParams,
    options?: { onProgress?: (result: ConnectionTestResult) => void },
  ) => Promise<ConnectionTestResult>
}): Promise<ConnectionTestResult> {
  const result = await (performConnectionTestFn ?? performConnectionTest)(
    params,
    { onProgress },
  )

  if (result.success) {
    const schedule =
      setTimeoutFn ?? ((callback, delayMs) => setTimeout(callback, delayMs))
    schedule(() => {
      navigateTo('confirmation')
    }, 2000)
  }

  return result
}
