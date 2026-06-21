import { Box, Text } from 'ink'
import * as React from 'react'
import { readFileSync } from 'fs'
import { isAbsolute, relative, resolve } from 'path'

import { FileEditToolUpdatedMessage } from '#ui-ink/components/FileEditToolUpdatedMessage'
import { StructuredDiff } from '#ui-ink/components/StructuredDiff'
import { FallbackToolUseRejectedMessage } from '#ui-ink/components/FallbackToolUseRejectedMessage'
import { intersperse } from '#core/utils/array'
import { detectFileEncoding } from '#core/utils/file'
import { getCwd } from '#core/utils/state'
import { getTheme } from '#core/utils/theme'
import { normalizeLineEndings } from '#core/utils/paste'
import { getPatch } from '#core/utils/diff'
import { logError } from '#core/utils/log'

export function renderFileEditToolResultMessage(
  output: { filePath: string; structuredPatch?: any[] },
  options: { verbose: boolean },
): React.ReactNode {
  // Compatibility: result messages stay compact by default.
  const verbose = false
  return (
    <FileEditToolUpdatedMessage
      filePath={output.filePath}
      structuredPatch={output.structuredPatch}
      verbose={verbose}
    />
  )
}

export function renderFileEditToolUseRejectedMessage(
  input: {
    file_path?: string
    old_string?: string
    new_string?: string
    replace_all?: boolean
  } = {},
  options: { columns: number; verbose: boolean } = {
    columns: 80,
    verbose: false,
  },
): React.ReactNode {
  try {
    const { file_path, old_string, new_string, replace_all } = input
    const { columns, verbose } = options

    if (!file_path) {
      return <FallbackToolUseRejectedMessage />
    }

    const fullFilePath = isAbsolute(file_path)
      ? file_path
      : resolve(getCwd(), file_path)

    let originalFile = ''
    let updatedFile = ''

    if (old_string === '') {
      originalFile = ''
      updatedFile = normalizeLineEndings(new_string ?? '')
    } else {
      const enc = detectFileEncoding(fullFilePath)
      const fileContent = readFileSync(fullFilePath, enc)
      originalFile = normalizeLineEndings(fileContent ?? '')

      const normalizedOldString = normalizeLineEndings(old_string ?? '')
      const normalizedNewString = normalizeLineEndings(new_string ?? '')
      const oldStringForReplace =
        normalizedNewString === '' &&
        !normalizedOldString.endsWith('\n') &&
        originalFile.includes(normalizedOldString + '\n')
          ? normalizedOldString + '\n'
          : normalizedOldString

      updatedFile = Boolean(replace_all)
        ? originalFile.split(oldStringForReplace).join(normalizedNewString)
        : originalFile.replace(oldStringForReplace, () => normalizedNewString)

      if (updatedFile === originalFile) {
        throw new Error(
          'Original and edited file match exactly. Failed to apply edit.',
        )
      }
    }

    const patch = getPatch({
      filePath: file_path,
      fileContents: originalFile,
      oldStr: originalFile,
      newStr: updatedFile,
    })

    return (
      <Box flexDirection="column">
        <Text>
          {'  '}⎿{' '}
          <Text color={getTheme().error}>
            User rejected {old_string === '' ? 'write' : 'update'} to{' '}
          </Text>
          <Text bold>{fullFilePath}</Text>
        </Text>
        {intersperse(
          patch.map(patch => (
            <Box flexDirection="column" paddingLeft={5} key={patch.newStart}>
              <StructuredDiff patch={patch} dim={true} width={columns - 12} />
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
