import { afterEach, describe, expect, test } from 'bun:test'
import http from 'node:http'
import net from 'node:net'
import { BunShell } from '#runtime/shell'
import type { BunShellSandboxOptions } from '#runtime/shell'
import {
  __resetSandboxNetworkInfrastructureForTests,
  ensureSandboxNetworkInfrastructure,
} from '#core/utils/sandbox/sandboxNetworkInfrastructure'
import type { SandboxRuntimeConfig } from '#core/utils/sandbox/sandboxConfig'

function getBunWhich(): ((cmd: string) => unknown) | null {
  const record = globalThis as unknown as Record<string, unknown>
  const bun = record.Bun
  if (!bun || typeof bun !== 'object') return null
  const which = (bun as Record<string, unknown>).which
  return typeof which === 'function'
    ? (which as (cmd: string) => unknown)
    : null
}

async function canListenOnLoopback(): Promise<boolean> {
  return await new Promise(resolve => {
    const server = net.createServer()
    const done = (value: boolean) => {
      try {
        server.close(() => resolve(value))
      } catch {
        resolve(value)
      }
    }

    server.once('error', (err: any) => {
      if (err?.code === 'EPERM') return done(false)
      return done(false)
    })

    server.listen(0, '127.0.0.1', () => done(true))
  })
}

function createRuntimeConfig(): SandboxRuntimeConfig {
  return {
    network: {
      allowedDomains: ['localhost'],
      deniedDomains: [],
      allowUnixSockets: [],
      allowAllUnixSockets: false,
      allowLocalBinding: false,
      httpProxyPort: undefined,
      socksProxyPort: undefined,
    },
    filesystem: { denyRead: [], allowWrite: ['.'], denyWrite: [] },
    ripgrep: { command: 'rg', args: [] },
  }
}

afterEach(async () => {
  await __resetSandboxNetworkInfrastructureForTests()
  BunShell.restart()
})

describe('macOS sandbox-exec network proxy (compatibility)', () => {
  test('sandbox blocks direct localhost connect but allows via proxy', async () => {
    if (process.platform !== 'darwin') {
      return
    }

    const sandboxExecPath = getBunWhich()?.('sandbox-exec')
    if (typeof sandboxExecPath !== 'string' || sandboxExecPath.length === 0) {
      return
    }

    if (!(await canListenOnLoopback())) {
      return
    }

    const server = http.createServer((_req, res) => {
      res.statusCode = 200
      res.setHeader('content-type', 'text/plain')
      res.end('OK')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('server did not bind to a TCP port')
    }
    const destPort = address.port

    const runtimeConfig = createRuntimeConfig()
    const ports = await ensureSandboxNetworkInfrastructure({
      runtimeConfig,
      permissionCallback: null,
    })

    const shell = BunShell.getInstance()
    const sandbox: BunShellSandboxOptions = {
      enabled: true,
      require: true,
      needsNetworkRestriction: true,
      allowUnixSockets: [],
      allowAllUnixSockets: false,
      allowLocalBinding: false,
      httpProxyPort: ports.httpProxyPort,
      socksProxyPort: ports.socksProxyPort,
      readConfig: { denyOnly: [] },
      writeConfig: { allowOnly: ['.'], denyWithinAllow: [] },
    }

    // Bypass proxy for localhost explicitly (should be blocked by sandbox rules).
    const direct = await shell.exec(
      `curl --noproxy '*' -sS http://localhost:${destPort} --max-time 1`,
      undefined,
      5_000,
      { sandbox },
    )
    expect(direct.code).not.toBe(0)

    // Force proxy usage for localhost (NO_PROXY is set by sandbox env).
    const proxied = await shell.exec(
      `NO_PROXY= no_proxy= curl --noproxy '' -sS http://localhost:${destPort} --max-time 2`,
      undefined,
      5_000,
      { sandbox },
    )
    expect(proxied.code).toBe(0)
    expect(proxied.stdout).toContain('OK')

    await new Promise<void>(resolve => server.close(() => resolve()))
  })
})
