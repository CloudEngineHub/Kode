import React from 'react'

import { HttpClient } from '@kode/client'
import type { KodeClient } from '@kode/client'

export function useRuntimeClient(args: {
  baseUrl: string
  token: string
  workspaceId: string | null
}): {
  client: KodeClient | null
  runtimeAttached: boolean
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

  return { client, runtimeAttached, restartClient }
}
