import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'
import type { Tool } from '../../tooling'
import { themeColor } from '../colors'
import { parseMcpToolName } from '../utils'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { getWindowedList } from '#ui-ink/primitives/list/windowedList'

const MIN_VISIBLE_TOOL_ITEMS = 5
const MAX_VISIBLE_TOOL_ITEMS = 14
const TOOL_PICKER_RESERVED_ROWS = 10

type ToolPickerItem = {
  id: string
  label: string
  isHeader?: boolean
  isToggle?: boolean
  action: () => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getToolPickerMaxVisibleItems(rows: number): number {
  return clamp(
    rows - TOOL_PICKER_RESERVED_ROWS,
    MIN_VISIBLE_TOOL_ITEMS,
    MAX_VISIBLE_TOOL_ITEMS,
  )
}

function getFocusableToolPickerIndex(
  items: ReadonlyArray<{ isHeader?: boolean }>,
  targetIndex: number,
  direction: -1 | 1,
): number {
  if (items.length === 0) return 0

  const clampedTarget = clamp(targetIndex, 0, items.length - 1)
  if (!items[clampedTarget]?.isHeader) return clampedTarget

  for (
    let index = clampedTarget + direction;
    index >= 0 && index < items.length;
    index += direction
  ) {
    if (!items[index]?.isHeader) return index
  }

  for (
    let index = clampedTarget - direction;
    index >= 0 && index < items.length;
    index -= direction
  ) {
    if (!items[index]?.isHeader) return index
  }

  return 0
}

export const __getToolPickerMaxVisibleItemsForTests =
  getToolPickerMaxVisibleItems
export const __getFocusableToolPickerIndexForTests = getFocusableToolPickerIndex

export function ToolPicker(props: {
  tools: Tool[]
  initialTools: string[] | undefined
  onComplete: (tools: string[] | undefined) => void
  onCancel: () => void
}) {
  const { tools, initialTools, onComplete, onCancel } = props
  const terminalSize = useTerminalSize()
  const normalizedTools = useMemo(() => {
    const unique = new Map<string, Tool>()
    for (const tool of tools) {
      if (!tool?.name) continue
      unique.set(tool.name, tool)
    }
    return Array.from(unique.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }, [tools])

  const allToolNames = useMemo(
    () => normalizedTools.map(t => t.name),
    [normalizedTools],
  )

  const initialSelectedNames = useMemo(() => {
    if (!initialTools) return allToolNames
    if (initialTools.includes('*')) return allToolNames
    const available = new Set(allToolNames)
    return initialTools.filter(t => available.has(t))
  }, [initialTools, allToolNames])

  const [selected, setSelected] = useState<string[]>(initialSelectedNames)
  const [cursorIndex, setCursorIndex] = useState(0)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const isAllSelected =
    selected.length === allToolNames.length && allToolNames.length > 0

  const toggleOne = useCallback((name: string) => {
    setSelected(prev =>
      prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name],
    )
  }, [])

  const toggleMany = useCallback((names: string[], enable: boolean) => {
    setSelected(prev => {
      if (enable) {
        const missing = names.filter(n => !prev.includes(n))
        return [...prev, ...missing]
      }
      return prev.filter(n => !names.includes(n))
    })
  }, [])

  const complete = useCallback(() => {
    const next =
      selected.length === allToolNames.length &&
      allToolNames.every(n => selected.includes(n))
        ? undefined
        : selected
    onComplete(next)
  }, [allToolNames, onComplete, selected])

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

  const items: ToolPickerItem[] = useMemo(() => {
    const out: ToolPickerItem[] = []

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
    toggleMany,
    toggleOne,
  ])

  useEffect(() => {
    setCursorIndex(prev =>
      getFocusableToolPickerIndex(items, Math.min(prev, items.length - 1), -1),
    )
  }, [items])

  const maxVisibleItems = getToolPickerMaxVisibleItems(terminalSize.rows)
  const window = useMemo(
    () =>
      getWindowedList({
        itemCount: items.length,
        focusIndex: cursorIndex,
        maxVisible: maxVisibleItems,
        indicatorRows: 2,
      }),
    [cursorIndex, items.length, maxVisibleItems],
  )
  const visibleItems = useMemo(
    () => items.slice(window.start, window.end),
    [items, window.end, window.start],
  )

  useKeypress((input, key) => {
    const inputChar = input.length === 1 ? input : ''

    if (key.escape) {
      onCancel()
      return true
    }

    if (inputChar === 'c') {
      complete()
      return true
    }

    if (inputChar === 'a') {
      toggleMany(allToolNames, !isAllSelected)
      return true
    }

    if (key.return) {
      const item = items[cursorIndex]
      if (item && !item.isHeader) item.action()
      return true
    }

    if (key.upArrow || inputChar === 'k') {
      setCursorIndex(prev => getFocusableToolPickerIndex(items, prev - 1, -1))
      return true
    }

    if (key.downArrow || inputChar === 'j') {
      setCursorIndex(prev => getFocusableToolPickerIndex(items, prev + 1, 1))
      return true
    }

    if (key.pageUp) {
      setCursorIndex(prev =>
        getFocusableToolPickerIndex(items, prev - window.visibleCount, -1),
      )
      return true
    }

    if (key.pageDown) {
      setCursorIndex(prev =>
        getFocusableToolPickerIndex(items, prev + window.visibleCount, 1),
      )
      return true
    }

    if (key.home || inputChar === 'g') {
      setCursorIndex(getFocusableToolPickerIndex(items, 0, 1))
      return true
    }

    if (key.end || inputChar === 'G') {
      setCursorIndex(getFocusableToolPickerIndex(items, items.length - 1, -1))
      return true
    }
  })

  const topIndicator = window.showUpIndicator
    ? `More above (${window.start})`
    : ' '
  const bottomIndicator = window.showDownIndicator
    ? `More below (${items.length - window.end})`
    : ' '
  const rangeSummary =
    items.length > maxVisibleItems
      ? `Showing ${window.start + 1}-${window.end} of ${items.length}`
      : null

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>{topIndicator}</Text>
      {visibleItems.map((item, idx) => {
        const index = window.start + idx
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
      <Text dimColor>{bottomIndicator}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          {isAllSelected
            ? 'All tools selected'
            : `${selectedSet.size} of ${allToolNames.length} tools selected`}
        </Text>
        {rangeSummary ? <Text dimColor>{rangeSummary}</Text> : null}
        <Text dimColor>
          c continue - a all/none - j/k or arrows - PgUp/PgDn - Home/End
        </Text>
      </Box>
    </Box>
  )
}
