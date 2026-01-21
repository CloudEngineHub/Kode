import React from 'react'
import { join } from 'path'
import { Box, Text } from 'ink'
import figures from 'figures'
import type { Tool } from '../tooling'
import { themeColor } from './colors'
import { Instructions, Panel } from './components'
import type { AgentWithOverride } from './types'
import { formatModelLong, getToolNameFromSpec } from './utils'
import { useKeypress } from '#ui-ink/hooks/useKeypress'

export function ViewAgent(props: {
  agent: AgentWithOverride
  tools: Tool[]
  onBack: () => void
}) {
  useKeypress((_input, key) => {
    if (key.escape || key.return) {
      props.onBack()
      return true
    }
  })

  const toolNames = new Set(props.tools.map(t => t.name))
  const parsedTools = (() => {
    const toolSpec = props.agent.tools
    if (toolSpec === '*')
      return { hasWildcard: true, valid: [], invalid: [] as string[] }
    if (!toolSpec || toolSpec.length === 0)
      return { hasWildcard: false, valid: [], invalid: [] as string[] }
    const names = toolSpec.map(getToolNameFromSpec).filter(Boolean)
    const valid: string[] = []
    const invalid: string[] = []
    for (const name of names) {
      if (
        name.includes('*') &&
        Array.from(toolNames).some(t => t.startsWith(name.replace(/\*+$/, '')))
      ) {
        valid.push(name)
        continue
      }
      if (toolNames.has(name)) valid.push(name)
      else invalid.push(name)
    }
    return { hasWildcard: false, valid, invalid }
  })()

  const sourceLine = (() => {
    if (props.agent.source === 'built-in') return 'Built-in'
    if (props.agent.source === 'plugin')
      return `Plugin: ${props.agent.baseDir ?? 'Unknown'}`
    const baseDir = props.agent.baseDir
    const file = `${props.agent.filename ?? props.agent.agentType}.md`
    if (props.agent.source === 'projectSettings')
      return join('.kode', 'agents', file)
    if (baseDir) return join(baseDir, file)
    return props.agent.source
  })()

  const toolsSummary = () => {
    if (parsedTools.hasWildcard) return 'All tools'
    if (
      !props.agent.tools ||
      props.agent.tools === '*' ||
      props.agent.tools.length === 0
    )
      return 'None'
    return (
      <>
        {parsedTools.valid.length > 0 ? parsedTools.valid.join(', ') : null}
        {parsedTools.invalid.length > 0 ? (
          <>
            <Text color={themeColor('warning')}>
              {' '}
              {figures.warning} Unrecognized: {parsedTools.invalid.join(', ')}
            </Text>
          </>
        ) : null}
      </>
    )
  }

  return (
    <>
      <Panel title={props.agent.agentType}>
        <Box flexDirection="column" gap={1}>
          <Text dimColor>{sourceLine}</Text>
          <Box flexDirection="column">
            <Text>
              <Text bold>Description</Text> (tells the agent when to use this
              agent):
            </Text>
            <Box marginLeft={2}>
              <Text>{props.agent.whenToUse}</Text>
            </Box>
          </Box>
          <Text>
            <Text bold>Tools</Text>: {toolsSummary()}
          </Text>
          <Text>
            <Text bold>Model</Text>: {formatModelLong(props.agent.model)}
          </Text>
          {props.agent.color ? (
            <Text>
              <Text bold>Color</Text>: {props.agent.color}
            </Text>
          ) : null}
          {props.agent.systemPrompt ? (
            <>
              <Text>
                <Text bold>System prompt</Text>:
              </Text>
              <Box marginLeft={2} marginRight={2}>
                <Text>{props.agent.systemPrompt}</Text>
              </Box>
            </>
          ) : null}
        </Box>
      </Panel>
      <Instructions instructions="Press Enter or Esc to go back" />
    </>
  )
}
