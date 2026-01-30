import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Box, Text } from 'ink'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import figures from 'figures'
import type { Command } from '#cli-commands'
import { PRODUCT_COMMAND, PRODUCT_NAME } from '#core/constants/product'
import { CACHE_PATHS, DATE } from '#core/logging/log/paths'
import { MACRO } from '#core/constants/macros'
import { getTheme } from '#core/utils/theme'
import {
  getCustomCommandDirectories,
  hasCustomCommands,
  type CustomCommandWithScope,
} from '#cli-services/customCommands'
import { copyTextToClipboard } from '#cli-utils/clipboard'
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

function isCustomCommandWithScope(cmd: Command): cmd is CustomCommandWithScope {
  if (cmd.type !== 'prompt') return false
  const scope = (cmd as unknown as Record<string, unknown>).scope
  return scope === 'project' || scope === 'user'
}

function getHelpPath(): string {
  return join(CACHE_PATHS.errors(), `help-${DATE}.txt`)
}

function buildHelpLines(commands: Command[]): string[] {
  const filteredCommands = commands.filter(cmd => !cmd.isHidden)
  const customCommands = filteredCommands.filter(isCustomCommandWithScope)
  const builtInCommands = filteredCommands.filter(
    cmd => !isCustomCommandWithScope(cmd),
  )

  const dirs = getCustomCommandDirectories()

  const lines: string[] = []

  lines.push(`${PRODUCT_NAME} v${MACRO.VERSION}`)
  lines.push('')
  lines.push(
    `${PRODUCT_NAME} is a beta research preview. Always review responses, especially when running code.`,
  )
  lines.push('')

  lines.push('Usage')
  lines.push(`- REPL: ${PRODUCT_COMMAND}`)
  lines.push(`- Non-interactive: ${PRODUCT_COMMAND} -p "question"`)
  lines.push(`- CLI options: ${PRODUCT_COMMAND} -h`)
  lines.push('')

  lines.push('Keyboard shortcuts (REPL)')
  lines.push('- ?: Shortcuts (when input is empty)')
  lines.push('- F1: Help')
  lines.push('- F2: Config')
  lines.push('- F3: Open file')
  lines.push('- F4: Console (captured stdout/stderr)')
  lines.push('- F5: Notifications')
  lines.push('- F6: Transcript (scroll/copy)')
  lines.push('- F7: Command palette')
  lines.push('- F8: Tasks (background tasks)')
  lines.push('- Ctrl+O: Toggle verbose transcript')
  lines.push('- Ctrl+T: Work tasks')
  lines.push('- Ctrl+R: History search')
  lines.push('- Alt+P: Model picker')
  lines.push('- Ctrl+G: External editor')
  lines.push('- Ctrl+S: Stash prompt')
  lines.push('- Ctrl+_: Undo')
  lines.push('- Double Esc: Clear input')
  lines.push('- Shift+Tab: Cycle permission mode')
  lines.push('- Down Arrow (empty input): Tasks (when available)')
  lines.push('')

  lines.push('Common tasks')
  lines.push('- Ask questions about your codebase')
  lines.push('  > How does foo.py work?')
  lines.push('- Edit files')
  lines.push('  > Update bar.ts to...')
  lines.push('- Run bash commands')
  lines.push('  > !ls')
  lines.push('')

  lines.push('Commands')
  for (const cmd of builtInCommands) {
    lines.push(`- /${cmd.name} — ${cmd.description}`)
  }

  if (customCommands.length > 0) {
    lines.push('')
    lines.push('Custom commands')
    for (const cmd of customCommands) {
      const scope = cmd.scope ? ` [${cmd.scope}]` : ''
      const aliases =
        cmd.aliases && cmd.aliases.length > 0
          ? ` (aliases: ${cmd.aliases.join(', ')})`
          : ''
      lines.push(`- /${cmd.name}${scope} — ${cmd.description}${aliases}`)
    }
  }

  lines.push('')
  lines.push(`Learn more: ${MACRO.README_URL}`)

  lines.push('')
  lines.push('Custom command directories')
  lines.push(`- ${dirs.userKodeCommands}`)
  lines.push(`- ${dirs.projectKodeCommands}`)
  lines.push(`- ${dirs.userKodeSkills}`)
  lines.push(`- ${dirs.projectKodeSkills}`)
  lines.push('')
  lines.push('Legacy directories (also loaded)')
  lines.push(`- ${dirs.userLegacyCommands}`)
  lines.push(`- ${dirs.projectLegacyCommands}`)
  lines.push(`- ${dirs.userLegacySkills}`)
  lines.push(`- ${dirs.projectLegacySkills}`)
  lines.push(`- Reload: /refresh-commands`)

  if (!hasCustomCommands()) {
    lines.push('')
    lines.push(
      'Tip: create custom commands by adding `.md` files to the paths above.',
    )
  }

  return lines
}

