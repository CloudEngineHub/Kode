import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text } from 'ink'

import { BunShell } from '#runtime/shell'
import {
  getTaskOutputFilePath,
  readTaskOutputTailLines,
} from '#runtime/taskOutputStore'
import {
  killBackgroundAgentTask,
  listBackgroundAgentTaskSnapshots,
  type BackgroundAgentStatus,
  type BackgroundAgentTask,
} from '#core/utils/backgroundTasks'
import { getOriginalCwd } from '#core/utils/state'
import { getTheme } from '#core/utils/theme'
import { getKodeAgentSessionId } from '#protocol/utils/kodeAgentSessionId'
import { getAgentLogFilePath } from '#protocol/utils/kodeAgentSessionLog'
import { launchExternalEditorForFilePath } from '#cli-utils/externalEditor'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { KEYPRESS_PRIORITY } from '#ui-ink/constants/keypressPriority'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'

const VIEWPORT_SAFE_MARGIN_ROWS = 1
const INDICATOR_ROWS = 2
const REFRESH_INTERVAL_MS = 1000

type ShellTaskStatus = 'running' | 'completed' | 'failed' | 'killed'

type ShellTaskSummary = {
  id: string
  command: string
  status: ShellTaskStatus
  exitCode: number | null
  startedAt: number
  completedAt?: number
  outputFile: string
  stdoutLineCount: number
  stderrLineCount: number
}

type TreeNode =
  | {
      kind: 'group'
      id: string
      label: string
      status: BackgroundAgentStatus | ShellTaskStatus | null
      children: TreeNode[]
    }
  | {
      kind: 'agent'
      task: BackgroundAgentTask
      children: TreeNode[]
    }
  | {
      kind: 'shell'
      task: ShellTaskSummary
    }

type FlatItem =
  | {
      kind: 'group'
      id: string
      depth: number
      label: string
      status: BackgroundAgentStatus | ShellTaskStatus | null
      hasChildren: boolean
    }
  | {
      kind: 'agent'
      id: string
      depth: number
      task: BackgroundAgentTask
      hasChildren: boolean
    }
  | {
      kind: 'shell'
      id: string
      depth: number
      task: ShellTaskSummary
    }

type DetailTarget = { kind: 'shell' | 'agent'; id: string }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function firstLine(text: string, maxLen: number): string {
  const line = text.split(/\r?\n/)[0] ?? ''
  const trimmed = line.trim()
  if (trimmed.length <= maxLen) return trimmed
  return trimmed.slice(0, maxLen - 1) + '…'
}

function formatRuntime(startedAt: number, completedAt?: number): string {
  const end = completedAt ?? Date.now()
  const deltaSeconds = Math.max(0, Math.floor((end - startedAt) / 1000))
  const hours = Math.floor(deltaSeconds / 3600)
  const minutes = Math.floor((deltaSeconds - hours * 3600) / 60)
  const seconds = deltaSeconds - hours * 3600 - minutes * 60
  return `${hours > 0 ? `${hours}h ` : ''}${minutes > 0 || hours > 0 ? `${minutes}m ` : ''}${seconds}s`
}

function rankStatus(status: BackgroundAgentStatus | ShellTaskStatus): number {
  switch (status) {
    case 'running':
      return 0
    case 'failed':
      return 1
    case 'killed':
      return 2
    case 'completed':
      return 3
  }
}

function aggregateStatus(
  statuses: Array<BackgroundAgentStatus | ShellTaskStatus>,
): BackgroundAgentStatus | ShellTaskStatus | null {
  if (statuses.length === 0) return null
  return (
    statuses.slice().sort((a, b) => rankStatus(a) - rankStatus(b))[0] ?? null
  )
}

function statusLabel(
  status: BackgroundAgentStatus | ShellTaskStatus | null,
): string {
  return status ?? 'idle'
}

function statusIcon(
  status: BackgroundAgentStatus | ShellTaskStatus | null,
): string {
  switch (status) {
    case 'running':
      return '●'
    case 'completed':
      return '✓'
    case 'failed':
      return '✗'
    case 'killed':
      return '⨯'
    default:
      return '·'
  }
}

function shellStatusFromRuntime(task: {
  code: number | null
  killed: boolean
  interrupted: boolean
}): ShellTaskStatus {
  if (task.killed) return 'killed'
  if (task.code === null && !task.interrupted) return 'running'
  return task.code === 0 ? 'completed' : 'failed'
}

