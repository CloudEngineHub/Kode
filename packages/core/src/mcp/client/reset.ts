import { getClients } from './clients'
import { getMCPCommands } from './commands'
import { getMCPResources, getMCPResourceTemplates } from './resources'
import { unregisterMcpClientRequestHandlers } from './roots'
import { getMCPTools } from './tools'
import type { WrappedClient } from './types'

async function closeClient(client: WrappedClient): Promise<void> {
  if (client.type !== 'connected') return
  unregisterMcpClientRequestHandlers(client.client)
  try {
    await client.client.close()
  } catch {
    // ignore
  }
}

export async function resetMcpConnections(): Promise<void> {
  const cached = (getClients as any).cache?.get?.(undefined) as
    Promise<WrappedClient[]> | undefined

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
  ;(getMCPResources as any).cache?.clear?.()
  ;(getMCPResourceTemplates as any).cache?.clear?.()
}
