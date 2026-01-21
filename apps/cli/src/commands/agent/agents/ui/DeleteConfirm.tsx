import React from 'react'
import { Box, Text } from 'ink'
import { Select } from '#ui-ink/components/CustomSelect/select'
import { themeColor } from './colors'
import { Instructions, Panel } from './components'
import type { AgentWithOverride } from './types'
import { useKeypress } from '#ui-ink/hooks/useKeypress'

export function DeleteConfirm(props: {
  agent: AgentWithOverride
  onConfirm: () => void
  onCancel: () => void
}) {
  useKeypress((_input, key) => {
    if (key.escape) {
      props.onCancel()
      return true
    }
  })

  return (
    <>
      <Panel title="Delete agent" titleColor={themeColor('error')}>
        <Box flexDirection="column" gap={1}>
          <Text>
            Are you sure you want to delete the agent{' '}
            <Text bold>{props.agent.agentType}</Text>?
          </Text>
          <Box marginTop={1}>
            <Text dimColor>Source: {props.agent.source}</Text>
          </Box>
          <Box marginTop={1}>
            <Select
              options={[
                { label: 'Yes, delete', value: 'yes' },
                { label: 'No, cancel', value: 'no' },
              ]}
              onChange={value => {
                if (value === 'yes') props.onConfirm()
                else props.onCancel()
              }}
            />
          </Box>
        </Box>
      </Panel>
      <Instructions instructions="Press ↑↓ to navigate, Enter to select, Esc to cancel" />
    </>
  )
}
