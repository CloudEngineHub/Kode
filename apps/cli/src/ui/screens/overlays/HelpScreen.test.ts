import { describe, expect, it } from 'bun:test'
import { __buildHelpLinesForTests } from './HelpScreen'

describe('HelpScreen helpers', () => {
  it('surfaces both print and headless non-interactive usage', () => {
    const lines = __buildHelpLinesForTests([])
    const usage = lines.find(line => line.startsWith('- Non-interactive:'))

    expect(usage).toContain('-p "question"')
    expect(usage).toContain('--headless "question"')
  })
})
