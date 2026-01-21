import { describe, expect, test } from 'bun:test'
import {
  generateAgentFileContent,
  validateAgentConfig,
  validateAgentType,
} from './generation'

describe('agents/generation', () => {
  test('generateAgentFileContent escapes and quotes description', () => {
    const description = `Line 1: "quoted" and backslash \\\nLine 2`
    const content = generateAgentFileContent(
      'demo-agent',
      description,
      '*',
      'System prompt body',
    )

    const escaped = description
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\\\n')

    expect(content).toContain('name: demo-agent')
    expect(content).toContain(`description: "${escaped}"`)
    expect(content).not.toContain('\ntools:')
  })

  test('generateAgentFileContent writes optional tools/model/color', () => {
    const content = generateAgentFileContent(
      'demo-agent',
      'Use this agent when...',
      ['Read', 'Bash'],
      'System prompt body',
      'sonnet',
      'magenta',
    )

    expect(content).toContain('\ntools: Read, Bash')
    expect(content).toContain('\nmodel: sonnet')
    expect(content).toContain('\ncolor: magenta')
  })

  test('validateAgentType matches expected regex + length', () => {
    expect(validateAgentType('a-b').isValid).toBe(true)
    expect(validateAgentType('a-').isValid).toBe(false)
    expect(validateAgentType('-a').isValid).toBe(false)
    expect(validateAgentType('ab').isValid).toBe(false)
  })

  test('validateAgentConfig matches expected warning/error thresholds', () => {
    const tooShortSystemPrompt = validateAgentConfig({
      agentType: 'a-b',
      whenToUse: 'Use this agent when you need help.',
      systemPrompt: 'too short',
      selectedTools: undefined,
    })
    expect(tooShortSystemPrompt.isValid).toBe(false)
    expect(tooShortSystemPrompt.errors).toContain(
      'System prompt is too short (minimum 20 characters)',
    )
    expect(tooShortSystemPrompt.warnings).toContain(
      'Agent has access to all tools',
    )

    const longDescription = validateAgentConfig({
      agentType: 'a-b',
      whenToUse: `Use this agent when...${'x'.repeat(6000)}`,
      systemPrompt: 'This system prompt is long enough to pass validation.',
      selectedTools: [],
    })
    expect(longDescription.isValid).toBe(true)
    expect(longDescription.warnings).toContain(
      'Description is very long (over 5000 characters)',
    )
    expect(longDescription.warnings).toContain(
      'No tools selected - agent will have very limited capabilities',
    )
  })
})
