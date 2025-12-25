import { Command } from '@commands'
import { reloadCustomCommands } from '@services/customCommands'
import { getCommands } from '@commands'
import { debug as debugLogger } from '@utils/debugLogger'
import { logError } from '@utils/log'

/**
 * Refresh Commands - Reload custom commands from filesystem
 *
 * This command provides a runtime mechanism to refresh the custom commands
 * cache without restarting the application. It's particularly useful during
 * development or when users are actively creating/modifying custom commands.
 *
 * The command follows the standard local command pattern used throughout
 * the project and provides detailed feedback about the refresh operation.
 */
const refreshCommands = {
  type: 'local',
  name: 'refresh-commands',
  description: 'Reload custom commands from filesystem',
  isEnabled: true,
  isHidden: false,
  async call(_, context) {
    try {
      // Clear custom commands cache to force filesystem rescan
      reloadCustomCommands()

      // Clear the main commands cache to ensure full reload
      // This ensures that changes to custom commands are reflected in the main command list
      getCommands.cache.clear?.()

      // Reload commands to get updated count and validate the refresh
      const commands = await getCommands()
      const customCommands = commands.filter(
        cmd =>
          (cmd as any).scope === 'project' || (cmd as any).scope === 'user',
      )

      // Provide detailed feedback about the refresh operation
      return `✅ Commands refreshed successfully!

Custom commands reloaded: ${customCommands.length}
- Project commands: ${customCommands.filter(cmd => (cmd as any).scope === 'project').length}
- User commands: ${customCommands.filter(cmd => (cmd as any).scope === 'user').length}

Use /help to see updated command list.`
    } catch (error) {
      logError(error)
      debugLogger.warn('REFRESH_COMMANDS_FAILED', {
        error: error instanceof Error ? error.message : String(error),
      })
      return '❌ Failed to refresh commands. Check debug logs for details.'
    }
  },
  userFacingName() {
    return 'refresh-commands'
  },
} satisfies Command

export default refreshCommands
