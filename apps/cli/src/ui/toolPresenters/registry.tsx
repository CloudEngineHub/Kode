import * as React from 'react'
import { Text } from 'ink'

import type { Tool } from '#core/tooling/Tool'
import { FallbackToolUseRejectedMessage } from '#ui-ink/components/FallbackToolUseRejectedMessage'

import { renderGlobToolResultMessage } from './GlobToolPresenter'
import { renderTaskStopToolResultMessage } from './TaskStopToolPresenter'
import { renderTaskOutputToolResultMessage } from './TaskOutputToolPresenter'
import {
  renderFileEditToolResultMessage,
  renderFileEditToolUseRejectedMessage,
} from './FileEditToolPresenter'
import {
  renderFileWriteToolResultMessage,
  renderFileWriteToolUseRejectedMessage,
} from './FileWriteToolPresenter'

type ResultOptions = { verbose: boolean }
type RejectOptions = {
  columns: number
  verbose: boolean
  conversationKey: string
}

type InkToolPresenter = {
  renderToolResultMessage?: (
    output: unknown,
    options: ResultOptions,
  ) => React.ReactNode
  renderToolUseRejectedMessage?: (
    input: unknown,
    options: RejectOptions,
  ) => React.ReactNode
}

const inkPresentersByToolName: Record<string, InkToolPresenter> = {
  Glob: {
    renderToolResultMessage: output =>
      renderGlobToolResultMessage(
        output as Parameters<typeof renderGlobToolResultMessage>[0],
      ),
  },
  TaskStop: {
    renderToolResultMessage: output =>
      renderTaskStopToolResultMessage(
        output as Parameters<typeof renderTaskStopToolResultMessage>[0],
      ),
  },
  TaskOutput: {
    renderToolResultMessage: (output, options) =>
      renderTaskOutputToolResultMessage(
        output as Parameters<typeof renderTaskOutputToolResultMessage>[0],
        options,
      ),
  },
  Edit: {
    renderToolResultMessage: (output, options) =>
      renderFileEditToolResultMessage(
        output as Parameters<typeof renderFileEditToolResultMessage>[0],
        options,
      ),
    renderToolUseRejectedMessage: (input, options) =>
      renderFileEditToolUseRejectedMessage(
        input as Parameters<typeof renderFileEditToolUseRejectedMessage>[0],
        options,
      ),
  },
  Write: {
    renderToolResultMessage: (output, options) =>
      renderFileWriteToolResultMessage(
        output as Parameters<typeof renderFileWriteToolResultMessage>[0],
        options,
      ),
    renderToolUseRejectedMessage: (input, options) =>
      renderFileWriteToolUseRejectedMessage(
        input as Parameters<typeof renderFileWriteToolUseRejectedMessage>[0],
        options,
      ),
  },
}

function normalizeInkToolRenderOutput(node: React.ReactNode): React.ReactNode {
  if (typeof node === 'string' || typeof node === 'number') {
    return <Text>{node}</Text>
  }

  if (Array.isArray(node)) {
    return node.map((child, index) =>
      typeof child === 'string' || typeof child === 'number' ? (
        <Text key={`text-${index}`}>{child}</Text>
      ) : (
        child
      ),
    )
  }

  return node
}

export function renderInkToolResultMessage(
  tool: Tool,
  output: unknown,
  options: ResultOptions,
): React.ReactNode {
  const presenter = inkPresentersByToolName[tool.name]
  if (presenter?.renderToolResultMessage) {
    return normalizeInkToolRenderOutput(
      presenter.renderToolResultMessage(output, options),
    )
  }
  return normalizeInkToolRenderOutput(
    tool.renderToolResultMessage?.(output, options) ?? null,
  )
}

export function renderInkToolUseRejectedMessage(
  tool: Tool,
  input: unknown,
  options: RejectOptions,
): React.ReactNode {
  const presenter = inkPresentersByToolName[tool.name]
  if (presenter?.renderToolUseRejectedMessage) {
    const node = presenter.renderToolUseRejectedMessage(input, options)
    return normalizeInkToolRenderOutput(
      node ?? <FallbackToolUseRejectedMessage />,
    )
  }

  if (typeof tool.renderToolUseRejectedMessage === 'function') {
    const node = tool.renderToolUseRejectedMessage(input, options)
    return normalizeInkToolRenderOutput(
      node ?? <FallbackToolUseRejectedMessage />,
    )
  }

  return <FallbackToolUseRejectedMessage />
}