export function HelpScreen({
  commands,
  onDone,
}: {
  commands: Command[]
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

  const [scrollTop, setScrollTop] = useState(0)
  const [status, setStatus] = useState<string | null>(null)
  const [savedPath, setSavedPath] = useState<string | null>(null)

  const rawLines = useMemo(() => buildHelpLines(commands), [commands])
  const wrapped = useMemo(() => {
    const width = Math.max(1, layout.columns - layout.paddingX * 2)
    return wrapLines(rawLines, width)
  }, [layout.columns, layout.paddingX, rawLines])

  const frameHeaderRows = 1
  const frameRows = frameHeaderRows + 1 + layout.gap * 2 + layout.paddingY * 2
  const innerReservedRows =
    1 + // shortcut line
    1 + // status line
    INDICATOR_ROWS +
    1 // tip line

  const contentRows = Math.max(
    1,
    layout.rows - frameRows - innerReservedRows - VIEWPORT_SAFE_MARGIN_ROWS,
  )

  const maxScrollTop = Math.max(0, wrapped.length - contentRows)

  const copyAll = useCallback(async () => {
    try {
      const result = await copyTextToClipboard(rawLines.join('\n') + '\n')
      if (result.method === 'osc52' && result.truncated) {
        setStatus('Copied (OSC 52, truncated).')
      } else {
        setStatus('Copied to clipboard.')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatus(`Copy failed: ${message}`)
    }
  }, [rawLines])

  const save = useCallback(() => {
    try {
      const path = getHelpPath()
      mkdirSync(CACHE_PATHS.errors(), { recursive: true })
      writeFileSync(path, rawLines.join('\n') + '\n', 'utf8')
      setSavedPath(path)
      setStatus(`Saved to ${path}`)
      return path
    } catch {
      setStatus('Failed to save help')
      return null
    }
  }, [rawLines])

  useKeypress(
    (input, key) => {
      const inputChar = input.length === 1 ? input : ''

      if (key.escape || (key.ctrl && inputChar === 'c')) {
        safeOnDone()
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

      if (inputChar === 'y') {
        void copyAll()
        return true
      }

      if (inputChar === 's') {
        save()
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

  const statusLine =
    status ??
    (wrapped.length > 0
      ? `Showing ${Math.min(contentRows, wrapped.length)} of ${wrapped.length} lines`
      : 'Empty help')

  return (
    <ScreenFrame
      title="Help"
      exitState={exitState}
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="column">
        <Text dimColor wrap="truncate-end">
          Scroll: ↑↓ j/k PgUp/PgDn Home/End · y copy · s save · Esc/Ctrl+C close
        </Text>
        <Text color={theme.secondaryText} wrap="truncate-end">
          {statusLine}
        </Text>

        <Text dimColor wrap="truncate-end">
          {topIndicator}
        </Text>
        {visible.length > 0 ? (
          visible.map((line, idx) => (
            <Text key={`${clampedScrollTop}:${idx}`} wrap="truncate-end">
              {line}
            </Text>
          ))
        ) : (
          <Text dimColor>(empty)</Text>
        )}
        <Text dimColor wrap="truncate-end">
          {bottomIndicator}
        </Text>

        <Text dimColor wrap="truncate-end">
          {savedPath
            ? `Saved: ${savedPath}`
            : `Tip: press 's' to save to ${getHelpPath()}`}
        </Text>
      </Box>
    </ScreenFrame>
  )
}
