import { describe, expect, mock, test } from 'bun:test'
import { connect } from 'node:net'
import { WebSocketServer } from 'ws'

import { createRoutes } from '../routes'
import { SessionRegistry } from '../sessionRegistry'
import { DaemonTurnGate } from '../turnGate'
import { serveNode, type ServeNodeResult } from './serveNode'

function waitForUpgradeConnectionClose(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const socket = connect({ host: '127.0.0.1', port })
    const timeout = setTimeout(() => {
      socket.destroy()
      reject(new Error('Timed out waiting for failed upgrade to close'))
    }, 2_000)

    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve()
    }

    socket.on('connect', () => {
      socket.write(
        [
          'GET /ws HTTP/1.1',
          `Host: 127.0.0.1:${port}`,
          'Connection: Upgrade',
          'Upgrade: websocket',
          'Sec-WebSocket-Version: 13',
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
          '',
          '',
        ].join('\r\n'),
      )
    })
    socket.on('error', () => {})
    socket.on('close', finish)
  })
}

describe('serveNode WebSocket upgrade handling', () => {
  test('closes the transport and releases a route session when handleUpgrade throws', async () => {
    const sessionRegistry = new SessionRegistry()
    const routes = createRoutes({
      webuiRoot: null,
      checkToken: () => true,
      listWorkspaces: async () => ({
        currentId: 'repo',
        workspaces: [
          {
            id: 'repo',
            path: 'C:/repo',
            title: 'repo',
            branch: null,
            isCurrent: true,
          },
        ],
      }),
      sessionRegistry,
      turnGate: new DaemonTurnGate(),
      cwd: 'C:/repo',
      echo: true,
      echoDelayMs: 0,
      commands: [],
      tools: [],
      toolNames: [],
      slashCommands: [],
      mcpClients: [],
    })
    const webSocketServer = new WebSocketServer({ noServer: true })
    const handleUpgrade = mock(() => {
      throw new Error('upgrade crashed')
    })
    Object.defineProperty(webSocketServer, 'handleUpgrade', {
      configurable: true,
      value: handleUpgrade,
    })
    let server: ServeNodeResult | undefined

    try {
      server = await serveNode({
        hostname: '127.0.0.1',
        port: 0,
        fetch: async (request, upgradeServer) => {
          const response = await routes.fetch(request, upgradeServer)
          // Exercise serveNode's destroy fallback after the route has performed
          // its failed-upgrade cleanup.
          return response?.status === 400 ? undefined : response
        },
        websocket: {
          open: () => {},
          message: () => {},
          close: () => {},
        },
        webSocketServer,
      })

      await waitForUpgradeConnectionClose(server.port)

      expect(handleUpgrade).toHaveBeenCalledTimes(1)
      expect(sessionRegistry.size).toBe(0)
    } finally {
      server?.stop(true)
    }
  })
})
