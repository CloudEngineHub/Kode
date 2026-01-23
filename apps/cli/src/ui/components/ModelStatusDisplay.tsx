import React, { useMemo, useState } from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'
import { getModelManager } from '#core/utils/model'
import { getGlobalConfig } from '#core/utils/config'
import { getTheme } from '#core/utils/theme'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { KEYPRESS_PRIORITY } from '#ui-ink/constants/keypressPriority'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'
import { wrapLines } from '#ui-ink/primitives/text/wrapLines'

const VIEWPORT_SAFE_MARGIN_ROWS = 1
const INDICATOR_ROWS = 2

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

type Props = {
  onClose: () => void
}

function formatContextLength(contextLength: number | undefined): string {
  if (!contextLength || !Number.isFinite(contextLength)) return 'unknown'
  return `${Math.round(contextLength / 1000)}k`
}

function safeDateTime(value: number | undefined): string | null {
  if (!value || !Number.isFinite(value)) return null
  try {
    return new Date(value).toLocaleString()
  } catch {
    return null
  }
}

function buildModelStatusLines(): string[] {
  const modelManager = getModelManager()
  const config = getGlobalConfig()

  const pointers = ['main', 'task', 'compact', 'quick'] as const

  const lines: string[] = []

  lines.push('Pointers')
  for (const pointer of pointers) {
    let line = `- ${pointer}: `
    try {
      const model = modelManager.getModel(pointer)
      if (model) {
        const provider = model.provider ? ` (${model.provider})` : ''
        const ctx = formatContextLength(model.contextLength)
        const active = model.isActive ? 'active' : 'inactive'
        line += `${model.name}${provider} · ${model.modelName} · ctx ${ctx} · ${active}`
      } else {
        line += '(not configured)'
      }
    } catch (error) {
      line += `error: ${String(error)}`
    }
    lines.push(line)
  }

  lines.push('')
  lines.push('Model library')

  const available = modelManager.getAvailableModels() ?? []
  const sorted = [...available].sort(
    (a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0),
  )

  if (sorted.length === 0) {
    lines.push('- (none)')
  } else {
    for (const m of sorted) {
      const provider = m.provider ? ` (${m.provider})` : ''
      const ctx = formatContextLength(m.contextLength)
      const lastUsed = safeDateTime(m.lastUsed)
      const lastUsedSuffix = lastUsed ? ` · last used ${lastUsed}` : ''
      lines.push(
        `- ${m.name}${provider} · ${m.modelName} · ctx ${ctx}${lastUsedSuffix}`,
      )
    }
  }

  lines.push('')
  lines.push('Config')
  lines.push(`- modelProfiles: ${config.modelProfiles?.length ?? 0}`)

  const legacyDefaultModelId = (config as unknown as Record<string, unknown>)
    .defaultModelId
  const legacyValue =
    typeof legacyDefaultModelId === 'string' && legacyDefaultModelId.length > 0
      ? legacyDefaultModelId
      : null
  lines.push(`- defaultModelId (legacy): ${legacyValue ?? '(not set)'}`)

  const pointerEntries = Object.entries(config.modelPointers ?? {})
  if (pointerEntries.length === 0) {
    lines.push('- modelPointers: (none)')
  } else {
    lines.push('- modelPointers:')
    for (const [pointer, modelId] of pointerEntries) {
      lines.push(`  - ${pointer}: ${modelId || '(not set)'}`)
    }
  }

  return lines
}

export function ModelStatusDisplay({ onClose }: Props): React.ReactNode {
  const theme = getTheme()
  const layout = useScreenLayout()
  const exitState = useExitOnCtrlCD(onClose)

  const [scrollTop, setScrollTop] = useState(0)

  const rawLines = useMemo(() => buildModelStatusLines(), [])
  const wrapped = useMemo(() => {
    const width = Math.max(1, layout.columns - layout.paddingX * 2)
    return wrapLines(rawLines, width)
  }, [layout.columns, layout.paddingX, rawLines])

  const frameHeaderRows = 1 + (exitState.pending ? 1 : 0)
  const frameRows = frameHeaderRows + 1 + layout.gap * 2 + layout.paddingY * 2
  const innerReservedRows =
    1 + // shortcut line
    INDICATOR_ROWS

  const contentRows = Math.max(
    1,
    layout.rows - frameRows - innerReservedRows - VIEWPORT_SAFE_MARGIN_ROWS,
  )

  const maxScrollTop = Math.max(0, wrapped.length - contentRows)

  useKeypress(
    (input, key) => {
      const inputChar = input.length === 1 ? input : ''

      if (key.escape) {
        onClose()
        return true
      }

      if (key.upArrow || inputChar === 'k') {
        setScrollTop(prev => clamp(prev - 1, 0, maxScrollTop))
        return true
      }

      if (key.downArrow || inputChar === 'j') {
        setScrollTop(prev => clamp(prev + 1, 0, maxScrollTop))
        return true
      }

      if (key.pageUp) {
        setScrollTop(prev => clamp(prev - contentRows, 0, maxScrollTop))
        return true
      }

      if (key.pageDown) {
        setScrollTop(prev => clamp(prev + contentRows, 0, maxScrollTop))
        return true
      }

      if (key.home || inputChar === 'g') {
        setScrollTop(0)
        return true
      }

      if (key.end || inputChar === 'G') {
        setScrollTop(maxScrollTop)
        return true
      }
    },
    { priority: KEYPRESS_PRIORITY.FULLSCREEN_OVERLAY },
  )

  const clampedScrollTop = clamp(scrollTop, 0, maxScrollTop)
  const hiddenAbove = clampedScrollTop
  const hiddenBelow = Math.max(
    0,
    wrapped.length - (clampedScrollTop + contentRows),
  )

  const visible = useMemo(() => {
    return wrapped.slice(clampedScrollTop, clampedScrollTop + contentRows)
  }, [clampedScrollTop, contentRows, wrapped])

  const topIndicator = hiddenAbove
    ? `${figures.arrowUp} ${hiddenAbove} more`
    : ' '
  const bottomIndicator = hiddenBelow
    ? `${figures.arrowDown} ${hiddenBelow} more`
    : ' '

  return (
    <ScreenFrame
      title="Model Status"
      exitState={exitState}
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="column">
        <Text dimColor wrap="truncate-end">
          Scroll: ↑↓ j/k PgUp/PgDn Home/End · Esc close
        </Text>
        <Text dimColor wrap="truncate-end">
          {topIndicator}
        </Text>
        {visible.length > 0 ? (
          visible.map((line, idx) => (
            <Text
              key={`${clampedScrollTop}:${idx}`}
              color={line.startsWith('- main:') ? theme.text : undefined}
              wrap="truncate-end"
            >
              {line}
            </Text>
          ))
        ) : (
          <Text dimColor>(empty)</Text>
        )}
        <Text dimColor wrap="truncate-end">
          {bottomIndicator}
        </Text>
      </Box>
    </ScreenFrame>
  )
}
