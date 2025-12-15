import { Select } from '@components/CustomSelect/select'
import chalk from 'chalk'
import { Box, Text } from 'ink'
import { basename, dirname, extname } from 'path'
import React, { useMemo } from 'react'
import {
  UnaryEvent,
  usePermissionRequestLogging,
} from '@hooks/usePermissionRequestLogging'
import { savePermission } from '@permissions'
import { env } from '@utils/env'
import { getTheme } from '@utils/theme'
import { logUnaryEvent } from '@utils/unaryLogging'
import {
  type ToolUseConfirm,
  toolUseConfirmGetPrefix,
} from '@components/permissions/PermissionRequest'
import {
  PermissionRequestTitle,
  textColorForRiskScore,
} from '@components/permissions/PermissionRequestTitle'
import { FileEditToolDiff } from './FileEditToolDiff'
import { useTerminalSize } from '@hooks/useTerminalSize'
import { pathInOriginalCwd } from '@utils/permissions/filesystem'

function getOptions(path: string) {
  const dirPath = dirname(path)
  const dirName = basename(dirPath) || 'this directory'
  const isInWorkingDir = pathInOriginalCwd(dirPath)
  const sessionLabel = isInWorkingDir
    ? `Yes, allow all edits during this session ${chalk.bold.hex(getTheme().warning)('(auto-accept edits)')}`
    : `Yes, allow all edits in ${chalk.bold(`${dirName}/`)} during this session ${chalk.bold.hex(getTheme().warning)('(auto-accept edits)')}`

  return [
    {
      label: 'Yes',
      value: 'yes',
    },
    {
      label: sessionLabel,
      value: 'yes-session',
    },
    {
      label: `No, and provide instructions (${chalk.bold.hex(getTheme().warning)('esc')})`,
      value: 'no',
    },
  ]
}

type Props = {
  toolUseConfirm: ToolUseConfirm
  onDone(): void
  verbose: boolean
}

export function FileEditPermissionRequest({
  toolUseConfirm,
  onDone,
  verbose,
}: Props): React.ReactNode {
  const { columns } = useTerminalSize()
  const { file_path, new_string, old_string } = toolUseConfirm.input as {
    file_path: string
    new_string: string
    old_string: string
  }

  const unaryEvent = useMemo<UnaryEvent>(
    () => ({
      completion_type: 'str_replace_single',
      language_name: extractLanguageName(file_path),
    }),
    [file_path],
  )

  usePermissionRequestLogging(toolUseConfirm, unaryEvent)

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={textColorForRiskScore(toolUseConfirm.riskScore)}
      marginTop={1}
      paddingLeft={1}
      paddingRight={1}
      paddingBottom={1}
    >
      <PermissionRequestTitle
        title="Edit file"
        riskScore={toolUseConfirm.riskScore}
      />
      <FileEditToolDiff
        file_path={file_path}
        new_string={new_string}
        old_string={old_string}
        verbose={verbose}
        width={columns - 12}
      />
      <Box flexDirection="column">
        <Text>
          Do you want to make this edit to{' '}
          <Text bold>{basename(file_path)}</Text>?
        </Text>
        <Select
          options={getOptions(file_path)}
          onChange={newValue => {
            switch (newValue) {
              case 'yes':
                extractLanguageName(file_path).then(language => {
                  logUnaryEvent({
                    completion_type: 'str_replace_single',
                    event: 'accept',
                    metadata: {
                      language_name: language,
                      message_id: toolUseConfirm.assistantMessage.message.id,
                      platform: env.platform,
                    },
                  })
                })
                // Note: We call onDone before onAllow to hide the
                // permission request before we render the next message
                onDone()
                toolUseConfirm.onAllow('temporary')
                break
              case 'yes-session':
                extractLanguageName(file_path).then(language => {
                  logUnaryEvent({
                    completion_type: 'str_replace_single',
                    event: 'accept',
                    metadata: {
                      language_name: language,
                      message_id: toolUseConfirm.assistantMessage.message.id,
                      platform: env.platform,
                    },
                  })
                })
                savePermission(
                  toolUseConfirm.tool,
                  toolUseConfirm.input,
                  toolUseConfirmGetPrefix(toolUseConfirm),
                ).then(() => {
                  // Note: We call onDone before onAllow to hide the
                  // permission request before we render the next message
                  onDone()
                  toolUseConfirm.onAllow('permanent')
                })
                break
              case 'no':
                extractLanguageName(file_path).then(language => {
                  logUnaryEvent({
                    completion_type: 'str_replace_single',
                    event: 'reject',
                    metadata: {
                      language_name: language,
                      message_id: toolUseConfirm.assistantMessage.message.id,
                      platform: env.platform,
                    },
                  })
                })
                // Note: We call onDone before onAllow to hide the
                // permission request before we render the next message
                onDone()
                toolUseConfirm.onReject()
                break
            }
          }}
        />
      </Box>
    </Box>
  )
}

async function extractLanguageName(file_path: string): Promise<string> {
  const ext = extname(file_path)
  if (!ext) {
    return 'unknown'
  }
  const Highlight = (await import('highlight.js')) as unknown as {
    default: { getLanguage(ext: string): { name: string | undefined } }
  }
  return Highlight.default.getLanguage(ext.slice(1))?.name ?? 'unknown'
}
