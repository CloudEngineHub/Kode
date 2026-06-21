import React, { useMemo, useState } from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'
import type { Tool } from '../../tooling'
import { themeColor } from '../colors'
import { parseMcpToolName } from '../utils'
import { useKeypress } from '#ui-ink/hooks/useKeypress'

export function ToolPicker(props: {
  tools: Tool[]
  initialTools: string[] | undefined
  onComplete: (tools: string[] | undefined) => void
  onCancel: () => void
}) {
  const normalizedTools = useMemo(() => {
    const unique = new Map<string, Tool>()
    for (const tool of props.tools) {
      if (!tool?.name) continue
      unique.set(tool.name, tool)
    }
    return Array.from(unique.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }, [props.tools])

  const allToolNames = useMemo(
    () => normalizedTools.map(t => t.name),
    [normalizedTools],
  )

  const initialSelectedNames = useMemo(() => {
    if (!props.initialTools) return allToolNames
    if (props.initialTools.includes('*')) return allToolNames
    const available = new Set(allToolNames)
    return props.initialTools.filter(t => available.has(t))
  }, [props.initialTools, allToolNames])

  const [selected, setSelected] = useState<string[]>(initialSelectedNames)
  const [cursorIndex, setCursorIndex] = useState(0)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const isAllSelected =
    selected.length === allToolNames.length && allToolNames.length > 0

  const toggleOne = (name: string) => {
    setSelected(prev =>
      prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name],
    )
  }

  const toggleMany = (names: string[], enable: boolean) => {
    setSelected(prev => {
      if (enable) {
        const missing = names.filter(n => !prev.includes(n))
        return [...prev, ...missing]
      }
      return prev.filter(n => !names.includes(n))
    })
  }

  const complete = () => {
    const next =
      selected.length === allToolNames.length &&
      allToolNames.every(n => selected.includes(n))
        ? undefined
        : selected
    props.onComplete(next)
  }

  const categorized = useMemo(() => {
    const readOnly = new Set(['Read', 'LS', 'Glob', 'Grep'])
    const edit = new Set(['Edit', 'Write', 'NotebookEdit'])
    const execution = new Set(['Bash', 'TaskOutput', 'TaskStop'])

    const buckets: Record<
      'readOnly' | 'edit' | 'execution' | 'mcp' | 'other',
      string[]
    > = { readOnly: [], edit: [], execution: [], mcp: [], other: [] }

    for (const tool of normalizedTools) {
      const name = tool.name
      if (name.startsWith('mcp__')) buckets.mcp.push(name)
      else if (readOnly.has(name)) buckets.readOnly.push(name)
      else if (edit.has(name)) buckets.edit.push(name)
      else if (execution.has(name)) buckets.execution.push(name)
      else buckets.other.push(name)
    }

    return buckets
  }, [normalizedTools])

  const mcpServers = useMemo(() => {
    const byServer = new Map<string, string[]>()
    for (const name of categorized.mcp) {
      const parsed = parseMcpToolName(name)
      if (!parsed) continue
      const list = byServer.get(parsed.serverName) ?? []
      list.push(name)
      byServer.set(parsed.serverName, list)
    }
    return Array.from(byServer.entries())
      .map(([serverName, toolNames]) => ({ serverName, toolNames }))
      .sort((a, b) => a.serverName.localeCompare(b.serverName))
  }, [categorized.mcp])

  type Item = {
    id: string
    label: string
    isHeader?: boolean
    isToggle?: boolean
    action: () => void
  }

  const items: Item[] = useMemo(() => {
    const out: Item[] = []

    out.push({ id: 'continue', label: '[ Continue ]', action: complete })
    out.push({
      id: 'bucket-all',
      label: `${isAllSelected ? figures.checkboxOn : figures.checkboxOff} All tools`,
      action: () => toggleMany(allToolNames, !isAllSelected),
    })

    const bucketDefs: Array<{
      id: string
      label: string
      names: string[]
    }> = [
      {
        id: 'bucket-readonly',
        label: 'Read-only tools',
        names: categorized.readOnly,
      },
      { id: 'bucket-edit', label: 'Edit tools', names: categorized.edit },
      {
        id: 'bucket-execution',
        label: 'Execution tools',
        names: categorized.execution,
      },
      { id: 'bucket-mcp', label: 'MCP tools', names: categorized.mcp },
      { id: 'bucket-other', label: 'Other tools', names: categorized.other },
    ]

    for (const bucket of bucketDefs) {
      if (bucket.names.length === 0) continue
      const allInBucket = bucket.names.every(n => selectedSet.has(n))
      out.push({
        id: bucket.id,
        label: `${allInBucket ? figures.checkboxOn : figures.checkboxOff} ${bucket.label}`,
        action: () => toggleMany(bucket.names, !allInBucket),
      })
    }

    out.push({
      id: 'toggle-advanced',
      label: showAdvanced ? 'Hide advanced options' : 'Show advanced options',
      isToggle: true,
      action: () => setShowAdvanced(prev => !prev),
    })

    if (!showAdvanced) return out

    if (mcpServers.length > 0) {
      out.push({
        id: 'mcp-servers-header',
        label: 'MCP Servers:',
        isHeader: true,
        action: () => {},
      })
      for (const server of mcpServers) {
        const allServer = server.toolNames.every(n => selectedSet.has(n))
        out.push({
          id: `mcp-server-${server.serverName}`,
          label: `${allServer ? figures.checkboxOn : figures.checkboxOff} ${server.serverName} (${server.toolNames.length} tool${server.toolNames.length === 1 ? '' : 's'})`,
          action: () => toggleMany(server.toolNames, !allServer),
        })
      }
    }

    out.push({
      id: 'tools-header',
      label: 'Individual Tools:',
      isHeader: true,
      action: () => {},
    })
    for (const name of allToolNames) {
      let labelName = name
      const parsed = parseMcpToolName(name)
      if (parsed) labelName = `${parsed.toolName} (${parsed.serverName})`
      out.push({
        id: `tool-${name}`,
        label: `${selectedSet.has(name) ? figures.checkboxOn : figures.checkboxOff} ${labelName}`,
        action: () => toggleOne(name),
      })
    }

    return out
  }, [
    allToolNames,
    categorized,
    complete,
    isAllSelected,
    mcpServers,
    selectedSet,
    showAdvanced,
  ])

  useKeypress((_input, key) => {
    if (key.escape) {
      props.onCancel()
      return true
    }

    if (key.return) {
      const item = items[cursorIndex]
      if (item && !item.isHeader) item.action()
      return true
    }

    if (key.upArrow) {
      let next = cursorIndex - 1
      while (next > 0 && items[next]?.isHeader) next--
      setCursorIndex(Math.max(0, next))
      return true
    }

    if (key.downArrow) {
      let next = cursorIndex + 1
      while (next < items.length - 1 && items[next]?.isHeader) next++
      setCursorIndex(Math.min(items.length - 1, next))
      return true
    }
  })

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text
        color={cursorIndex === 0 ? themeColor('suggestion') : undefined}
        bold={cursorIndex === 0}
      >
        {cursorIndex === 0 ? `${figures.pointer} ` : '  '}[ Continue ]
      </Text>
      <Text dimColor>{'-'.repeat(40)}</Text>
      {items.slice(1).map((item, idx) => {
        const index = idx + 1
        const focused = index === cursorIndex
        const prefix = item.isHeader
          ? ''
          : focused
            ? `${figures.pointer} `
            : '  '
        return (
          <React.Fragment key={item.id}>
            {item.isToggle ? <Text dimColor>{'-'.repeat(40)}</Text> : null}
            <Text
              dimColor={item.isHeader}
              color={
                !item.isHeader && focused ? themeColor('suggestion') : undefined
              }
              bold={item.isToggle && focused}
            >
              {item.isToggle
                ? `${prefix}[ ${item.label} ]`
                : `${prefix}${item.label}`}
            </Text>
          </React.Fragment>
        )
      })}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          {isAllSelected
            ? 'All tools selected'
            : `${selectedSet.size} of ${allToolNames.length} tools selected`}
        </Text>
      </Box>
    </Box>
  )
}
