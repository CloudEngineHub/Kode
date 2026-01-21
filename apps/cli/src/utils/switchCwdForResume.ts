import { resolve as resolvePath } from 'node:path'

import { clearContextCache, getContext } from '#core/context'
import { logError } from '#core/utils/log'
import { getCwd, setCwd } from '#core/utils/state'
import {
  refreshCustomCommandWatcher,
  reloadCustomCommandsForSession,
} from '#cli-services/customCommands'

export async function switchCwdForResume(nextCwd: string): Promise<void> {
  const trimmed = nextCwd.trim()
  if (!trimmed) return

  const current = getCwd()
  if (resolvePath(current) === resolvePath(trimmed)) return

  try {
    process.chdir(trimmed)
  } catch {
    // best-effort
  }

  await setCwd(trimmed)

  try {
    clearContextCache()
    void getContext()
  } catch (error) {
    logError(error)
  }

  try {
    await reloadCustomCommandsForSession()
  } catch (error) {
    logError(error)
  }

  try {
    await refreshCustomCommandWatcher()
  } catch (error) {
    logError(error)
  }
}