function buildShellSummaries(): ShellTaskSummary[] {
  const shell = BunShell.getInstance()
  const tasks = shell.listBackgroundShells()
  return tasks.map(t => ({
    id: t.id,
    command: t.command,
    status: shellStatusFromRuntime(t),
    exitCode: t.code,
    startedAt: t.startedAt,
    completedAt: t.completedAt,
    outputFile: t.outputFile || getTaskOutputFilePath(t.id),
    stdoutLineCount: t.stdoutLineCount,
    stderrLineCount: t.stderrLineCount,
  }))
}

function buildAgentTree(tasks: BackgroundAgentTask[]): TreeNode | null {
  if (tasks.length === 0) return null

  const byId = new Map<string, BackgroundAgentTask>()
  for (const task of tasks) byId.set(task.agentId, task)

  const childrenByParent = new Map<string, BackgroundAgentTask[]>()
  for (const task of tasks) {
    const rawParent = task.parentAgentId
    const effectiveParent =
      !rawParent || rawParent === 'main' || !byId.has(rawParent)
        ? 'main'
        : rawParent
    const list = childrenByParent.get(effectiveParent) ?? []
    list.push(task)
    childrenByParent.set(effectiveParent, list)
  }

  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.startedAt - b.startedAt)
  }

  const visited = new Set<string>()
  const buildChildren = (parentId: string): TreeNode[] => {
    const children = childrenByParent.get(parentId) ?? []
    const out: TreeNode[] = []
    for (const child of children) {
      if (visited.has(child.agentId)) continue
      visited.add(child.agentId)
      const grand = buildChildren(child.agentId)
      out.push({ kind: 'agent', task: child, children: grand })
    }
    return out
  }

  const mainChildren = buildChildren('main')
  const mainStatus = aggregateStatus(
    mainChildren.flatMap(node =>
      node.kind === 'agent' ? [node.task.status] : [],
    ),
  )

  return {
    kind: 'group',
    id: 'main',
    label: 'main',
    status: mainStatus,
    children: mainChildren,
  }
}

function buildTasksTree(args: {
  agentTasks: BackgroundAgentTask[]
  shellTasks: ShellTaskSummary[]
}): TreeNode[] {
  const out: TreeNode[] = []

  const agentRoot = buildAgentTree(args.agentTasks)
  if (agentRoot) out.push(agentRoot)

  if (args.shellTasks.length > 0) {
    const status = aggregateStatus(args.shellTasks.map(t => t.status))
    out.push({
      kind: 'group',
      id: '__shell__',
      label: 'shell',
      status,
      children: args.shellTasks
        .slice()
        .sort((a, b) => rankStatus(a.status) - rankStatus(b.status))
        .map(t => ({ kind: 'shell', task: t })),
    })
  }

  return out
}

export function __flattenTasksTreeForTests(args: {
  nodes: TreeNode[]
  collapsedIds: Set<string>
}): FlatItem[] {
  const out: FlatItem[] = []

  const walk = (node: TreeNode, depth: number) => {
    if (node.kind === 'group') {
      const hasChildren = node.children.length > 0
      out.push({
        kind: 'group',
        id: node.id,
        depth,
        label: node.label,
        status: node.status,
        hasChildren,
      })
      if (hasChildren && !args.collapsedIds.has(node.id)) {
        for (const child of node.children) walk(child, depth + 1)
      }
      return
    }

    if (node.kind === 'agent') {
      const hasChildren = node.children.length > 0
      out.push({
        kind: 'agent',
        id: node.task.agentId,
        depth,
        task: node.task,
        hasChildren,
      })
      if (hasChildren && !args.collapsedIds.has(node.task.agentId)) {
        for (const child of node.children) walk(child, depth + 1)
      }
      return
    }

    out.push({ kind: 'shell', id: node.task.id, depth, task: node.task })
  }

  for (const node of args.nodes) walk(node, 0)
  return out
}

