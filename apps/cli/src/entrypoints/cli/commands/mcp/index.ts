import type { Command } from '@commander-js/extra-typings'

import { registerMcpServeCommand } from './serve'
import { registerMcpServerAddCommands } from './servers/add'
import { registerMcpServerAddJsonCommand } from './servers/addJson'
import { registerMcpServerGetCommand } from './servers/get'
import { registerMcpServerListCommand } from './servers/list'
import { registerMcpServerRemoveCommand } from './servers/remove'
import { registerMcpImportClaudeDesktopCommand } from './importClaudeDesktop'
import { registerMcpResetCommands } from './reset'

export function registerMcpCommands(program: Command): void {
  const mcp = program
    .command('mcp')
    .description('Configure and manage MCP servers')

  registerMcpServeCommand({ mcp, program })
  registerMcpServerAddCommands({ mcp, program })
  registerMcpServerRemoveCommand({ mcp })
  registerMcpServerListCommand({ mcp })
  registerMcpServerAddJsonCommand({ mcp })
  registerMcpServerGetCommand({ mcp })
  registerMcpImportClaudeDesktopCommand({ mcp })
  registerMcpResetCommands({ mcp })
}
