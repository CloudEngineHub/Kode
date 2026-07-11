import React, { useEffect, useMemo, useState } from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'
import { getReadableTextColor, getTheme } from '#core/utils/theme'
import { resolveAgentColor } from '#ui-ink/utils/agentColor'
import { Instructions, Panel } from './components'
import type { AgentSourceFilter, AgentWithOverride } from './types'
import { formatModelShort, titleForSource } from './utils'
import { useKeypress } from '#ui-ink/hooks/useKeypress'

function agentRowKey(agent: AgentWithOverride): string {
  const baseDir = agent.baseDir ?? ''
  const filename = agent.filename ?? ''
  const location = agent.location ?? ''
  return `${agent.agentType}-${agent.source}-${location}-${baseDir}-${filename}`
}

function isReadOnlyAgent(agent: AgentWithOverride): boolean {
  return agent.location === 'built-in' || agent.location === 'plugin'
}

function getNavigableAgents(args: {
  agents: AgentWithOverride[]
  source: AgentSourceFilter
}): AgentWithOverride[] {
  if (args.source !== 'all') return args.agents

  return [
    ...args.agents.filter(agent => agent.source === 'userSettings'),
    ...args.agents.filter(agent => agent.source === 'projectSettings'),
    ...args.agents.filter(agent => agent.source === 'policySettings'),
    ...args.agents.filter(agent => agent.source === 'plugin'),
    ...args.agents.filter(agent => agent.source === 'flagSettings'),
    ...args.agents.filter(agent => agent.source === 'built-in'),
  ]
}

