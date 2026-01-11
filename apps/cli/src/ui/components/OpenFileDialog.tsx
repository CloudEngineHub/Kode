import { spawn } from 'child_process'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text } from 'ink'
import { resolve as resolvePath } from 'path'
import { getTheme } from '#core/utils/theme'
import { ensureRipgrepReady } from '#core/utils/ripgrep'
import { getCwd } from '#core/utils/state'
import TextInput from '#ui-ink/components/TextInput'
import { Select } from '#ui-ink/components/CustomSelect/select'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { launchExternalEditorForFilePath } from '#cli-utils/externalEditor'

const VIEWPORT_SAFE_MARGIN_ROWS = 1
const MAX_INDEXED_FILES = 20_000
const MAX_MATCH_RESULTS = 2_000
const FILE_INDEX_CACHE_LIMIT = 5

type FileIndexSource = 'git' | 'rg'

type FileIndexResult = {
  files: string[]
  truncated: boolean
  source: FileIndexSource
}

async function indexProjectFiles(args: {
  cwd: string
  limit: number
  signal: AbortSignal
}): Promise<FileIndexResult> {
  const attempt = async (
    source: FileIndexSource,
    command: string,
    commandArgs: string[],
  ): Promise<FileIndexResult> => {
    return await new Promise<FileIndexResult>((resolve, reject) => {
      const files: string[] = []
      let buffer = ''
      let stderr = ''
      let settled = false
      let truncated = false

      const child = spawn(command, commandArgs, {
        cwd: args.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })

      const cleanup = () => {
        args.signal.removeEventListener('abort', onAbort)
        child.stdout?.removeListener('data', onStdout)
        child.stderr?.removeListener('data', onStderr)
        child.removeListener('error', onError)
        child.removeListener('exit', onExit)
      }

      const finish = (result: FileIndexResult) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(result)
      }

      const fail = (error: Error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      }

      const onAbort = () => {
        try {
          child.kill()
        } catch {
          // best-effort
        }
        finish({ files, truncated, source })
      }

      const onError = (error: Error) => {
        fail(error)
      }

      const onExit = (code: number | null) => {
        if (code && code !== 0) {
          const message =
            stderr.trim().split('\n')[0] || `${command} exited ${code}`
          fail(new Error(message))
          return
        }
        finish({ files, truncated, source })
      }

      const onStderr = (chunk: Buffer | string) => {
        if (stderr.length > 8_000) return
        stderr += chunk.toString()
      }

      const onStdout = (chunk: Buffer | string) => {
        buffer += chunk.toString()

        while (true) {
          const newlineIndex = buffer.indexOf('\n')
          if (newlineIndex === -1) break

          const rawLine = buffer.slice(0, newlineIndex)
          buffer = buffer.slice(newlineIndex + 1)

          const line = rawLine.replace(/\r$/, '').trim()
          if (!line) continue

          files.push(line)
          if (files.length >= args.limit) {
            truncated = true
            try {
              child.kill()
            } catch {
              // best-effort
            }
            finish({ files, truncated, source })
            return
          }
        }
      }

      args.signal.addEventListener('abort', onAbort)
      child.on('error', onError)
      child.on('exit', onExit)
      child.stdout?.on('data', onStdout)
      child.stderr?.on('data', onStderr)
    })
  }

  try {
    return await attempt('git', 'git', [
      'ls-files',
      '-co',
      '--exclude-standard',
    ])
  } catch {
    // Fallback below.
  }

  const rg = await ensureRipgrepReady()
  return await attempt('rg', rg, ['--files'])
}

type CachedIndex = { result: FileIndexResult; cachedAt: number }
const fileIndexCache = new Map<string, CachedIndex>()

function readCachedIndex(cwd: string): FileIndexResult | null {
  const entry = fileIndexCache.get(cwd)
  return entry ? entry.result : null
}

function writeCachedIndex(cwd: string, result: FileIndexResult): void {
  fileIndexCache.set(cwd, { result, cachedAt: Date.now() })
  if (fileIndexCache.size <= FILE_INDEX_CACHE_LIMIT) return

  let oldestKey: string | null = null
  let oldestAt = Infinity
  for (const [key, value] of fileIndexCache.entries()) {
    if (value.cachedAt < oldestAt) {
      oldestAt = value.cachedAt
      oldestKey = key
    }
  }
  if (oldestKey) fileIndexCache.delete(oldestKey)
}

function normalizeQuery(value: string): string {
  return value.trim()
}