export function __buildFlatLinesForTests(args: {
  items: FlatItem[]
  selectedIndex: number
  collapsedIds: Set<string>
  maxWidth: number
}): Array<{
  key: string
  isSelected: boolean
  status: BackgroundAgentStatus | ShellTaskStatus | null
  text: string
}> {
  const out: Array<{
    key: string
    isSelected: boolean
    status: BackgroundAgentStatus | ShellTaskStatus | null
    text: string
  }> = []

  const indentFor = (depth: number) => '  '.repeat(Math.max(0, depth))

  for (let i = 0; i < args.items.length; i++) {
    const item = args.items[i]!
    const isSelected = i === args.selectedIndex

    if (item.kind === 'group') {
      const caret = item.hasChildren
        ? args.collapsedIds.has(item.id)
          ? '▸'
          : '▾'
        : ' '
      const label = `${caret} ${statusIcon(item.status)} ${item.label} (${statusLabel(item.status)})`
      out.push({
        key: `group:${item.id}`,
        isSelected,
        status: item.status,
        text: `${indentFor(item.depth)}${label}`,
      })
      continue
    }

    if (item.kind === 'shell') {
      const label = `${statusIcon(item.task.status)} ${firstLine(item.task.command, 90)}`
      out.push({
        key: `shell:${item.task.id}`,
        isSelected,
        status: item.task.status,
        text: `${indentFor(item.depth)}${label}`,
      })
      continue
    }

    const caret = item.hasChildren
      ? args.collapsedIds.has(item.task.agentId)
        ? '▸'
        : '▾'
      : ' '

    const status = item.task.status
    const errorHint =
      status === 'failed' && item.task.error
        ? ` — ${firstLine(item.task.error, 80)}`
        : ''
    const label = `${caret} ${statusIcon(status)} ${firstLine(item.task.description, 90)}${errorHint}`

    out.push({
      key: `agent:${item.task.agentId}`,
      isSelected,
      status,
      text: `${indentFor(item.depth)}${label}`,
    })
  }

  // truncate for safety
  return out.map(row => ({
    ...row,
    text:
      row.text.length > args.maxWidth
        ? row.text.slice(0, args.maxWidth - 1) + '…'
        : row.text,
  }))
}

function isRunningLeaf(item: FlatItem): boolean {
  if (item.kind === 'agent') return item.task.status === 'running'
  if (item.kind === 'shell') return item.task.status === 'running'
  return false
}

export function __getPreferredSelectedIndexForTests(args: {
  items: FlatItem[]
  currentIndex: number
}): number {
  const leafIndices: number[] = []
  const runningLeafIndices: number[] = []

  for (let i = 0; i < args.items.length; i++) {
    const item = args.items[i]!
    if (item.kind === 'group') continue
    leafIndices.push(i)
    if (isRunningLeaf(item)) runningLeafIndices.push(i)
  }

  if (leafIndices.length === 0) return 0
  if (leafIndices.length === 1) return leafIndices[0]!
  if (runningLeafIndices.length === 1) return runningLeafIndices[0]!
  if (args.currentIndex === 0 && runningLeafIndices.length > 0) {
    return runningLeafIndices[0]!
  }

  return args.currentIndex
}