export function AgentsListView(props: {
  source: AgentSourceFilter
  agents: AgentWithOverride[]
  changes: string[]
  onCreateNew?: () => void
  onSelect: (agent: AgentWithOverride) => void
  onBack: () => void
}) {
  const theme = getTheme()

  const selectableAgents = useMemo(
    () => getNavigableAgents({ agents: props.agents, source: props.source }),
    [props.agents, props.source],
  )

  const [selectedAgent, setSelectedAgent] = useState<AgentWithOverride | null>(
    null,
  )
  const [onCreateOption, setOnCreateOption] = useState(true)

  useEffect(() => {
    if (props.onCreateNew) {
      setOnCreateOption(true)
      setSelectedAgent(null)
      return
    }
    setOnCreateOption(false)
    setSelectedAgent(selectableAgents[0] ?? null)
  }, [props.onCreateNew, selectableAgents])

  useKeypress((_input, key) => {
    if (key.escape) {
      props.onBack()
      return true
    }

    if (key.return) {
      if (onCreateOption && props.onCreateNew) {
        props.onCreateNew()
        return true
      }
      if (selectedAgent) props.onSelect(selectedAgent)
      return true
    }

    if (!key.upArrow && !key.downArrow) return

    const hasCreate = Boolean(props.onCreateNew)
    const navigableCount = selectableAgents.length + (hasCreate ? 1 : 0)
    if (navigableCount === 0) return

    const currentIndex = (() => {
      if (hasCreate && onCreateOption) return 0
      if (!selectedAgent) return hasCreate ? 0 : 0
      const selectedKey = agentRowKey(selectedAgent)
      const idx = selectableAgents.findIndex(
        a => agentRowKey(a) === selectedKey,
      )
      if (idx < 0) return hasCreate ? 0 : 0
      return hasCreate ? idx + 1 : idx
    })()

    const nextIndex = key.upArrow
      ? currentIndex === 0
        ? navigableCount - 1
        : currentIndex - 1
      : currentIndex === navigableCount - 1
        ? 0
        : currentIndex + 1

    if (hasCreate && nextIndex === 0) {
      setOnCreateOption(true)
      setSelectedAgent(null)
      return true
    }

    const agentIndex = hasCreate ? nextIndex - 1 : nextIndex
    const nextAgent = selectableAgents[agentIndex]
    if (nextAgent) {
      setOnCreateOption(false)
      setSelectedAgent(nextAgent)
      return true
    }
  })

  const renderCreateNew = () => {
    const isSelected = onCreateOption
    const selectedTextColor = getReadableTextColor(theme.kode, theme.text)
    const rowTextColor = isSelected ? selectedTextColor : theme.secondaryText

    return (
      <Box width="100%" backgroundColor={isSelected ? theme.kode : undefined}>
        <Text color={rowTextColor} bold={isSelected}>
          {onCreateOption ? `${figures.pointer} ` : '  '}
        </Text>
        <Text color={rowTextColor} bold={isSelected}>
          Create new agent
        </Text>
      </Box>
    )
  }

  const renderAgentRow = (agent: AgentWithOverride) => {
    const isReadOnly = isReadOnlyAgent(agent)
    const isSelected = Boolean(
      !onCreateOption &&
      selectedAgent &&
      agentRowKey(selectedAgent) === agentRowKey(agent),
    )

    const dimmed = Boolean(agent.overriddenBy)
    const selectedTextColor = getReadableTextColor(theme.kode, theme.text)
    const rowTextColor = isSelected ? selectedTextColor : theme.secondaryText
    const accentColor = resolveAgentColor(agent.color)
    const pointer = isSelected ? `${figures.pointer} ` : '  '

    return (
      <Box
        key={agentRowKey(agent)}
        width="100%"
        flexDirection="row"
        backgroundColor={isSelected ? theme.kode : undefined}
      >
        <Text color={rowTextColor} bold={isSelected}>
          {pointer}
        </Text>
        {accentColor ? (
          <Text
            backgroundColor={accentColor}
            color={getReadableTextColor(accentColor, theme.text)}
            bold
          >
            {' ● '}
          </Text>
        ) : (
          <Text color={rowTextColor}>{'   '}</Text>
        )}
        <Text
          dimColor={dimmed && !isSelected}
          color={rowTextColor}
          bold={isSelected}
        >
          {agent.agentType}
        </Text>
        <Text color={rowTextColor}>
          {' - '}
          {formatModelShort(agent.model)}
        </Text>
        {isReadOnly ? <Text color={rowTextColor}>{' [read-only]'}</Text> : null}
        {agent.overriddenBy ? (
          <Text color={isSelected ? selectedTextColor : theme.warning}>
            {' '}
            {figures.warning} overridden by {agent.overriddenBy}
          </Text>
        ) : null}
      </Box>
    )
  }

  const group = (label: string, agents: AgentWithOverride[]) => {
    if (agents.length === 0) return null
    const baseDir = agents[0]?.baseDir
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box paddingLeft={2}>
          <Text bold dimColor>
            {label}
          </Text>
          {baseDir ? <Text dimColor> ({baseDir})</Text> : null}
        </Box>
        {agents.map(renderAgentRow)}
      </Box>
    )
  }

  const builtInSection = (label = 'Built-in (always available):') => {
    const builtIn = props.agents.filter(a => a.source === 'built-in')
    if (builtIn.length === 0) return null
    return (
      <Box flexDirection="column" marginBottom={1} paddingLeft={2}>
        <Text bold dimColor>
          {label}
        </Text>
        {builtIn.map(renderAgentRow)}
      </Box>
    )
  }

  const notOverriddenCount = props.agents.filter(a => !a.overriddenBy).length
  const title = titleForSource(props.source)

  if (
    props.agents.length === 0 ||
    (props.source !== 'built-in' &&
      !props.agents.some(a => a.source !== 'built-in'))
  ) {
    return (
      <>
        <Panel title={title} subtitle="No agents found">
          {props.onCreateNew ? (
            <Box marginY={1}>{renderCreateNew()}</Box>
          ) : null}
          <Text dimColor>
            No agents found. Press Enter on Create new agent to start.
          </Text>
          <Text dimColor>
            Choose Quick draft for the shortest path, or Customize draft when
            you need tools, model, or color control.
          </Text>
          <Text dimColor>
            Useful starters: code-reviewer, test-writer, security-reviewer,
            tech-lead, ux-reviewer.
          </Text>
          {props.source !== 'built-in' &&
          props.agents.some(a => a.source === 'built-in') ? (
            <>
              <Box marginTop={1}>
                <Text dimColor>{'-'.repeat(40)}</Text>
              </Box>
              {builtInSection()}
            </>
          ) : null}
        </Panel>
        <Instructions />
      </>
    )
  }

  return (
    <>
      <Panel title={title} subtitle={`${notOverriddenCount} agents`}>
        {props.changes.length > 0 ? (
          <Box marginTop={1}>
            <Text dimColor>{props.changes[props.changes.length - 1]}</Text>
          </Box>
        ) : null}

        <Box flexDirection="column" marginTop={1}>
          {props.onCreateNew ? (
            <Box marginBottom={1}>{renderCreateNew()}</Box>
          ) : null}

          {props.source === 'all' ? (
            <>
              {group(
                'User agents',
                props.agents.filter(a => a.source === 'userSettings'),
              )}
              {group(
                'Project agents',
                props.agents.filter(a => a.source === 'projectSettings'),
              )}
              {group(
                'Managed agents',
                props.agents.filter(a => a.source === 'policySettings'),
              )}
              {group(
                'Plugin agents',
                props.agents.filter(a => a.source === 'plugin'),
              )}
              {group(
                'CLI arg agents',
                props.agents.filter(a => a.source === 'flagSettings'),
              )}
              {builtInSection('Built-in agents (always available)')}
            </>
          ) : props.source === 'built-in' ? (
            <>
              <Text dimColor italic>
                Built-in agents are provided by default and cannot be modified.
              </Text>
              <Box marginTop={1} flexDirection="column">
                {props.agents.map(renderAgentRow)}
              </Box>
            </>
          ) : (
            <Box flexDirection="column">
              {props.agents
                .filter(a => a.source !== 'built-in')
                .map(renderAgentRow)}
            </Box>
          )}
        </Box>
      </Panel>
      <Instructions />
    </>
  )
}
