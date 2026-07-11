import { describe, expect, it } from 'bun:test'
import { __buildHelpLinesForTests } from './HelpScreen'
import type { Command } from '#cli-commands'

describe('HelpScreen helpers', () => {
  it('surfaces both print and headless non-interactive usage', () => {
    const lines = __buildHelpLinesForTests([])
    const usage = lines.find(line => line.startsWith('- Non-interactive:'))

    expect(usage).toContain('-p "question"')
    expect(usage).toContain('--headless "question"')
  })

  it('shows command arguments and slash-prefixed aliases', () => {
    const command = {
      type: 'local',
      name: 'deploy',
      description: 'Deploy the current project',
      argumentHint: '<environment>',
      aliases: ['ship'],
      isEnabled: true,
      isHidden: false,
      userFacingName: () => 'deploy',
      call: async () => '',
    } satisfies Command

    const lines = __buildHelpLinesForTests([command])

    expect(lines).toContain(
      '- /deploy <environment> — Deploy the current project (aliases: /ship)',
    )
    expect(lines).toContain('- / + Tab: Accept command completion')
  })
})
