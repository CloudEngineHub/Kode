import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

import type * as Protocol from '../protocol'
import { asJsonObject, toolKindForName } from './content'
import { isRecord } from './guards'
import type { SessionState } from './types'

const MAX_DIFF_FILE_BYTES = 512_000
const MAX_DIFF_TEXT_CHARS = 400_000

function readTextFileForDiff(filePath: string): string | null {
  try {
    const stats = statSync(filePath)
    if (!stats.isFile()) return null
    if (stats.size > MAX_DIFF_FILE_BYTES) return null
    return readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

function truncateDiffText(text: string): string {
  if (text.length <= MAX_DIFF_TEXT_CHARS) return text
  return `${text.slice(0, MAX_DIFF_TEXT_CHARS)}\n\n[truncated ${text.length - MAX_DIFF_TEXT_CHARS} chars]`
}

export function captureFileSnapshotForTool(params: {
  session: SessionState
  toolUseId: string
  toolName: string
  input: unknown
}): void {
  const { session, toolUseId, toolName, input } = params

  if (toolName !== 'Write' && toolName !== 'MultiEdit') return

  const filePath =
    isRecord(input) && typeof input.file_path === 'string'
      ? input.file_path
      : ''
  if (!filePath) return

  const absPath = isAbsolute(filePath)
    ? filePath
    : resolve(session.cwd, filePath)

  const oldContent = existsSync(absPath) ? readTextFileForDiff(absPath) : ''
  if (oldContent === null) return

  const existing = session.toolCalls.get(toolUseId)
  if (existing) {
    existing.fileSnapshot = { path: absPath, content: oldContent }
    session.toolCalls.set(toolUseId, existing)
    return
  }

  session.toolCalls.set(toolUseId, {
    title: toolName,
    kind: toolKindForName(toolName),
    status: 'pending',
    rawInput: asJsonObject(input),
    fileSnapshot: { path: absPath, content: oldContent },
  })
}

function getJsonStringMaybe(
  obj: Protocol.JsonObject | undefined,
  key: string,
): string | undefined {
  const value = obj?.[key]
  return typeof value === 'string' ? value : undefined
}

export function buildDiffContentForToolResult(params: {
  session: SessionState
  toolUseId: string
  rawOutput: Protocol.JsonObject | undefined
}): Protocol.ToolCallContent | null {
  const { session, toolUseId, rawOutput } = params

  const existing = session.toolCalls.get(toolUseId)
  if (!existing || existing.kind !== 'edit') return null

  const inputFilePath =
    typeof existing.rawInput?.file_path === 'string'
      ? existing.rawInput.file_path
      : (getJsonStringMaybe(rawOutput, 'filePath') ?? '')

  if (!inputFilePath) return null

  const absPath = isAbsolute(inputFilePath)
    ? inputFilePath
    : resolve(session.cwd, inputFilePath)

  const oldText =
    getJsonStringMaybe(rawOutput, 'originalFile') ??
    (existing.fileSnapshot && existing.fileSnapshot.path === absPath
      ? existing.fileSnapshot.content
      : undefined)
  if (oldText === undefined) return null

  const newTextFromDisk = readTextFileForDiff(absPath)
  const newTextFromOutput = getJsonStringMaybe(rawOutput, 'content')
  const newText = newTextFromDisk ?? newTextFromOutput
  if (newText === null || newText === undefined) return null

  return {
    type: 'diff',
    path: absPath,
    oldText: truncateDiffText(oldText),
    newText: truncateDiffText(newText),
  }
}
