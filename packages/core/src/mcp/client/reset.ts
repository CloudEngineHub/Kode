import { getClients } from './clients'
import { getMCPCommands } from './commands'
import { getMCPTools } from './tools'
import type { WrappedClient } from './types'

async function closeClient(client: WrappedClient): Promise<void> {
  if (client.type !== 'connected') return
  try {
    await client.client.close()
  } catch {
    // ignore
  }
}

export async function resetMcpConnections(): Promise<void> {
  const cached = (getClients as any).cache?.get?.(undefined) as
    | Promise<WrappedClient[]>
    | undefined

  if (cached) {
    try {
      const clients = await cached
      await Promise.all(clients.map(closeClient))
    } catch {
      // ignore
    }
  }

  ;(getClients as any).cache?.clear?.()
  ;(getMCPTools as any).cache?.clear?.()
  ;(getMCPCommands as any).cache?.clear?.()
}
