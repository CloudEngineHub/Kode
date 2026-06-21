import type { Command } from '@commander-js/extra-typings'

import { getCurrentProjectConfig, saveCurrentProjectConfig } from '#config'
import { PRODUCT_NAME } from '#core/constants/product'

export function registerMcpResetCommands(args: { mcp: Command }): void {
  const resetMcpChoices = () => {
    const config = getCurrentProjectConfig()
    saveCurrentProjectConfig({
      ...config,
      approvedMcprcServers: [],
      rejectedMcprcServers: [],
    })
    console.log(
      'All project-file MCP server approvals/rejections (.mcp.json/.mcprc) have been reset.',
    )
    console.log(
      `You will be prompted for approval next time you start ${PRODUCT_NAME}.`,
    )
    process.exit(0)
  }

  args.mcp
    .command('reset-project-choices')
    .description(
      'Reset approvals for project-file MCP servers (.mcp.json/.mcprc) in this project',
    )
    .action(() => {
      resetMcpChoices()
    })

  args.mcp
    .command('reset-mcprc-choices')
    .description(
      'Reset approvals for project-file MCP servers (.mcp.json/.mcprc) in this project',
    )
    .action(() => {
      resetMcpChoices()
    })
}
