import React, { useEffect, useState } from 'react'
import { Text } from 'ink'
import { getAgentByType } from '../../utils/agentLoader'
import { getTheme } from '../../utils/theme'

interface Props {
  agentType: string
  children: React.ReactNode
  bold?: boolean
}

export function TaskToolMessage({ agentType, children, bold = true }: Props) {
  const [agentConfig, setAgentConfig] = useState<any>(null)
  const theme = getTheme()

  useEffect(() => {
    // Dynamically load agent configuration
    getAgentByType(agentType).then(config => {
      setAgentConfig(config)
    })
  }, [agentType])

  // Get color from agent configuration
  const color = agentConfig?.color || theme.text

  return (
    <Text color={color} bold={bold}>
      {children}
    </Text>
  )
}