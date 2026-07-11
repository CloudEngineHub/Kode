import { afterEach, describe, expect, test } from 'bun:test'
import React from 'react'
import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import { AgentMenu } from '#host-cli/commands/agent/agents/ui/AgentMenu'
import { AgentsListView } from '#host-cli/commands/agent/agents/ui/AgentsListView'
import { ColorPicker } from '#host-cli/commands/agent/agents/ui/ColorPicker'
import type { AgentWithOverride } from '#host-cli/commands/agent/agents/ui/types'
import { createInkHarnessManager, createInkTestHarness } from './inkTestHarness'

const harnessManager = createInkHarnessManager()

afterEach(async () => {
  await harnessManager.cleanup()
})

function makeAgent(
  agentType: string,
  overrides: Partial<AgentWithOverride> = {},
): AgentWithOverride {
  return {
    agentType,
    whenToUse: 'Use for tests',
    tools: '*',
    systemPrompt: 'Test agent',
    source: 'userSettings',
    location: 'user',
    model: 'sonnet',
    ...overrides,
  }
}

describe('TUI E2E regression (Ink render): Agents', () => {
  test('AgentsListView: Down moves focus through agents after create', async () => {
    const reviewer = makeAgent('reviewer')
    const planner = {
      ...makeAgent('planner'),
      source: 'projectSettings' as const,
      location: 'project' as const,
    }
    let created = 0
    let selected = ''
    const h = createInkTestHarness(
      <KeypressProvider>
        <AgentsListView
          source="all"
          agents={[reviewer, planner]}
          changes={[]}
          onCreateNew={() => {
            created += 1
          }}
          onSelect={value => {
            selected = value.agentType
          }}
          onBack={() => {}}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(50)
    h.stdin.write('\x1b[B')
    await h.wait(50)
    h.stdin.write('\x1b[B')
    await h.wait(50)
    h.stdin.write('\r')
    await h.wait(25)

    expect(selected).toBe('planner')
    expect(created).toBe(0)
  })

  test('AgentsListView: shows a configured agent color as a scan marker', async () => {
    const h = createInkTestHarness(
      <KeypressProvider>
        <AgentsListView
          source="all"
          agents={[makeAgent('purple-reviewer', { color: 'purple' })]}
          changes={[]}
          onCreateNew={() => {}}
          onSelect={() => {}}
          onBack={() => {}}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(50)

    expect(h.getOutput()).toContain('● purple-reviewer')
  })

  test('ColorPicker: Down advances to the visibly labeled color', async () => {
    let selected = ''
    const h = createInkTestHarness(
      <KeypressProvider>
        <ColorPicker
          agentName="reviewer"
          currentColor="automatic"
          onConfirm={color => {
            selected = color
          }}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(50)
    h.stdin.write('\x1b[B')
    await h.wait(35)

    expect(h.getOutput()).toContain('Red')
    expect(h.getOutput()).toContain('selected')

    h.stdin.write('\r')
    await h.wait(25)

    expect(selected).toBe('red')
  })

  test('AgentsListView: Down reaches every visible read-only source', async () => {
    const plugin = makeAgent('plugin-reviewer', {
      source: 'plugin',
      location: 'plugin',
    })
    const flag = makeAgent('flag-reviewer', {
      source: 'flagSettings',
      location: 'built-in',
    })
    const builtIn = makeAgent('builtin-reviewer', {
      source: 'built-in',
      location: 'built-in',
    })
    let selected = ''
    const h = createInkTestHarness(
      <KeypressProvider>
        <AgentsListView
          source="all"
          agents={[plugin, flag, builtIn]}
          changes={[]}
          onCreateNew={() => {}}
          onSelect={value => {
            selected = value.agentType
          }}
          onBack={() => {}}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(50)
    h.stdin.write('\x1b[B')
    await h.wait(35)
    h.stdin.write('\x1b[B')
    await h.wait(35)
    h.stdin.write('\x1b[B')
    await h.wait(35)
    h.stdin.write('\r')
    await h.wait(25)

    expect(selected).toBe('builtin-reviewer')
  })

  test('AgentMenu: read-only agents expose view-only actions', async () => {
    const h = createInkTestHarness(
      <KeypressProvider>
        <AgentMenu
          agent={makeAgent('plugin-reviewer', {
            source: 'plugin',
            location: 'plugin',
          })}
          onChoose={() => {}}
          onCancel={() => {}}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(50)
    const output = h.getOutput()

    expect(output).toContain('Read-only agent')
    expect(output).toContain('View agent')
    expect(output).toContain('Back')
    expect(output).not.toContain('Edit agent')
    expect(output).not.toContain('Delete agent')
  })
})
