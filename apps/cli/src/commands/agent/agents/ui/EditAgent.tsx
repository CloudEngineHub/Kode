import React, { useMemo, useState } from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'
import chalk from 'chalk'
import { Select } from '#ui-ink/components/CustomSelect/select'
import type { Tool } from '../tooling'
import { getPrimaryAgentFilePath, updateAgent } from '../storage'
import { themeColor } from './colors'
import { Instructions, Panel } from './components'
import { ColorPicker } from './ColorPicker'
import type { AgentWithOverride, AgentColor } from './types'
import { DEFAULT_AGENT_MODEL } from './types'
import {
  modelOptions,
  openInEditor,
  titleForSource,
  toSelectableToolNames,
} from './utils'
import { ToolPicker } from './wizard/ToolPicker'
import { useKeypress } from '#ui-ink/hooks/useKeypress'

export function EditAgent(props: {
  agent: AgentWithOverride
  tools: Tool[]
  onSaved: (message: string) => void
  onBack: () => void
}) {
  const [mode, setMode] = useState<
    'menu' | 'edit-tools' | 'edit-model' | 'edit-color'
  >('menu')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const menuItems = useMemo(
    () => [
      { label: 'Open in editor', action: 'open' as const },
      { label: 'Edit tools', action: 'edit-tools' as const },
      { label: 'Edit model', action: 'edit-model' as const },
      { label: 'Edit color', action: 'edit-color' as const },
    ],
    [],
  )

  const doOpen = async () => {
    try {
      const location =
        props.agent.source === 'projectSettings'
          ? 'project'
          : props.agent.source === 'userSettings'
            ? 'user'
            : null
      if (!location)
        throw new Error(`Cannot open ${props.agent.source} agent in editor`)
      const filePath = getPrimaryAgentFilePath(location, props.agent.agentType)
      await openInEditor(filePath)
      props.onSaved(
        `Opened ${props.agent.agentType} in editor. If you made edits, restart to load the latest version.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const doUpdate = async (patch: {
    tools?: string[] | '*'
    model?: string
    color?: string
  }) => {
    try {
      await updateAgent(
        props.agent,
        props.agent.whenToUse,
        patch.tools ?? props.agent.tools,
        props.agent.systemPrompt,
        patch.color ?? props.agent.color,
        patch.model ?? props.agent.model,
      )
      props.onSaved(`Updated agent: ${chalk.bold(props.agent.agentType)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useKeypress((_input, key) => {
    if (key.escape) {
      setError(null)
      if (mode === 'menu') props.onBack()
      else setMode('menu')
      return true
    }

    if (mode !== 'menu') return

    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1))
      return true
    }
    if (key.downArrow) {
      setSelectedIndex(i => Math.min(menuItems.length - 1, i + 1))
      return true
    }
    if (key.return) {
      const item = menuItems[selectedIndex]
      if (!item) return
      if (item.action === 'open') void doOpen()
      else setMode(item.action)
      return true
    }
  })

  if (mode === 'edit-tools') {
    return (
      <>
        <Panel title={`Edit agent: ${props.agent.agentType}`}>
          <ToolPicker
            tools={props.tools}
            initialTools={toSelectableToolNames(props.agent.tools)}
            onComplete={selected => {
              const tools = selected === undefined ? '*' : selected
              void doUpdate({ tools })
              setMode('menu')
            }}
            onCancel={() => setMode('menu')}
          />
          {error ? (
            <Box marginTop={1}>
              <Text color={themeColor('error')}>{error}</Text>
            </Box>
          ) : null}
        </Panel>
        <Instructions instructions="Press Enter to toggle selection · ↑↓ Navigate · Esc to go back" />
      </>
    )
  }

  if (mode === 'edit-model') {
    useKeypress((_input, key) => {
      if (key.escape) {
        setMode('menu')
        return true
      }
    })

    return (
      <>
        <Panel title={`Edit agent: ${props.agent.agentType}`}>
          <Box flexDirection="column" gap={1} marginTop={1}>
            <Text dimColor>
              Model determines the agent&apos;s reasoning capabilities and
              speed.
            </Text>
            <Select
              options={modelOptions()}
              defaultValue={props.agent.model ?? DEFAULT_AGENT_MODEL}
              onChange={value => {
                void doUpdate({ model: value })
                setMode('menu')
              }}
            />
          </Box>
          {error ? (
            <Box marginTop={1}>
              <Text color={themeColor('error')}>{error}</Text>
            </Box>
          ) : null}
        </Panel>
        <Instructions />
      </>
    )
  }

  if (mode === 'edit-color') {
    return (
      <>
        <Panel title={`Edit agent: ${props.agent.agentType}`}>
          <Box marginTop={1}>
            <ColorPicker
              agentName={props.agent.agentType}
              currentColor={(props.agent.color as AgentColor) ?? 'automatic'}
              onConfirm={color => {
                void doUpdate({
                  color: color === 'automatic' ? undefined : color,
                })
                setMode('menu')
              }}
            />
          </Box>
          {error ? (
            <Box marginTop={1}>
              <Text color={themeColor('error')}>{error}</Text>
            </Box>
          ) : null}
        </Panel>
        <Instructions />
      </>
    )
  }

  return (
    <>
      <Panel title={`Edit agent: ${props.agent.agentType}`}>
        <Box flexDirection="column">
          <Text dimColor>Source: {titleForSource(props.agent.source)}</Text>
          <Box marginTop={1} flexDirection="column">
            {menuItems.map((item, idx) => (
              <React.Fragment key={item.label}>
                <Text
                  color={
                    idx === selectedIndex ? themeColor('suggestion') : undefined
                  }
                >
                  {idx === selectedIndex ? `${figures.pointer} ` : '  '}
                  {item.label}
                </Text>
              </React.Fragment>
            ))}
          </Box>
          {error ? (
            <Box marginTop={1}>
              <Text color={themeColor('error')}>{error}</Text>
            </Box>
          ) : null}
        </Box>
      </Panel>
      <Instructions />
    </>
  )
}
