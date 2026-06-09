import type { Command } from '@commander-js/extra-typings'
import type { CliCommandRegistrationContext } from '../commandContext'
import { registerAgentsCommands } from './agents'
import { registerApprovedToolsCommands } from './approvedTools'
import { registerConfigCommands } from './config'
import { registerContextCommands } from './context'
import { registerDoctorAndUpdateCommands } from './doctorUpdate'
import { registerMcpCommands } from './mcp'
import { registerModelsCommands } from './models'
import { registerPluginAndSkillsCommands } from './pluginSkills'
import { registerSessionLogAndErrorCommands } from './session'

export function registerCliCommands(
  program: Command,
  context: CliCommandRegistrationContext,
): void {
  registerConfigCommands(program)
  registerModelsCommands(program)
  registerAgentsCommands(program)
  registerPluginAndSkillsCommands(program)
  registerApprovedToolsCommands(program)
  registerMcpCommands(program)
  registerDoctorAndUpdateCommands(program)
  registerSessionLogAndErrorCommands(program, context)
  registerContextCommands(program)
}