export function TasksScreen({
  onDone,
}: {
  onDone: (result?: string) => void
}): React.ReactNode {
  const theme = getTheme()
  const layout = useScreenLayout()
  const exitState = { pending: false, keyName: null } as const
  const didDoneRef = useRef(false)

  const safeOnDone = useCallback(
    (result?: string) => {
      if (didDoneRef.current) return
      didDoneRef.current = true
      onDone(result)
    },
    [onDone],
  )

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const [status, setStatus] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null)
  const userMovedSelectionRef = useRef(false)

  const [tick, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  const refresh = useCallback(() => {
    setTick(t => t + 1)
    setStatus('Refreshed')
  }, [])

  const { agentTasks, shellTasks } = useMemo(() => {
    return {
      agentTasks: listBackgroundAgentTaskSnapshots(),
      shellTasks: buildShellSummaries(),
    }
  }, [tick])

  const nodes = useMemo(
    () =>
      buildTasksTree({
        agentTasks,
        shellTasks,
      }),
    [agentTasks, shellTasks],
  )

  const flatItems = useMemo(
    () =>
      __flattenTasksTreeForTests({
        nodes,
        collapsedIds,
      }),
    [collapsedIds, nodes],
  )

  const frameHeaderRows = 1
  const frameRows = frameHeaderRows + 1 + layout.gap * 2 + layout.paddingY * 2
  const detailRows = layout.tightLayout ? 2 : 3
  const innerReservedRows =
    1 + // description
    1 + // shortcut line
    detailRows +
    1 + // status line
    1 + // tip line
    INDICATOR_ROWS

  const contentRows = Math.max(
    1,
    layout.rows - frameRows - innerReservedRows - VIEWPORT_SAFE_MARGIN_ROWS,
  )

  useEffect(() => {
    setSelectedIndex(prev => clamp(prev, 0, Math.max(0, flatItems.length - 1)))
  }, [flatItems.length])

  useEffect(() => {
    setSelectedIndex(prev => {
      if (userMovedSelectionRef.current) return prev
      const preferred = __getPreferredSelectedIndexForTests({
        items: flatItems,
        currentIndex: prev,
      })
      return clamp(preferred, 0, Math.max(0, flatItems.length - 1))
    })
  }, [flatItems])

  useEffect(() => {
    setScrollTop(prev => {
      const maxScrollTop = Math.max(0, flatItems.length - contentRows)
      const target = clamp(prev, 0, maxScrollTop)
      if (selectedIndex < target) return selectedIndex
      if (selectedIndex >= target + contentRows) {
        return clamp(selectedIndex - contentRows + 1, 0, maxScrollTop)
      }
      return target
    })
  }, [contentRows, flatItems.length, selectedIndex])

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selected = flatItems[selectedIndex] ?? null

  const detailTask = useMemo(() => {
    if (!detailTarget) return null
    if (detailTarget.kind === 'shell') {
      return shellTasks.find(t => t.id === detailTarget.id) ?? null
    }
    return agentTasks.find(t => t.agentId === detailTarget.id) ?? null
  }, [agentTasks, detailTarget, shellTasks])

  const detailOutputLines = useMemo(() => {
    if (!detailTarget) return []
    return readTaskOutputTailLines(detailTarget.id, 10)
  }, [detailTarget, tick])

  const openDetails = useCallback(() => {
    if (!selected || selected.kind === 'group') return
    setDetailTarget({ kind: selected.kind, id: selected.id })
  }, [selected])

  const openOutput = useCallback(async () => {
    if (!selected || selected.kind === 'group') return

    const outputPath = getTaskOutputFilePath(selected.id)
    const result = await launchExternalEditorForFilePath(outputPath)
    if (result.ok === true) {
      setStatus(`Opened output in ${result.editorLabel}`)
    } else {
      setStatus(result.error.message || 'Failed to open output file')
    }
  }, [selected])

  const openLog = useCallback(async () => {
    if (!selected || selected.kind !== 'agent') return

    const logPath = getAgentLogFilePath({
      cwd: getOriginalCwd(),
      sessionId: getKodeAgentSessionId(),
      agentId: selected.id,
    })
    const result = await launchExternalEditorForFilePath(logPath)
    if (result.ok === true) {
      setStatus(`Opened log in ${result.editorLabel}`)
    } else {
      setStatus(result.error.message || 'Failed to open log file')
    }
  }, [selected])

  const killSelected = useCallback(() => {
    if (!selected || selected.kind === 'group') return

    if (selected.kind === 'shell') {
      const killed = BunShell.getInstance().killBackgroundShell(selected.id)
      setStatus(
        killed ? `Killed shell task: ${selected.id}` : 'Task not running',
      )
      return
    }

    const killed = killBackgroundAgentTask(selected.id)
    setStatus(killed ? `Killed agent task: ${selected.id}` : 'Task not running')
  }, [selected])

  const killDetailTask = useCallback(() => {
    if (!detailTarget) return

    if (detailTarget.kind === 'shell') {
      const killed = BunShell.getInstance().killBackgroundShell(detailTarget.id)
      setStatus(killed ? `Killed task: ${detailTarget.id}` : 'Task not running')
      return
    }

    const killed = killBackgroundAgentTask(detailTarget.id)
    setStatus(killed ? `Killed task: ${detailTarget.id}` : 'Task not running')
  }, [detailTarget])

  useKeypress(
    (input, key) => {
      if (detailTarget) {
        if (key.leftArrow) {
          setDetailTarget(null)
          return true
        }

        if (input === 'k') {
          killDetailTask()
          return true
        }

        if (
          key.escape ||
          key.return ||
          input === ' ' ||
          (key.ctrl && input === 'c')
        ) {
          safeOnDone()
          return true
        }

        return
      }

      if (key.escape || (key.ctrl && input === 'c')) {
        safeOnDone()
        return true
      }

      if (key.upArrow) {
        userMovedSelectionRef.current = true
        setSelectedIndex(prev =>
          clamp(prev - 1, 0, Math.max(0, flatItems.length - 1)),
        )
        return true
      }

      if (key.downArrow) {
        userMovedSelectionRef.current = true
        setSelectedIndex(prev =>
          clamp(prev + 1, 0, Math.max(0, flatItems.length - 1)),
        )
        return true
      }

      if (key.leftArrow) {
        if (!selected) return true
        const id =
          selected.kind === 'agent'
            ? selected.id
            : selected.kind === 'group'
              ? selected.id
              : null
        if (id && !collapsedIds.has(id)) toggleCollapse(id)
        return true
      }

      if (key.rightArrow) {
        if (!selected) return true
        const id =
          selected.kind === 'agent'
            ? selected.id
            : selected.kind === 'group'
              ? selected.id
              : null
        if (id && collapsedIds.has(id)) toggleCollapse(id)
        return true
      }

      if (key.return) {
        if (!selected) return true
        if (selected.kind === 'shell' || selected.kind === 'agent') {
          openDetails()
          return true
        }
        if (selected.kind === 'group') {
          toggleCollapse(selected.id)
          return true
        }
        return true
      }

      if (input === ' ') {
        if (!selected) return true
        const id =
          selected.kind === 'agent'
            ? selected.id
            : selected.kind === 'group'
              ? selected.id
              : null
        if (id) toggleCollapse(id)
        return true
      }

      if (input === 'r') {
        refresh()
        return true
      }

      if (input === 'k') {
        killSelected()
        return true
      }

      if (input === 'o') {
        void openOutput()
        return true
      }

      if (input === 'l') {
        void openLog()
        return true
      }
    },
    { priority: KEYPRESS_PRIORITY.FULLSCREEN_OVERLAY },
  )

  const hiddenAbove = scrollTop
  const hiddenBelow = Math.max(0, flatItems.length - (scrollTop + contentRows))
  const topIndicator = hiddenAbove ? `... ${hiddenAbove} hidden ...` : ''
  const bottomIndicator = hiddenBelow ? `... ${hiddenBelow} hidden ...` : ''

  const width = Math.max(1, layout.columns - layout.paddingX * 2)
  const visible = useMemo(
    () =>
      __buildFlatLinesForTests({
        items: flatItems.slice(scrollTop, scrollTop + contentRows),
        selectedIndex: selectedIndex - scrollTop,
        collapsedIds,
        maxWidth: width,
      }),
    [collapsedIds, contentRows, flatItems, scrollTop, selectedIndex, width],
  )

  const shortcutLine =
    '↑/↓ select · ←/→ collapse · Enter view · k kill · o open output · l open log · esc close'

  const detailLines: string[] = []
  if (!selected) {
    detailLines.push('No background tasks')
  } else if (selected.kind === 'group') {
    detailLines.push(`${selected.label} (${statusLabel(selected.status)})`)
  } else if (selected.kind === 'shell') {
    detailLines.push(`Shell: ${selected.id} (${selected.task.status})`)
    detailLines.push(`output: ${getTaskOutputFilePath(selected.id)}`)
  } else {
    detailLines.push(`Agent: ${selected.id} (${selected.task.status})`)
    detailLines.push(`output: ${getTaskOutputFilePath(selected.id)}`)
    if (!layout.tightLayout) {
      detailLines.push(
        `log: ${getAgentLogFilePath({
          cwd: getOriginalCwd(),
          sessionId: getKodeAgentSessionId(),
          agentId: selected.id,
        })}`,
      )
    }
  }

  const totalTasks = agentTasks.length + shellTasks.length
  const runningTasks =
    agentTasks.filter(t => t.status === 'running').length +
    shellTasks.filter(t => t.status === 'running').length

  const statusLine =
    status ??
    (totalTasks > 0
      ? `Tasks: ${runningTasks} running · ${totalTasks} total`
      : 'No background tasks')

  const tipLine =
    'Tip: background task output is saved per task ID (no overwrites)'

  if (detailTarget) {
    const outputFile =
      detailTarget.kind === 'shell' && detailTask && 'outputFile' in detailTask
        ? (detailTask as ShellTaskSummary).outputFile
        : getTaskOutputFilePath(detailTarget.id)

    const detailStatus =
      detailTarget.kind === 'shell'
        ? (detailTask as ShellTaskSummary | null)?.status
        : (detailTask as BackgroundAgentTask | null)?.status

    const runtime =
      detailTarget.kind === 'shell'
        ? detailTask && 'startedAt' in detailTask
          ? formatRuntime(
              (detailTask as ShellTaskSummary).startedAt,
              (detailTask as ShellTaskSummary).completedAt,
            )
          : null
        : detailTask && 'startedAt' in detailTask
          ? formatRuntime(
              (detailTask as BackgroundAgentTask).startedAt,
              (detailTask as BackgroundAgentTask).completedAt,
            )
          : null

    const commandOrDescription =
      detailTarget.kind === 'shell'
        ? (detailTask as ShellTaskSummary | null)?.command
        : (detailTask as BackgroundAgentTask | null)?.description

    const totalLines =
      detailTarget.kind === 'shell'
        ? (detailTask as ShellTaskSummary | null)
          ? (detailTask as ShellTaskSummary).stdoutLineCount +
            (detailTask as ShellTaskSummary).stderrLineCount +
            (detailOutputLines.length > 0 ? 1 : 0)
          : null
        : null

    const showingLine =
      detailOutputLines.length === 0
        ? null
        : totalLines !== null && totalLines > 10
          ? `Showing last 10 lines of ${totalLines} total. Full output: ${outputFile}`
          : totalLines !== null
            ? `Showing ${totalLines} lines`
            : `Full output: ${outputFile}`

    const footerActions = [
      '← to go back',
      'Esc/Enter/Space to close',
      detailStatus === 'running' ? 'k to kill' : null,
    ]
      .filter(Boolean)
      .join(' · ')

    return (
      <ScreenFrame
        title={detailTarget.kind === 'shell' ? 'Shell details' : 'Task details'}
        exitState={exitState}
        paddingX={layout.paddingX}
        paddingY={layout.paddingY}
        gap={layout.gap}
      >
        <Box flexDirection="column">
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor={theme.secondaryBorder}
            paddingX={1}
          >
            <Text wrap="truncate-end">
              <Text bold>Status</Text>: {detailStatus ?? '(unknown)'}
            </Text>
            {runtime ? (
              <Text wrap="truncate-end">
                <Text bold>Runtime</Text>: {runtime}
              </Text>
            ) : null}
            <Text wrap="truncate-end">
              <Text bold>
                {detailTarget.kind === 'shell' ? 'Command' : 'Task'}
              </Text>
              : {commandOrDescription ?? '(unknown)'}
            </Text>

            <Box flexDirection="column" marginTop={1}>
              <Text bold>Output:</Text>
              {detailOutputLines.length > 0 ? (
                <Box
                  flexDirection="column"
                  borderStyle="round"
                  borderColor={theme.secondaryBorder}
                  paddingX={1}
                  height={12}
                  width="100%"
                >
                  {detailOutputLines.map((line, index) => (
                    <Text key={index} wrap="truncate-end">
                      {line}
                    </Text>
                  ))}
                </Box>
              ) : (
                <Text dimColor>No output available</Text>
              )}
              {showingLine ? (
                <Text dimColor italic wrap="truncate-end">
                  {showingLine}
                </Text>
              ) : null}
            </Box>
          </Box>

          <Box marginLeft={2} marginTop={layout.gap}>
            <Text dimColor wrap="truncate-end">
              {footerActions}
            </Text>
          </Box>
        </Box>
      </ScreenFrame>
    )
  }

  return (
    <ScreenFrame
      title="Tasks"
      exitState={exitState}
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="column">
        <Text dimColor wrap="truncate-end">
          Manage background tasks (agents + shells) and jump to their artifacts
        </Text>
        <Text dimColor wrap="truncate-end">
          {shortcutLine}
        </Text>

        <Box flexDirection="column" marginTop={layout.gap}>
          <Text dimColor wrap="truncate-end">
            {topIndicator}
          </Text>
          {visible.length > 0 ? (
            visible.map(row => (
              <Text
                key={row.key}
                color={
                  row.isSelected
                    ? theme.text
                    : row.status === 'failed'
                      ? theme.error
                      : row.status === 'running'
                        ? theme.warning
                        : theme.secondaryText
                }
                wrap="truncate-end"
              >
                {row.isSelected ? `> ${row.text}` : `  ${row.text}`}
              </Text>
            ))
          ) : (
            <Text color={theme.secondaryText} wrap="truncate-end">
              (No background tasks)
            </Text>
          )}
          <Text dimColor wrap="truncate-end">
            {bottomIndicator}
          </Text>
        </Box>

        <Box flexDirection="column" marginTop={layout.gap}>
          {detailLines.slice(0, detailRows).map((line, idx) => (
            <Text key={idx} dimColor wrap="truncate-end">
              {line}
            </Text>
          ))}
        </Box>

        <Box flexDirection="column" marginTop={layout.gap}>
          <Text dimColor wrap="truncate-end">
            {statusLine}
          </Text>
          <Text dimColor wrap="truncate-end">
            {tipLine}
          </Text>
        </Box>
      </Box>
    </ScreenFrame>
  )
}
