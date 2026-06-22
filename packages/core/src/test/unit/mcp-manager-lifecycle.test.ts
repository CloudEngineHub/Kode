import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { WrappedClient } from '#core/mcp/client/types'
import { MCPClientManager } from '#core/mcp/client/manager'

function createMockSdkClient() {
  return {
    ping: mock(async () => {}),
    close: mock(async () => {}),
    getServerCapabilities: () => null,
    request: mock(async () => ({})),
    setNotificationHandler: mock(() => {}),
  } as any
}

const sdkClientsByName = new Map<
  string,
  ReturnType<typeof createMockSdkClient>
>()

function getOrCreateSdkClient(name: string) {
  let client = sdkClientsByName.get(name)
  if (!client) {
    client = createMockSdkClient()
    sdkClientsByName.set(name, client)
  }
  return client
}

const mockConnectMcpServer = mock(
  async (name: string): Promise<WrappedClient> => ({
    name,
    client: getOrCreateSdkClient(name),
    capabilities: null,
    type: 'connected',
  }),
)

const stdioServer = { command: 'echo', args: [] } as any

function staleHealthCheck(manager: any, name: string) {
  const entry = (manager as any).clients.get(name)
  if (entry) entry.lastHealthCheckAt = 0
}

describe('MCPClientManager', () => {
  beforeEach(() => {
    mockConnectMcpServer.mockClear()
    sdkClientsByName.clear()
  })

  test('connects to new servers', async () => {
    const manager = new MCPClientManager(mockConnectMcpServer as any)

    const results = await manager.getClientsForServers({ alpha: stdioServer })

    expect(results).toHaveLength(1)
    expect(results[0]!.type).toBe('connected')
    expect(results[0]!.name).toBe('alpha')
    expect(mockConnectMcpServer).toHaveBeenCalledTimes(1)
  })

  test('reuses connection when health check is not yet due', async () => {
    const manager = new MCPClientManager(mockConnectMcpServer as any)
    const servers = { alpha: stdioServer }

    const first = await manager.getClientsForServers(servers)
    const second = await manager.getClientsForServers(servers)

    expect(mockConnectMcpServer).toHaveBeenCalledTimes(1)
    expect((second[0] as any).client).toBe((first[0] as any).client)
  })

  test('reconnects when ping fails', async () => {
    const manager = new MCPClientManager(mockConnectMcpServer as any)
    const servers = { alpha: stdioServer }

    await manager.getClientsForServers(servers)

    const oldClient = sdkClientsByName.get('alpha')!
    oldClient.ping = mock(async () => {
      throw new Error('ping timeout')
    })

    const newClient = createMockSdkClient()
    sdkClientsByName.set('alpha', newClient)

    staleHealthCheck(manager, 'alpha')

    const results = await manager.getClientsForServers(servers)

    expect(mockConnectMcpServer).toHaveBeenCalledTimes(2)
    expect(oldClient.close).toHaveBeenCalledTimes(1)
    expect((results[0] as any).client).toBe(newClient)
  })

  test('closes removed servers by default (closeMissing=true)', async () => {
    const manager = new MCPClientManager(mockConnectMcpServer as any)

    await manager.getClientsForServers({
      alpha: stdioServer,
      beta: stdioServer,
    })

    const betaClient = sdkClientsByName.get('beta')!

    await manager.getClientsForServers({ alpha: stdioServer })

    expect(betaClient.close).toHaveBeenCalledTimes(1)
  })

  test('keeps removed servers when closeMissing=false', async () => {
    const manager = new MCPClientManager(mockConnectMcpServer as any)

    await manager.getClientsForServers({
      alpha: stdioServer,
      beta: stdioServer,
    })

    const betaClient = sdkClientsByName.get('beta')!

    await manager.getClientsForServers(
      { alpha: stdioServer },
      { closeMissing: false },
    )

    expect(betaClient.close).not.toHaveBeenCalled()
  })

  test('reconnects when server config changes', async () => {
    const manager = new MCPClientManager(mockConnectMcpServer as any)

    await manager.getClientsForServers({
      alpha: { command: 'echo', args: ['v1'] } as any,
    })

    const oldClient = sdkClientsByName.get('alpha')!
    sdkClientsByName.delete('alpha')

    await manager.getClientsForServers({
      alpha: { command: 'echo', args: ['v2'] } as any,
    })

    expect(oldClient.close).toHaveBeenCalledTimes(1)
    expect(mockConnectMcpServer).toHaveBeenCalledTimes(2)
  })

  test('clear() closes all connections', async () => {
    const manager = new MCPClientManager(mockConnectMcpServer as any)

    await manager.getClientsForServers({
      alpha: stdioServer,
      beta: stdioServer,
    })

    const alphaClient = sdkClientsByName.get('alpha')!
    const betaClient = sdkClientsByName.get('beta')!

    manager.clear()

    expect(alphaClient.close).toHaveBeenCalledTimes(1)
    expect(betaClient.close).toHaveBeenCalledTimes(1)
  })

  test('returns failed type when connection fails', async () => {
    const manager = new MCPClientManager(mockConnectMcpServer as any)
    mockConnectMcpServer.mockImplementationOnce(async () => ({
      name: 'alpha',
      type: 'failed' as const,
    }))

    const results = await manager.getClientsForServers({ alpha: stdioServer })

    expect(results).toHaveLength(1)
    expect(results[0]!.type).toBe('failed')
  })

  test('does not retry failed server within FAILED_RETRY_INTERVAL_MS', async () => {
    const manager = new MCPClientManager(mockConnectMcpServer as any)
    mockConnectMcpServer.mockImplementation(async () => ({
      name: 'alpha',
      type: 'failed' as const,
    }))

    await manager.getClientsForServers({ alpha: stdioServer })
    await manager.getClientsForServers({ alpha: stdioServer })

    expect(mockConnectMcpServer).toHaveBeenCalledTimes(1)
  })
})
