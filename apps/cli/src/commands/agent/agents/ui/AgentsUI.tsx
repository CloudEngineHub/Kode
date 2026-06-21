import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Text } from 'ink'
import chalk from 'chalk'
import {
  clearAgentCache,
  getActiveAgents,
  getAllAgents,
  type AgentConfig,
} from '#core/utils/agentLoader'
import { getAvailableTools, type Tool } from '../tooling'
import { deleteAgent } from '../storage'
import { AgentMenu } from './AgentMenu'
import { AgentsListView } from './AgentsListView'
import { CreateAgentWizard } from './CreateAgentWizard'
import { DeleteConfirm } from './DeleteConfirm'
import { EditAgent } from './EditAgent'
import { Instructions, Panel } from './components'
import type { AgentWithOverride, ModeState } from './types'
import { ViewAgent } from './ViewAgent'

function computeOverrides(args: {
  allAgents: AgentConfig[]
  activeAgents: AgentConfig[]
}): AgentWithOverride[] {
  const activeByType = new Map<string, AgentConfig>()
  for (const agent of args.activeAgents)
    activeByType.set(agent.agentType, agent)
  return args.allAgents.map(agent => {
    const active = activeByType.get(agent.agentType)
    const overriddenBy =
      active && active.source !== agent.source ? active.source : undefined
    return { ...agent, ...(overriddenBy ? { overriddenBy } : {}) }
  })
}

export function AgentsUI({ onExit }: { onExit: (message?: string) => void }) {
  const [mode, setMode] = useState<ModeState>({
    mode: 'list-agents',
    source: 'all',
  })
  const [loading, setLoading] = useState(true)
  const [allAgents, setAllAgents] = useState<AgentConfig[]>([])
  const [activeAgents, setActiveAgents] = useState<AgentConfig[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [changes, setChanges] = useState<string[]>([])

  const refresh = useCallback(async () => {
    clearAgentCache()
    const [all, active] = await Promise.all([getAllAgents(), getActiveAgents()])
    setAllAgents(all)
    setActiveAgents(active)
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [toolList] = await Promise.all([getAvailableTools(), refresh()])
        if (!mounted) return
        setTools(toolList)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [refresh])

  const agentsWithOverride = useMemo(
    () => computeOverrides({ allAgents, activeAgents }),
    [allAgents, activeAgents],
  )

  const listAgentsForSource = useMemo(() => {
    const bySource = {
      'built-in': agentsWithOverride.filter(a => a.source === 'built-in'),
      userSettings: agentsWithOverride.filter(a => a.source === 'userSettings'),
      projectSettings: agentsWithOverride.filter(
        a => a.source === 'projectSettings',
      ),
      policySettings: agentsWithOverride.filter(
        a => a.source === 'policySettings',
      ),
      flagSettings: agentsWithOverride.filter(a => a.source === 'flagSettings'),
      plugin: agentsWithOverride.filter(a => a.source === 'plugin'),
    }

    if (mode.mode !== 'list-agents') return []

    if (mode.source === 'all') {
      return [
        ...bySource['built-in'],
        ...bySource.userSettings,
        ...bySource.projectSettings,
        ...bySource.policySettings,
        ...bySource.flagSettings,
        ...bySource.plugin,
      ]
    }
    if (mode.source === 'built-in') return bySource['built-in']
    if (mode.source === 'userSettings') return bySource.userSettings
    if (mode.source === 'projectSettings') return bySource.projectSettings
    if (mode.source === 'policySettings') return bySource.policySettings
    if (mode.source === 'flagSettings') return bySource.flagSettings
    if (mode.source === 'plugin') return bySource.plugin
    return []
  }, [agentsWithOverride, mode])

  const dismiss = useCallback(() => {
    if (changes.length > 0) {
      onExit(`Agent changes:\\n${changes.join('\\n')}`)
      return
    }
    onExit('Agents dialog dismissed')
  }, [changes, onExit])

  if (loading) {
    return (
      <>
        <Panel title="Agents" subtitle="Loading...">
          <Text dimColor>Loading agents...</Text>
        </Panel>
        <Instructions />
      </>
    )
  }

  if (mode.mode === 'list-agents') {
    return (
      <AgentsListView
        source={mode.source}
        agents={listAgentsForSource}
        changes={changes}
        onCreateNew={() =>
          setMode({ mode: 'create-agent', previousMode: mode })
        }
        onSelect={agent =>
          setMode({ mode: 'agent-menu', agent, previousMode: mode })
        }
        onBack={dismiss}
      />
    )
  }

  if (mode.mode === 'create-agent') {
    return (
      <CreateAgentWizard
        tools={tools}
        existingAgents={allAgents}
        onCancel={() => setMode(mode.previousMode)}
        onComplete={async message => {
          setChanges(prev => [...prev, message])
          await refresh()
          setMode({ mode: 'list-agents', source: 'all' })
        }}
      />
    )
  }

  if (mode.mode === 'agent-menu') {
    return (
      <AgentMenu
        agent={mode.agent}
        onCancel={() => setMode(mode.previousMode)}
        onChoose={value => {
          if (value === 'back') setMode(mode.previousMode)
          else if (value === 'view')
            setMode({
              mode: 'view-agent',
              agent: mode.agent,
              previousMode: mode,
            })
          else if (value === 'edit')
            setMode({
              mode: 'edit-agent',
              agent: mode.agent,
              previousMode: mode,
            })
          else if (value === 'delete')
            setMode({
              mode: 'delete-confirm',
              agent: mode.agent,
              previousMode: mode,
            })
        }}
      />
    )
  }

  if (mode.mode === 'view-agent') {
    return (
      <ViewAgent
        agent={mode.agent}
        tools={tools}
        onBack={() => setMode(mode.previousMode)}
      />
    )
  }

  if (mode.mode === 'edit-agent') {
    return (
      <EditAgent
        agent={mode.agent}
        tools={tools}
        onBack={() => setMode(mode.previousMode)}
        onSaved={async message => {
          setChanges(prev => [...prev, message])
          await refresh()
          setMode(mode.previousMode)
        }}
      />
    )
  }

  if (mode.mode === 'delete-confirm') {
    return (
      <DeleteConfirm
        agent={mode.agent}
        onCancel={() => setMode(mode.previousMode)}
        onConfirm={async () => {
          await deleteAgent(mode.agent)
          setChanges(prev => [
            ...prev,
            `Deleted agent: ${chalk.bold(mode.agent.agentType)}`,
          ])
          await refresh()
          setMode({ mode: 'list-agents', source: 'all' })
        }}
      />
    )
  }

  return null
}
