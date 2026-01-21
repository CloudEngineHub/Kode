import { logError } from '#core/utils/log'

import { emitCustomCommandReloaded } from './events'
import { reloadCustomCommands } from './loader'

export async function reloadCustomCommandsForSession(args?: {
  changedPaths?: string[]
}): Promise<void> {
  try {
    reloadCustomCommands()
    const { getCommands } = await import('#cli-commands')
    getCommands.cache.clear?.()
  } catch (error) {
    logError(error)
  } finally {
    emitCustomCommandReloaded({ changedPaths: args?.changedPaths ?? [] })
  }
}
