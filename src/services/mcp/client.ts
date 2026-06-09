import type { McpServerConfig } from '@utils/config'
import {
  getCurrentProjectConfig,
  getGlobalConfig,
  getProjectMcpServerDefinitions,
} from '@utils/config'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { getCwd } from '@utils/state'
import { pickBy } from 'lodash-es'
import { parseJsonOrJsonc } from './internal/jsonc'
import { getMcprcServerStatus, listPluginMCPServers } from './discovery'
import { MCPClientManager } from './manager'
import type { WrappedClient } from './connection'

export type { WrappedClient } from './connection'

const mcpClientManager = new MCPClientManager()

function getConfiguredMcpServers(): Record<string, McpServerConfig> {
  const pluginServers = listPluginMCPServers()
  const globalServers = getGlobalConfig().mcpServers ?? {}
  const projectFileServers = getProjectMcpServerDefinitions().servers
  const projectServers = getCurrentProjectConfig().mcpServers ?? {}

  const approvedProjectFileServers = pickBy(
    projectFileServers,
    (_, name) => getMcprcServerStatus(name) === 'approved',
  )

  return {
    ...pluginServers,
    ...globalServers,
    ...approvedProjectFileServers,
    ...projectServers,
  }
}

type GetClientsFn = (() => Promise<WrappedClient[]>) & {
  cache: { clear: () => void }
}

export const getClients: GetClientsFn = Object.assign(
  async (): Promise<WrappedClient[]> => {
    if (process.env.CI && process.env.NODE_ENV !== 'test') {
      return []
    }

    return mcpClientManager.getClientsForServers(getConfiguredMcpServers())
  },
  {
    cache: {
      clear: () => {
        mcpClientManager.clear()
      },
    },
  },
)

function parseMcpServersFromCliConfigEntries(options: {
  entries: string[]
  projectDir: string
}): Record<string, McpServerConfig> {
  const out: Record<string, McpServerConfig> = {}

  for (const rawEntry of options.entries) {
    const entry = String(rawEntry ?? '').trim()
    if (!entry) continue

    const resolvedPath = resolve(options.projectDir, entry)
    const payload = existsSync(resolvedPath)
      ? readFileSync(resolvedPath, 'utf8')
      : existsSync(entry)
        ? readFileSync(entry, 'utf8')
        : entry

    const parsed = parseJsonOrJsonc(payload)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue

    const rawServers =
      (parsed as any).mcpServers &&
      typeof (parsed as any).mcpServers === 'object' &&
      !Array.isArray((parsed as any).mcpServers)
        ? (parsed as any).mcpServers
        : parsed

    if (
      !rawServers ||
      typeof rawServers !== 'object' ||
      Array.isArray(rawServers)
    )
      continue

    for (const [name, cfg] of Object.entries(rawServers as any)) {
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) continue
      out[name] = cfg as McpServerConfig
    }
  }

  return out
}

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

  const allServers = {
    ...(pluginServers ?? {}),
    ...(globalServers ?? {}),
    ...(approvedProjectFileServers ?? {}),
    ...(projectServers ?? {}),
    ...(cliServers ?? {}),
  }

  return mcpClientManager.getClientsForServers(allServers, {
    closeMissing: false,
  })
}
