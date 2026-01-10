import type { Command } from '@commander-js/extra-typings'

import { getCwd } from '#core/utils/state'
import {
  handleListApprovedTools,
  handleRemoveApprovedTool,
} from '#cli-commands/builtin/approvedTools'

export function registerApprovedToolsCommands(program: Command): void {
  const approvedToolsCmd = program
    .command('approved-tools')
    .description('Manage approved tools')

  approvedToolsCmd
    .command('list')
    .description('List all approved tools')
    .action(() => {
      const result = handleListApprovedTools(getCwd())
      console.log(result)
      process.exit(0)
    })

  approvedToolsCmd
    .command('remove <tool>')
    .description('Remove a tool from the list of approved tools')
    .action((tool: string) => {
      const result = handleRemoveApprovedTool(tool)
      console.log(result.message)
      process.exit(result.success ? 0 : 1)
    })
}
