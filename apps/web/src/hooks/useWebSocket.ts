import React from 'react'

import { HttpClient } from '@kode/client'

export function useWebSocket(args: {
  baseUrl: string
  token: string
  workspaceId: string | null
}): {
  client: HttpClient | null
  connected: boolean
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

  React.useEffect(() => {
    return () => {
      client?.disconnect()
    }
  }, [client])

  const [connected, setConnected] = React.useState(false)
  React.useEffect(() => {
    if (!client) {
      setConnected(false)
      return
    }

    setConnected(client.isConnected())
    const id = window.setInterval(() => {
      setConnected(client.isConnected())
    }, 500)
    return () => window.clearInterval(id)
  }, [client])

  return { client, connected, restartClient }
}