export function OpenFileDialog({
  onDone,
}: {
  onDone: (result?: string) => void
}): React.ReactNode {
  const theme = getTheme()
  const { rows, columns } = useTerminalSize()
  const cwd = getCwd()

  const [query, setQuery] = useState('')
  const [queryCursorOffset, setQueryCursorOffset] = useState(0)

  const [indexResult, setIndexResult] = useState<FileIndexResult>({
    files: [],
    truncated: false,
    source: 'git',
  })
  const [indexStatus, setIndexStatus] = useState<
    | { state: 'idle' }
    | { state: 'loading' }
    | { state: 'error'; message: string }
  >({ state: 'loading' })

  const [isOpening, setIsOpening] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  const startIndexing = useCallback(
    (force = false) => {
      if (!force) {
        const cached = readCachedIndex(cwd)
        if (cached) {
          setIndexResult(cached)
          setIndexStatus({ state: 'idle' })
          return
        }
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setIndexStatus({ state: 'loading' })
      setStatusMessage(null)

      void (async () => {
        try {
          const res = await indexProjectFiles({
            cwd,
            limit: MAX_INDEXED_FILES,
            signal: controller.signal,
          })
          if (controller.signal.aborted) return
          writeCachedIndex(cwd, res)
          setIndexResult(res)
          setIndexStatus({ state: 'idle' })
        } catch (error) {
          if (controller.signal.aborted) return
          setIndexStatus({
            state: 'error',
            message: error instanceof Error ? error.message : String(error),
          })
        }
      })()
    },
    [cwd],
  )

  useEffect(() => {
    startIndexing(false)
    return () => abortRef.current?.abort()
  }, [startIndexing])

  const normalizedQuery = useMemo(() => normalizeQuery(query), [query])
  const indexedLower = useMemo(
    () => indexResult.files.map(file => file.toLowerCase()),
    [indexResult.files],
  )
  const matches = useMemo(() => {
    const files = indexResult.files
    if (!normalizedQuery) return files

    const q = normalizedQuery.toLowerCase()
    const out: string[] = []
    for (let i = 0; i < files.length; i++) {
      if (indexedLower[i]?.includes(q)) out.push(files[i]!)
    }
    return out
  }, [indexResult.files, indexedLower, normalizedQuery])

  const limitedMatches = useMemo(() => {
    return matches.slice(0, MAX_MATCH_RESULTS)
  }, [matches])
  const hiddenMatchCount = Math.max(0, matches.length - limitedMatches.length)

  const options = useMemo(
    () => limitedMatches.map(file => ({ label: file, value: file })),
    [limitedMatches],
  )

  const headerRows = 5
  const footerRows = 1
  const maxVisibleOptionCount = Math.max(
    1,
    rows - headerRows - footerRows - VIEWPORT_SAFE_MARGIN_ROWS,
  )
  const visibleOptionCount = Math.min(options.length, maxVisibleOptionCount)

  const exitState = useExitOnCtrlCD(() => process.exit(0))

  useKeypress(
    (input, key) => {
      if (key.escape) {
        onDone()
        return true
      }

      if (key.ctrl && input === 'r') {
        startIndexing(true)
        return true
      }
    },
    { priority: 10 },
  )

  const textInputColumns = Math.max(10, Math.min(80, columns - 10))

  const handleOpenFile = useCallback(
    async (relativePath: string) => {
      if (isOpening) return

      setIsOpening(true)
      setStatusMessage(`Opening ${relativePath}…`)

      const result = await launchExternalEditorForFilePath(
        resolvePath(cwd, relativePath),
      )

      if (result.ok === true) {
        onDone(`Opened ${relativePath} in ${result.editorLabel}`)
        return
      } else {
        if ('error' in result) {
          setStatusMessage(`Failed to open: ${result.error.message}`)
        } else {
          setStatusMessage('Failed to open file')
        }
        setIsOpening(false)
      }
    },
    [cwd, isOpening, onDone],
  )

  const indexLine = (() => {
    if (indexStatus.state === 'loading') return 'Indexing files…'
    if (indexStatus.state === 'error')
      return `Indexing failed: ${indexStatus.message}`

    const indexed = indexResult.files.length
    const source =
      indexResult.source === 'git'
        ? 'git ls-files'
        : indexResult.source === 'rg'
          ? 'rg --files'
          : 'index'
    const indexedSuffix = indexResult.truncated
      ? ` (showing first ${indexed})`
      : ''
    if (!normalizedQuery) {
      return `Indexed ${indexed}${indexedSuffix} via ${source}. Type to filter (Ctrl+R refresh).`
    }

    const matchSuffix =
      hiddenMatchCount > 0 ? ` (+${hiddenMatchCount} more, refine query)` : ''
    return `Matches ${limitedMatches.length}${matchSuffix} / ${indexed}${indexedSuffix}`
  })()

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color={theme.kode}>
          Open file
        </Text>
        <Text dimColor>
          {exitState.pending
            ? `Press ${exitState.keyName} again to exit`
            : 'Enter to open · Esc to close'}
        </Text>
      </Box>

      <Text dimColor wrap="truncate-end">
        {cwd}
      </Text>

      <Box flexDirection="row" gap={1} marginTop={1}>
        <Text dimColor>Search:</Text>
        <TextInput
          value={query}
          onChange={value => {
            setQuery(value)
          }}
          placeholder="Type to filter files…"
          columns={textInputColumns}
          cursorOffset={queryCursorOffset}
          onChangeCursorOffset={setQueryCursorOffset}
          showCursor={!isOpening}
          focus={!isOpening}
          maxHeight={1}
          disableCursorMovementForUpDownKeys={true}
        />
      </Box>

      <Text
        color={
          indexStatus.state === 'error' ? theme.error : theme.secondaryText
        }
        wrap="truncate-end"
      >
        {statusMessage ?? indexLine}
      </Text>

      {options.length > 0 && visibleOptionCount > 0 ? (
        <Select
          options={options}
          highlightText={normalizedQuery || undefined}
          visibleOptionCount={visibleOptionCount}
          isDisabled={isOpening || indexStatus.state !== 'idle'}
          onChange={value => void handleOpenFile(value)}
        />
      ) : (
        <Box marginTop={1}>
          <Text dimColor>
            {indexStatus.state === 'loading'
              ? 'Loading…'
              : normalizedQuery
                ? 'No matches.'
                : 'No files found.'}
          </Text>
        </Box>
      )}

      <Text dimColor>
        ↑↓ navigate · Enter open · Ctrl+R refresh · Esc close
      </Text>
    </Box>
  )
}
