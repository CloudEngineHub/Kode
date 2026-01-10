import { memoize, pickBy } from 'lodash-es'
import type { ServerCapabilities } from '@modelcontextprotocol/sdk/types.js'

import type { McpServerConfig } from '#core/utils/config'
import {
  getCurrentProjectConfig,
  getGlobalConfig,
  getProjectMcpServerDefinitions,
} from '#core/utils/config'
import { getCwd } from '#core/utils/state'
import { logMCPError } from '#core/utils/log'

import {
  getMcprcServerStatus,
  listPluginMCPServers,
  parseMcpServersFromCliConfigEntries,
} from './config'
import { connectToServer } from './connection'
import { getMcpServerConnectionBatchSize } from './settings'
import type { WrappedClient } from './types'

export const getClients = memoize(async (): Promise<WrappedClient[]> => {
  if (process.env.CI && process.env.NODE_ENV !== 'test') {
    return []
  }

  const pluginServers = listPluginMCPServers()
  const globalServers = getGlobalConfig().mcpServers ?? {}
  const projectFileServers = getProjectMcpServerDefinitions().servers
  const projectServers = getCurrentProjectConfig().mcpServers ?? {}

  const approvedProjectFileServers = pickBy(
    projectFileServers,
    (_, name) => getMcprcServerStatus(name) === 'approved',
  )

  const allServers: Record<string, McpServerConfig> = {
    ...pluginServers,
    ...globalServers,
    ...approvedProjectFileServers,
    ...projectServers,
  }

  const batchSize = getMcpServerConnectionBatchSize()
  const entries = Object.entries(allServers)
  const results: WrappedClient[] = []

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(async ([name, serverRef]) => {
        try {
          const client = await connectToServer(name, serverRef)
          let capabilities: ServerCapabilities | null = null
          try {
            capabilities = client.getServerCapabilities() ?? null
          } catch {
            capabilities = null
          }
          return { name, client, capabilities, type: 'connected' as const }
        } catch (error) {
          logMCPError(
            name,
            `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
          )
          return { name, type: 'failed' as const }
        }
      }),
    )
    results.push(...batchResults)
  }

  return results
})

export async function getClientsForCliMcpConfig(options: {
  mcpConfig?: string[]
  strictMcpConfig?: boolean
  projectDir?: string
}): Promise<WrappedClient[]> {
  const projectDir = options.projectDir ?? getCwd()
  const entries =
    Array.isArray(options.mcpConfig) && options.mcpConfig.length > 0
      ? options.mcpConfig
      : []
  const strict = options.strictMcpConfig === true

  if (entries.length === 0 && !strict) {
    return getClients()
  }

  const cliServers = parseMcpServersFromCliConfigEntries({
    entries,
    projectDir,
  })

  const pluginServers = strict ? {} : listPluginMCPServers()
  const globalServers = strict ? {} : (getGlobalConfig().mcpServers ?? {})
  const projectFileServers = strict
    ? {}
    : getProjectMcpServerDefinitions().servers
  const projectServers = strict
    ? {}
    : (getCurrentProjectConfig().mcpServers ?? {})

  const approvedProjectFileServers = strict
    ? {}
    : pickBy(
        projectFileServers,
        (_, name) => getMcprcServerStatus(name) === 'approved',
      )

  const allServers: Record<string, McpServerConfig> = {
    ...(pluginServers ?? {}),
    ...(globalServers ?? {}),
    ...(approvedProjectFileServers ?? {}),
    ...(projectServers ?? {}),
    ...(cliServers ?? {}),
  }

  const batchSize = getMcpServerConnectionBatchSize()
  const entriesToConnect = Object.entries(allServers)
  const results: WrappedClient[] = []

  for (let i = 0; i < entriesToConnect.length; i += batchSize) {
    const batch = entriesToConnect.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(async ([name, serverRef]) => {
        try {
          const client = await connectToServer(name, serverRef)
          let capabilities: ServerCapabilities | null = null
          try {
            capabilities = client.getServerCapabilities() ?? null
          } catch {
            capabilities = null
          }
          return { name, client, capabilities, type: 'connected' as const }
        } catch (error) {
          logMCPError(
            name,
            `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
          )
          return { name, type: 'failed' as const }
        }
      }),
    )
    results.push(...batchResults)
  }

  return results
}
