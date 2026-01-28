import { Box, Text } from 'ink'
import * as React from 'react'
import { readFileSync } from 'fs'
import { EOL } from 'os'
import { extname, isAbsolute, relative, resolve } from 'path'

import { FileEditToolUpdatedMessage } from '#ui-ink/components/FileEditToolUpdatedMessage'
import { HighlightedCode } from '#ui-ink/components/HighlightedCode'
import { StructuredDiff } from '#ui-ink/components/StructuredDiff'
import { FallbackToolUseRejectedMessage } from '#ui-ink/components/FallbackToolUseRejectedMessage'
import { intersperse } from '#core/utils/array'
import { detectFileEncoding } from '#core/utils/file'
import { fileExistsBun } from '#runtime/file'
import { logError } from '#core/utils/log'
import { getCwd } from '#core/utils/state'
import { getTheme } from '#core/utils/theme'
import { getPatch } from '#core/utils/diff'

const MAX_LINES_TO_RENDER = 5

export function renderFileWriteToolResultMessage(
  output: {
    filePath: string
    content: string
    structuredPatch?: any[]
    type: 'create' | 'update'
  },
  options: { verbose: boolean },
): React.ReactNode {
  // Compatibility: result messages stay compact by default.
  const verbose = false

  switch (output.type) {
    case 'create': {
      const contentWithFallback = output.content || '(No content)'
      const numLines = output.content.split(EOL).length

      return (
        <Box flexDirection="column">
          <Text>
            {'  '}⎿ Wrote {numLines} lines to{' '}
            <Text bold>{output.filePath}</Text>
          </Text>
          <Box flexDirection="column" paddingLeft={5}>
            <HighlightedCode
              code={
                verbose
                  ? contentWithFallback
                  : contentWithFallback
                      .split('\n')
                      .slice(0, MAX_LINES_TO_RENDER)
                      .filter(_ => _.trim() !== '')
                      .join('\n')
              }
              language={extname(output.filePath).slice(1)}
            />
            {!verbose && numLines > MAX_LINES_TO_RENDER && (
              <Text color={getTheme().secondaryText}>
                ... (+{numLines - MAX_LINES_TO_RENDER} lines)
              </Text>
            )}
          </Box>
        </Box>
      )
    }
    case 'update':
      return (
        <FileEditToolUpdatedMessage
          filePath={output.filePath}
          structuredPatch={output.structuredPatch}
          verbose={verbose}
        />
      )
  }
}

export function renderFileWriteToolUseRejectedMessage(
  input: { file_path?: string; content?: string } = {},
  options: { columns: number; verbose: boolean } = {
    columns: 80,
    verbose: false,
  },
): React.ReactNode {
  try {
    const { file_path, content } = input
    const { columns, verbose } = options

    if (!file_path) {
      return <FallbackToolUseRejectedMessage />
    }

    const fullFilePath = isAbsolute(file_path)
      ? file_path
      : resolve(getCwd(), file_path)
    const oldFileExists = fileExistsBun(fullFilePath)
    const enc = oldFileExists ? detectFileEncoding(fullFilePath) : 'utf-8'
    const oldContent = oldFileExists ? readFileSync(fullFilePath, enc) : null
    const type = oldContent ? 'update' : 'create'
    const patch = getPatch({
      filePath: file_path,
      fileContents: oldContent ?? '',
      oldStr: oldContent ?? '',
      newStr: content ?? '',
    })

    return (
      <Box flexDirection="column">
        <Text>
          {'  '}⎿{' '}
          <Text color={getTheme().error}>
            User rejected {type === 'update' ? 'update' : 'write'} to{' '}
          </Text>
          <Text bold>
            {verbose ? file_path : relative(getCwd(), file_path)}
          </Text>
        </Text>
        {intersperse(
          patch.map(_ => (
            <Box flexDirection="column" paddingLeft={5} key={_.newStart}>
              <StructuredDiff patch={_} dim={true} width={columns - 12} />
            </Box>
          )),
          i => (
            <Box paddingLeft={5} key={`ellipsis-${i}`}>
              <Text color={getTheme().secondaryText}>...</Text>
            </Box>
          ),
        )}
      </Box>
    )
  } catch (error) {
    // Handle the case where while we were showing the diff, the user manually made the change.
    // NOTE: When the file changes during diff rendering, fall back to a minimal message.
    logError(error)
    return (
      <Box flexDirection="column">
        <Text>{'  '}⎿ (No changes)</Text>
      </Box>
    )
  }
}
