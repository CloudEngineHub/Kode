import * as React from 'react'
import BashToolResultMessage from '#tools/tools/system/BashTool/BashToolResultMessage'
import { extractTag } from '#core/utils/messages'

export function AssistantBashOutputMessage({
  content,
  verbose,
  maxHeight,
  maxWidth,
}: {
  content: string
  verbose?: boolean
  maxHeight?: number
  maxWidth?: number
}): React.ReactNode {
  const stdout = extractTag(content, 'bash-stdout') ?? ''
  const stderr = extractTag(content, 'bash-stderr') ?? ''
  const stdoutLines = stdout.split('\n').length
  const stderrLines = stderr.split('\n').length
  return (
    <BashToolResultMessage
      content={{ stdout, stdoutLines, stderr, stderrLines }}
      verbose={!!verbose}
      maxHeight={maxHeight}
      maxWidth={maxWidth}
    />
  )
}
