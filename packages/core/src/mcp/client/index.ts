export type { ConnectedClient, FailedClient, WrappedClient } from './types'

export type { ScopedMcpServerConfig } from './config'
export {
  addMcpServer,
  ensureConfigScope,
  getMcprcServerStatus,
  getMcpServer,
  listMCPServers,
  listPluginMCPServers,
  parseEnvVars,
  parseMcpServersFromCliConfigEntries,
  removeMcpServer,
} from './config'

export { getClients, getClientsForCliMcpConfig } from './clients'
export { __setMcpClientsForTests } from './clients'
export { MCPClientManager } from './manager'

export { getMCPTools } from './tools'
export { getMCPCommands, runCommand } from './commands'
export {
  authenticateMcpServer,
  clearMcpAuth,
  getMcpAuthSnapshot,
} from './oauth'
export { resetMcpConnections } from './reset'

export {
  __resetMcpListChangedForTests,
  getMcpListChangedVersion,
  notifyMcpListChanged,
  subscribeMcpListChanged,
  type McpListChangedEvent,
  type McpListKind,
} from './listChanged'
