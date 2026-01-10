import { Box, Text } from 'ink'
import React, { useMemo } from 'react'
import chalk from 'chalk'
import { Select } from '#ui-ink/components/CustomSelect/select'
import { savePermission } from '#core/permissions'
import { getTheme } from '#core/utils/theme'
import { type PermissionRequestProps } from '#ui-ink/components/permissions/PermissionRequest'
import {
  UnaryEvent,
  usePermissionRequestLogging,
} from '#ui-ink/hooks/usePermissionRequestLogging'
import { PermissionRequestTitle } from '#ui-ink/components/permissions/PermissionRequestTitle'
import { logUnaryEvent } from '#core/utils/unaryLogging'
import { env } from '#core/utils/env'
import { useKeypress } from '#ui-ink/hooks/useKeypress'

function hostnameForUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

export function WebFetchPermissionRequest({
  toolUseConfirm,
  onDone,
  verbose,
}: PermissionRequestProps): React.ReactNode {
  const theme = getTheme()
  const unaryEvent = useMemo<UnaryEvent>(
    () => ({ completion_type: 'tool_use_single', language_name: 'none' }),
    [],
  )

  usePermissionRequestLogging(toolUseConfirm, unaryEvent)

  const hostname = hostnameForUrl(toolUseConfirm.input.url)
  const hostLabel =
    hostname ??
    (typeof toolUseConfirm.input.url === 'string'
      ? toolUseConfirm.input.url
      : 'unknown')

  const reject = () => {
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
  }

  useKeypress((_input, key) => {
    if (key.escape) {
      reject()
    }
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.permission}
      marginTop={1}
      paddingLeft={1}
      paddingRight={1}
      paddingBottom={1}
    >
      <PermissionRequestTitle
        title="Network request outside of sandbox"
        riskScore={null}
      />
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box>
          <Text dimColor>Host:</Text>
          <Text> {hostLabel}</Text>
        </Box>
        <Box marginTop={1}>
          <Text>Do you want to allow this connection?</Text>
        </Box>
        <Box marginTop={1}>
          <Select
            options={[
              { label: 'Yes', value: 'yes' },
              ...(hostname
                ? [
                    {
                      label: `Yes, and don't ask again for ${chalk.bold(hostname)}`,
                      value: 'yes-dont-ask-again',
                    },
                  ]
                : []),
              {
                label: `No, and tell Kode Agent what to do differently ${chalk.bold('(esc)')}`,
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
                case 'yes-dont-ask-again':
                  logUnaryEvent({
                    completion_type: 'tool_use_single',
                    event: 'accept',
                    metadata: {
                      language_name: 'none',
                      message_id: toolUseConfirm.assistantMessage.message.id,
                      platform: env.platform,
                    },
                  })
                  savePermission(
                    toolUseConfirm.tool,
                    toolUseConfirm.input,
                    null,
                    toolUseConfirm.toolUseContext,
                  ).then(() => {
                    toolUseConfirm.onAllow('permanent')
                    onDone()
                  })
                  break
                case 'no':
                  reject()
                  break
              }
            }}
          />
        </Box>
      </Box>
    </Box>
  )
}
