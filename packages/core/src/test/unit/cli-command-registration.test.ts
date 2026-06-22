import { describe, expect, test } from 'bun:test'
import { Command } from '@commander-js/extra-typings'
import { createCliProgram } from '#host-cli/entrypoints/cli/cliParser/program'

function buildProgram(): Command {
  return createCliProgram('', { exitOnCtrlC: false } as any)
}

describe('CLI command registration', () => {
  test('registers representative top-level commands after runCli split', () => {
    const program = buildProgram()
    const commandNames = program.commands.map(command => command.name())

    for (const name of [
      'config',
      'models',
      'agents',
      'plugin',
      'skills',
      'approved-tools',
      'mcp',
      'doctor',
      'update',
      'log',
      'resume',
      'error',
      'context',
    ]) {
      expect(commandNames).toContain(name)
    }
  })

  test('keeps representative main command flags registered', () => {
    const program = buildProgram()
    const flags = program.options.map(option => option.flags)

    for (const flag of [
      '--cwd <cwd>',
      '-p, --print',
      '--output-format <format>',
      '--input-format <format>',
      '--allowedTools, --allowed-tools <tools...>',
      '--mcp-config <configs...>',
      '-r, --resume [value]',
      '-c, --continue',
      '--session-id <uuid>',
    ]) {
      expect(flags).toContain(flag)
    }
  })

  test('help text for representative command groups remains wired', () => {
    const program = buildProgram()

    const expectations: Array<[string, string]> = [
      ['config', 'Manage configuration'],
      ['models', 'Import/export model profiles'],
      ['agents', 'Agent utilities'],
      ['plugin', 'Manage plugins'],
      ['skills', 'Manage skills'],
      ['approved-tools', 'Manage approved tools'],
      ['mcp', 'Configure and manage MCP servers'],
      ['context', 'Set static context'],
      ['resume', 'Resume a previous conversation'],
    ]

    for (const [name, expected] of expectations) {
      const command = program.commands.find(command => command.name() === name)
      expect(command?.helpInformation()).toContain(expected)
    }
  })
})
