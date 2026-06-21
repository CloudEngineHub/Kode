import React from 'react'
import { Box } from 'ink'
import { Select } from '#ui-ink/components/CustomSelect/select'
import { Instructions, Panel } from './components'
import type { AgentWithOverride } from './types'
import { useKeypress } from '#ui-ink/hooks/useKeypress'

function isAgentMenuChoice(
  value: string,
): value is 'view' | 'edit' | 'delete' | 'back' {
  return (
    value === 'view' ||
    value === 'edit' ||
    value === 'delete' ||
    value === 'back'
  )
}

export function AgentMenu(props: {
  agent: AgentWithOverride
  onChoose: (value: 'view' | 'edit' | 'delete' | 'back') => void
  onCancel: () => void
}) {
  useKeypress((_input, key) => {
    if (key.escape) {
      props.onCancel()
      return true
    }
  })

  const isBuiltIn = props.agent.source === 'built-in'
  const options = [
    { label: 'View agent', value: 'view' },
    ...(isBuiltIn
      ? []
      : [
          { label: 'Edit agent', value: 'edit' },
          { label: 'Delete agent', value: 'delete' },
        ]),
    { label: 'Back', value: 'back' },
  ]

  return (
    <>
      <Panel title={props.agent.agentType}>
        <Box flexDirection="column" marginTop={1}>
          <Select
            options={options}
            onChange={value => {
              if (isAgentMenuChoice(value)) props.onChoose(value)
            }}
          />
        </Box>
      </Panel>
      <Instructions />
    </>
  )
}
