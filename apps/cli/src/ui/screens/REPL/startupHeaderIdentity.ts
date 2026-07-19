type StartupHeaderMcpClient = {
  name?: unknown
  type?: unknown
}

export type StartupHeaderIdentityInput = {
  forkNumber: number
  isDefaultModel: boolean
  updateAvailableVersion?: string | null
  updateCommands?: string[] | null
  mcpClients: StartupHeaderMcpClient[]
}

export function buildStartupHeaderIdentityKey({
  forkNumber,
  isDefaultModel,
  updateAvailableVersion,
  updateCommands,
  mcpClients,
}: StartupHeaderIdentityInput): string {
  const mcpKey = mcpClients
    .map(client => `${String(client.type ?? '')}:${String(client.name ?? '')}`)
    .join('\u0000')
  const updateCommandsKey = updateCommands?.join('\u0000') ?? ''
  return [
    forkNumber,
    isDefaultModel ? 'default' : 'custom',
    updateAvailableVersion ?? '',
    updateCommandsKey,
    mcpKey,
  ].join('|')
}
