import React from 'react'
import type { ImageBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { Box, Text } from 'ink'
import { getTheme } from '#core/utils/theme'

type Props = {
  addMargin: boolean
  param: ImageBlockParam
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }
  const rounded = unitIndex === 0 ? String(Math.round(value)) : value.toFixed(1)
  return `${rounded} ${units[unitIndex]}`
}

export function UserImageMessage({ addMargin, param }: Props): React.ReactNode {
  const theme = getTheme()
  const source = param.source
  const base64Source =
    source &&
    typeof source === 'object' &&
    'type' in source &&
    source.type === 'base64'
      ? source
      : null
  const mediaType = base64Source?.media_type

  const approxBytes = base64Source
    ? Math.floor((base64Source.data.length * 3) / 4)
    : 0

  const sizeLabel = formatBytes(approxBytes)
  const details = [mediaType, sizeLabel].filter(Boolean).join(' · ')

  return (
    <Box flexDirection="row" marginTop={addMargin ? 1 : 0} width="100%">
      <Box minWidth={2} width={2}>
        <Text color={theme.secondaryText}>&gt;</Text>
      </Box>
      <Text color={theme.secondaryText}>
        [Image]{details ? ` ${details}` : ''}
      </Text>
    </Box>
  )
}
