import net from 'node:net'
import { logError } from '#core/utils/log'
import type { SandboxRuntimeConfig } from './sandboxConfig'
import { startHttpProxy } from './sandboxNetworkInfrastructure/httpProxy'
import { startSocks5Proxy } from './sandboxNetworkInfrastructure/socks5Proxy'

export type SandboxNetworkPermissionQuery = { host: string; port: number }
export type SandboxNetworkPermissionCallback = (
  query: SandboxNetworkPermissionQuery,
) => Promise<boolean>

export type SandboxNetworkInfrastructurePorts = {
  httpProxyPort: number
  socksProxyPort: number
}

type ActiveState = {
  config: SandboxRuntimeConfig | null
  permissionCallback: SandboxNetworkPermissionCallback | null
  httpProxyServer: net.Server | null
  socksProxyServer: net.Server | null
  httpProxyPort: number | null
  socksProxyPort: number | null
  initializationPromise: Promise<SandboxNetworkInfrastructurePorts> | null
  cleanupRegistered: boolean
  sessionAllowedHosts: Set<string>
  sessionDeniedHosts: Set<string>
  inflightPermissionRequests: Map<string, Promise<boolean>>
  permissionPromptChain: Promise<void>
}

const active: ActiveState = {
  config: null,
  permissionCallback: null,
  httpProxyServer: null,
  socksProxyServer: null,
  httpProxyPort: null,
  socksProxyPort: null,
  initializationPromise: null,
  cleanupRegistered: false,
  sessionAllowedHosts: new Set(),
  sessionDeniedHosts: new Set(),
  inflightPermissionRequests: new Map(),
  permissionPromptChain: Promise.resolve(),
}

// Compatibility: host/pattern matching supports "*.domain" and exact matches (case-insensitive).
export function matchesSandboxDomainPattern(
  host: string,
  pattern: string,
): boolean {
  if (pattern.startsWith('*.')) {
    const suffix = pattern.substring(2)
    return host.toLowerCase().endsWith('.' + suffix.toLowerCase())
  }
  return host.toLowerCase() === pattern.toLowerCase()
}

async function shouldAllowNetworkRequest(
  query: SandboxNetworkPermissionQuery,
): Promise<boolean> {
  const config = active.config
  if (!config) return false

  const hostKey = query.host.toLowerCase()
  if (active.sessionAllowedHosts.has(hostKey)) return true
  if (active.sessionDeniedHosts.has(hostKey)) return false

  for (const denied of config.network.deniedDomains) {
    if (matchesSandboxDomainPattern(query.host, denied)) return false
  }
  for (const allowed of config.network.allowedDomains) {
    if (matchesSandboxDomainPattern(query.host, allowed)) return true
  }

  const permissionCallback = active.permissionCallback
  if (!permissionCallback) return false

  const existing = active.inflightPermissionRequests.get(hostKey)
  if (existing) return existing

  const requestPromise = (async () => {
    const decision = await serializePermissionPrompt(async () => {
      try {
        return await permissionCallback(query)
      } catch (error) {
        logError(error)
        return false
      }
    })

    if (decision) active.sessionAllowedHosts.add(hostKey)
    else active.sessionDeniedHosts.add(hostKey)

    return decision
  })().finally(() => {
    active.inflightPermissionRequests.delete(hostKey)
  })

  active.inflightPermissionRequests.set(hostKey, requestPromise)
  return requestPromise
}

async function serializePermissionPrompt<T>(
  task: () => Promise<T>,
): Promise<T> {
  let release: (() => void) | null = null
  const next = new Promise<void>(resolve => {
    release = resolve
  })
  const prev = active.permissionPromptChain
  active.permissionPromptChain = prev.then(() => next)

  try {
    await prev
    return await task()
  } finally {
    release?.()
  }
}

function registerCleanupOnce(): void {
  if (active.cleanupRegistered) return
  active.cleanupRegistered = true

  const cleanup = () => {
    void cleanupSandboxNetworkInfrastructure()
  }

  process.once('exit', cleanup)
  process.once('SIGINT', cleanup)
  process.once('SIGTERM', cleanup)
}

async function cleanupSandboxNetworkInfrastructure(): Promise<void> {
  const httpServer = active.httpProxyServer
  const socksServer = active.socksProxyServer
  active.httpProxyServer = null
  active.socksProxyServer = null
  active.httpProxyPort = null
  active.socksProxyPort = null
  active.initializationPromise = null

  active.sessionAllowedHosts.clear()
  active.sessionDeniedHosts.clear()
  active.inflightPermissionRequests.clear()

  await Promise.allSettled([
    httpServer
      ? new Promise<void>(resolve => {
          try {
            httpServer.close(() => resolve())
          } catch {
            resolve()
          }
        })
      : Promise.resolve(),
    socksServer
      ? new Promise<void>(resolve => {
          try {
            socksServer.close(() => resolve())
          } catch {
            resolve()
          }
        })
      : Promise.resolve(),
  ])
}

export async function ensureSandboxNetworkInfrastructure(options: {
  runtimeConfig: SandboxRuntimeConfig
  permissionCallback?: SandboxNetworkPermissionCallback | null
}): Promise<SandboxNetworkInfrastructurePorts> {
  active.config = options.runtimeConfig
  active.permissionCallback = options.permissionCallback ?? null

  if (active.initializationPromise) return active.initializationPromise

  registerCleanupOnce()

  active.initializationPromise = (async () => {
    const httpProxyPort =
      options.runtimeConfig.network.httpProxyPort !== undefined
        ? options.runtimeConfig.network.httpProxyPort
        : await startHttpProxy({
            shouldAllowNetworkRequest,
            onServer: server => {
              active.httpProxyServer = server
            },
          })

    const socksProxyPort =
      options.runtimeConfig.network.socksProxyPort !== undefined
        ? options.runtimeConfig.network.socksProxyPort
        : await startSocks5Proxy({
            shouldAllowNetworkRequest,
            onServer: server => {
              active.socksProxyServer = server
            },
          })

    active.httpProxyPort = httpProxyPort
    active.socksProxyPort = socksProxyPort

    return { httpProxyPort, socksProxyPort }
  })().catch(async error => {
    active.initializationPromise = null
    await cleanupSandboxNetworkInfrastructure()
    throw error
  })

  return active.initializationPromise
}

export function getSandboxNetworkInfrastructurePorts(): SandboxNetworkInfrastructurePorts | null {
  if (active.httpProxyPort === null || active.socksProxyPort === null)
    return null
  return {
    httpProxyPort: active.httpProxyPort,
    socksProxyPort: active.socksProxyPort,
  }
}

export async function __resetSandboxNetworkInfrastructureForTests(): Promise<void> {
  await cleanupSandboxNetworkInfrastructure()
  active.permissionCallback = null
  active.config = null
  active.permissionPromptChain = Promise.resolve()
}
