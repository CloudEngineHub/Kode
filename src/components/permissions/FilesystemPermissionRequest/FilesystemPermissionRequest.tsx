import { Box, Text } from 'ink'
import React, { useMemo } from 'react'
import { Select } from '@components/CustomSelect/select'
import { getTheme } from '@utils/theme'
import {
  PermissionRequestTitle,
  textColorForRiskScore,
} from '@components/permissions/PermissionRequestTitle'
import { logUnaryEvent } from '@utils/unaryLogging'
import { env } from '@utils/env'
import {
  type PermissionRequestProps,
  type ToolUseConfirm,
} from '@components/permissions/PermissionRequest'
import chalk from 'chalk'
import {
  UnaryEvent,
  usePermissionRequestLogging,
} from '@hooks/usePermissionRequestLogging'
import { FileEditTool } from '@tools/FileEditTool/FileEditTool'
import { FileWriteTool } from '@tools/FileWriteTool/FileWriteTool'
import { GrepTool } from '@tools/GrepTool/GrepTool'
import { GlobTool } from '@tools/GlobTool/GlobTool'
import { FileReadTool } from '@tools/FileReadTool/FileReadTool'
import { NotebookEditTool } from '@tools/NotebookEditTool/NotebookEditTool'
import { FallbackPermissionRequest } from '@components/permissions/FallbackPermissionRequest'
import {
  grantReadPermissionForPath,
  grantWritePermissionForPath,
  pathInOriginalCwd,
  toAbsolutePath,
} from '@utils/permissions/filesystem'
import { getCwd } from '@utils/state'
import { basename, dirname } from 'path'
import { statSync } from 'fs'

function pathArgNameForToolUse(toolUseConfirm: ToolUseConfirm): string | null {
  switch (toolUseConfirm.tool) {
    case FileWriteTool:
    case FileEditTool:
    case FileReadTool: {
      return 'file_path'
    }
    case GlobTool:
    case GrepTool: {
      return 'path'
    }
    case NotebookEditTool:
    {
      return 'notebook_path'
    }
  }
  return null
}

function isMultiFile(toolUseConfirm: ToolUseConfirm): boolean {
  switch (toolUseConfirm.tool) {
    case GlobTool:
    case GrepTool: {
      return true
    }
  }
  return false
}

function pathToPermissionDirectory(path: string): string {
  try {
    const stats = statSync(path)
    if (stats.isDirectory()) return path
  } catch {
    // Treat missing/unstatable path as a file path.
  }
  return dirname(path)
}

function pathFromToolUse(toolUseConfirm: ToolUseConfirm): string | null {
  const pathArgName = pathArgNameForToolUse(toolUseConfirm)
  const input = toolUseConfirm.input
  if (pathArgName && pathArgName in input) {
    if (typeof input[pathArgName] === 'string') {
      return toAbsolutePath(input[pathArgName])
    } else {
      return toAbsolutePath(getCwd())
    }
  }
  return null
}

export function FilesystemPermissionRequest({
  toolUseConfirm,
  onDone,
  verbose,
}: PermissionRequestProps): React.ReactNode {
  const path = pathFromToolUse(toolUseConfirm)
  if (!path) {
    // Fall back to generic permission request if no path is found
    return (
      <FallbackPermissionRequest
        toolUseConfirm={toolUseConfirm}
        onDone={onDone}
        verbose={verbose}
      />
    )
  }
  return (
    <FilesystemPermissionRequestImpl
      toolUseConfirm={toolUseConfirm}
      path={path}
      onDone={onDone}
      verbose={verbose}
    />
  )
}

function getDontAskAgainOptions(toolUseConfirm: ToolUseConfirm, path: string) {
  const permissionDirPath = pathToPermissionDirectory(path)
  const permissionDirName = basename(permissionDirPath) || 'this directory'
  const isInWorkingDir = pathInOriginalCwd(permissionDirPath)

  if (toolUseConfirm.tool.isReadOnly()) {
    const label = isInWorkingDir
      ? 'Yes, during this session'
      : `Yes, allow reading from ${chalk.bold(`${permissionDirName}/`)} during this session`
    return [{ label, value: 'yes-session' }]
  }

  // For write/edit tools, offer a session-scoped allow.
  const label = isInWorkingDir
    ? `Yes, allow all edits during this session ${chalk.bold.hex(getTheme().warning)('(auto-accept edits)')}`
    : `Yes, allow all edits in ${chalk.bold(`${permissionDirName}/`)} during this session ${chalk.bold.hex(getTheme().warning)('(auto-accept edits)')}`
  return [{ label, value: 'yes-session' }]
}

type Props = {
  toolUseConfirm: ToolUseConfirm
  path: string
  onDone(): void
  verbose: boolean
}

function FilesystemPermissionRequestImpl({
  toolUseConfirm,
  path,
  onDone,
  verbose,
}: Props): React.ReactNode {
  const userFacingName = toolUseConfirm.tool.userFacingName()

  const userFacingReadOrWrite = toolUseConfirm.tool.isReadOnly()
    ? 'Read'
    : 'Edit'
  const title = `${userFacingReadOrWrite} ${isMultiFile(toolUseConfirm) ? 'files' : 'file'}`

  const unaryEvent = useMemo<UnaryEvent>(
    () => ({
      completion_type: 'tool_use_single',
      language_name: 'none',
    }),
    [],
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
        title={title}
        riskScore={toolUseConfirm.riskScore}
      />
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text>
          {userFacingName}(
          {toolUseConfirm.tool.renderToolUseMessage(
            toolUseConfirm.input as never,
            { verbose },
          )}
          )
        </Text>
      </Box>

      <Box flexDirection="column">
        <Text>Do you want to proceed?</Text>
        <Select
          options={[
            {
              label: 'Yes',
              value: 'yes',
            },
            ...getDontAskAgainOptions(toolUseConfirm, path),
            {
              label: `No, and provide instructions (${chalk.bold.hex(getTheme().warning)('esc')})`,
              value: 'no',
            },
          ]}
          onChange={newValue => {
            switch (newValue) {
              case 'yes':
                logUnaryEvent({
                  completion_type: 'tool_use_single',
                  event: 'accept',
                  metadata: {
                    language_name: 'none',
                    message_id: toolUseConfirm.assistantMessage.message.id,
                    platform: env.platform,
                  },
                })
                toolUseConfirm.onAllow('temporary')
                onDone()
                break
              case 'yes-session':
                logUnaryEvent({
                  completion_type: 'tool_use_single',
                  event: 'accept',
                  metadata: {
                    language_name: 'none',
                    message_id: toolUseConfirm.assistantMessage.message.id,
                    platform: env.platform,
                  },
                })
                if (toolUseConfirm.tool.isReadOnly()) {
                  grantReadPermissionForPath(path)
                } else {
                  grantWritePermissionForPath(path)
                }
                toolUseConfirm.onAllow('permanent')
                onDone()
                break
              case 'no':
                logUnaryEvent({
                  completion_type: 'tool_use_single',
                  event: 'reject',
                  metadata: {
                    language_name: 'none',
                    message_id: toolUseConfirm.assistantMessage.message.id,
                    platform: env.platform,
                  },
                })
                toolUseConfirm.onReject()
                onDone()
                break
            }
          }}
        />
      </Box>
    </Box>
  )
}
