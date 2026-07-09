import React from 'react'

import { HttpClient } from '@kode/client'
import type { KodeClient, RuntimeStatus } from '@kode/client'

const RUNTIME_STATUS_POLL_MS = 5_000

export function useRuntimeClient(args: {
  baseUrl: string
  token: string
  workspaceId: string | null
}): {
  client: KodeClient | null
  runtimeAttached: boolean
  runtimeStatus: RuntimeStatus | null
  restartClient: () => void
} {
  const [nonce, setNonce] = React.useState(0)
  const restartClient = React.useCallback(() => setNonce(n => n + 1), [])

  const client = React.useMemo(() => {
    if (!args.token) return null
    return new HttpClient({
      baseUrl: args.baseUrl,
      token: args.token,
      workspaceId: args.workspaceId ?? undefined,
    })
  }, [args.baseUrl, args.token, args.workspaceId, nonce])

  const [runtimeAttached, setRuntimeAttached] = React.useState(false)
  const [runtimeStatus, setRuntimeStatus] =
    React.useState<RuntimeStatus | null>(null)

  const refreshRuntimeStatus = React.useCallback(async () => {
    if (!client) {
      setRuntimeStatus(null)
      return
    }
    try {
      setRuntimeStatus(await client.getRuntimeStatus())
    } catch {
      setRuntimeStatus({
        ok: false,
        transport: 'daemon',
        pid: null,
        version: null,
        activeSessions: null,
      })
    }
  }, [client])

  React.useEffect(() => {
    if (!client) {
      setRuntimeAttached(false)
      return
    }

    setRuntimeAttached(client.isConnected())
    const unsubscribe = client.onConnectionChange(setRuntimeAttached)
    return () => {
      unsubscribe()
      client.disconnect()
    }
  }, [client])

  React.useEffect(() => {
    if (!client) {
      setRuntimeStatus(null)
      return
    }
    void refreshRuntimeStatus()
    const timer = setInterval(() => {
      void refreshRuntimeStatus()
    }, RUNTIME_STATUS_POLL_MS)
    return () => clearInterval(timer)
  }, [refreshRuntimeStatus])

  return { client, runtimeAttached, runtimeStatus, restartClient }
}
