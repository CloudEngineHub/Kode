import bug from './builtin/bug'
import clear from './builtin/clear'
import compact from './builtin/compact'
import config from './builtin/config'
import cost from './builtin/cost'
import ctx_viz from './debug/ctx_viz'
import doctor from './builtin/doctor'
import help from './builtin/help'
import init from './builtin/init'
import listen from './debug/listen'
import messages_debug from './debug/messages_debug'
import login from './builtin/login'
import logout from './builtin/logout'
import mcp from './mcp/mcp'
import plugin from './plugin/plugin'
import outputStyle from './builtin/output-style'
import * as model from './builtin/model'
import modelstatus from './builtin/modelstatus'
import onboarding from './builtin/onboarding'
import open from './builtin/open'
import consoleCommand from './builtin/console'
import notifications from './builtin/notifications'
import pr_comments from './builtin/pr_comments'
import refreshCommands from './builtin/refreshCommands'
import releaseNotes from './builtin/release-notes'
import review from './builtin/review'
import rename from './builtin/rename'
import statusline from './builtin/statusline'
import tag from './builtin/tag'
import todos from './builtin/todos'
import resume from './debug/resume'
import agents from './agent/agents'
import { getMCPCommands } from '#core/mcp/client'
import { loadCustomCommands } from '#cli-services/customCommands'
import { memoize } from 'lodash-es'
import { isAnthropicAuthEnabled } from '#core/utils/auth'
import type { Command } from './types'

export type { Command } from './types'

const INTERNAL_ONLY_COMMANDS = [ctx_viz, resume, listen, messages_debug]

// Declared as a function so that we don't run this until getCommands is called,
// since underlying functions read from config, which can't be read at module initialization time
const COMMANDS = memoize((): Command[] => [
  agents,
  clear,
  compact,
  config,
  cost,
  doctor,
  help,
  init,
  outputStyle,
  statusline,
  mcp,
  plugin,
  model,
  modelstatus,
  onboarding,
  open,
  consoleCommand,
  notifications,
  pr_comments,
  rename,
  tag,
  refreshCommands,
  releaseNotes,
  bug,
  review,
  todos,
  ...(isAnthropicAuthEnabled() ? [logout, login()] : []),
  ...INTERNAL_ONLY_COMMANDS,
])

export const getCommands = memoize(async (): Promise<Command[]> => {
  const [mcpCommands, customCommands] = await Promise.all([
    getMCPCommands(),
    loadCustomCommands(),
  ])

  return [...mcpCommands, ...customCommands, ...COMMANDS()].filter(
    _ => _.isEnabled,
  )
})

export function hasCommand(commandName: string, commands: Command[]): boolean {
  return commands.some(
    _ => _.userFacingName() === commandName || _.aliases?.includes(commandName),
  )
}

export function getCommand(commandName: string, commands: Command[]): Command {
  const command = commands.find(
    _ => _.userFacingName() === commandName || _.aliases?.includes(commandName),
  ) as Command | undefined
  if (!command) {
    throw ReferenceError(
      `Command ${commandName} not found. Available commands: ${commands
        .map(_ => {
          const name = _.userFacingName()
          return _.aliases ? `${name} (aliases: ${_.aliases.join(', ')})` : name
        })
        .join(', ')}`,
    )
  }

  return command
}
