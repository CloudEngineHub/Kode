import type { Command } from '#cli-commands'
import type { UnifiedSuggestion } from './types'

function buildCommandDescription(cmd: Command): string {
  const parts: string[] = []
  if (cmd.description) parts.push(cmd.description)
  if (cmd.argumentHint) parts.push(`Args: ${cmd.argumentHint}`)
  return parts.join('\n')
}

export function generateSlashCommandSuggestions(args: {
  commands: Command[]
  prefix: string
}): UnifiedSuggestion[] {
  const { commands, prefix } = args
  const filteredCommands = commands.filter(cmd => !cmd.isHidden)

  if (!prefix) {
    return filteredCommands.map(cmd => ({
      value: cmd.userFacingName(),
      displayValue: `/${cmd.userFacingName()}`,
      description: buildCommandDescription(cmd),
      type: 'command' as const,
      score: 100,
    }))
  }

  return filteredCommands
    .filter(cmd => {
      const names = [cmd.userFacingName(), ...(cmd.aliases || [])]
      return names.some(name =>
        name.toLowerCase().startsWith(prefix.toLowerCase()),
      )
    })
    .map(cmd => ({
      value: cmd.userFacingName(),
      displayValue: `/${cmd.userFacingName()}`,
      description: buildCommandDescription(cmd),
      type: 'command' as const,
      score:
        100 -
        prefix.length +
        (cmd.userFacingName().startsWith(prefix) ? 10 : 0),
    }))
}
