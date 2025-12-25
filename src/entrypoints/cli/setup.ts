import { getContext } from '@context'
import { getCurrentProjectConfig } from '@utils/config'
import { cleanupOldMessageFilesInBackground } from '@utils/cleanup'
import { grantReadPermissionForOriginalDir } from '@utils/permissions/filesystem'
import { setCwd, setOriginalCwd } from '@utils/state'
import { debug as debugLogger } from '@utils/debugLogger'

export async function setup(cwd: string, safeMode?: boolean): Promise<void> {
  // Set both current and original working directory if --cwd was provided
  if (cwd !== process.cwd()) {
    setOriginalCwd(cwd)
  }
  await setCwd(cwd)

  // Always grant read permissions for original working dir
  grantReadPermissionForOriginalDir()

  // Start watching agent configuration files for changes
  // Try ESM-friendly path first (compiled dist), then fall back to extensionless (dev/tsx)
  let agentLoader: any
  try {
    agentLoader = await import('@utils/agentLoader')
  } catch {
    agentLoader = await import('@utils/agentLoader')
  }
  const { startAgentWatcher } = agentLoader
  await startAgentWatcher(() => {
    // Cache is already cleared in the watcher, just log
    debugLogger.info('AGENTS_HOT_RELOADED', { ok: true })
  })

  // If --safe mode is enabled, prevent root/sudo usage for security
  if (safeMode) {
    // Check if running as root/sudo on Unix-like systems
    if (
      process.platform !== 'win32' &&
      typeof process.getuid === 'function' &&
      process.getuid() === 0
    ) {
      console.error(
        `--safe mode cannot be used with root/sudo privileges for security reasons`,
      )
      process.exit(1)
    }
  }

  if (process.env.NODE_ENV === 'test') {
    return
  }

  cleanupOldMessageFilesInBackground()
  getContext() // Pre-fetch all context data at once

  // Check for last session's cost and duration
  const projectConfig = getCurrentProjectConfig()
  if (
    projectConfig.lastCost !== undefined &&
    projectConfig.lastDuration !== undefined
  ) {
    // Clear the values after logging
    // saveCurrentProjectConfig({
    //   ...projectConfig,
    //   lastCost: undefined,
    //   lastAPIDuration: undefined,
    //   lastDuration: undefined,
    //   lastSessionId: undefined,
    // })
  }

  // Skip interactive auto-updater permission prompts during startup
  // Users can still run the doctor command manually if desired.
}
