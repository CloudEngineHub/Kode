import { statSync } from 'fs'
import * as path from 'node:path'
import { normalizeFilePath, readTextContent } from '#core/utils/file'
import { emitReminderEvent } from '#core/services/systemReminder'
import {
  generateFileModificationReminder,
  recordFileRead,
} from '#core/services/fileFreshness'
import { secureFileService } from '#core/utils/secureFile'
import { readFileBun } from '#runtime/file'
import { readImage } from './image'
import {
  IMAGE_EXTENSIONS,
  MAX_LINE_LENGTH,
  MAX_OUTPUT_SIZE,
  formatFileSizeError,
} from './constants'
import type { FileReadToolData } from './types'
import { renderResultForAssistant } from './renderResultForAssistant'
import { createAssistantMessage } from '#core/utils/messages'
import { sha256File } from '#core/utils/sha256'

export async function* callFileReadTool(
  args: { file_path: string; offset?: number; limit?: number },
  ctx: {
    readFileTimestamps: Record<string, number>
    readFileHashes?: Record<string, string>
  },
): AsyncGenerator<
  {
    type: 'result'
    data: FileReadToolData
    resultForAssistant: string | any[]
    newMessages?: unknown[]
  },
  void,
  void
> {
  const { file_path, offset = 1, limit } = args
  const ext = path.extname(file_path).toLowerCase()
  const fullFilePath = normalizeFilePath(file_path)

  recordFileRead(fullFilePath)

  emitReminderEvent('file:read', {
    filePath: fullFilePath,
    extension: ext,
    timestamp: Date.now(),
  })

  ctx.readFileTimestamps[fullFilePath] = statSync(fullFilePath).mtimeMs

  const modificationReminder = generateFileModificationReminder(fullFilePath)
  if (modificationReminder) {
    emitReminderEvent('file:modified', {
      filePath: fullFilePath,
      reminder: modificationReminder,
      timestamp: Date.now(),
    })
  }

  if (IMAGE_EXTENSIONS.has(ext)) {
    const data = await readImage(fullFilePath, ext)
    const dimensions = data.file.dimensions
    let dimensionNote: string | null = null
    if (
      dimensions?.originalWidth &&
      dimensions?.originalHeight &&
      dimensions?.displayWidth &&
      dimensions?.displayHeight &&
      dimensions.displayWidth > 0 &&
      dimensions.displayHeight > 0
    ) {
      if (
        dimensions.originalWidth !== dimensions.displayWidth ||
        dimensions.originalHeight !== dimensions.displayHeight
      ) {
        const scale = dimensions.originalWidth / dimensions.displayWidth
        dimensionNote = `[Image: original ${dimensions.originalWidth}x${dimensions.originalHeight}, displayed at ${dimensions.displayWidth}x${dimensions.displayHeight}. Multiply coordinates by ${scale.toFixed(2)} to map to original image.]`
      }
    }

    yield {
      type: 'result',
      data,
      resultForAssistant: renderResultForAssistant(data),
      ...(dimensionNote
        ? { newMessages: [createAssistantMessage(dimensionNote)] }
        : {}),
    }
    return
  }

  if (ext === '.ipynb') {
    const notebookRaw = await readFileBun(fullFilePath)
    const notebook = notebookRaw ? JSON.parse(notebookRaw) : null
    const data: FileReadToolData = {
      type: 'notebook',
      file: {
        filePath: file_path,
        cells: Array.isArray(notebook?.cells) ? notebook.cells : [],
      },
    }
    yield {
      type: 'result',
      data,
      resultForAssistant: renderResultForAssistant(data),
    }
    return
  }

  if (ext === '.pdf') {
    const fileReadResult = secureFileService.safeReadFile(fullFilePath, {
      encoding: 'buffer' as BufferEncoding,
      maxFileSize: 32 * 1024 * 1024,
      checkFileExtension: false,
    })
    if (!fileReadResult.success) {
      throw new Error(fileReadResult.error || 'Failed to read PDF file')
    }
    const buffer = fileReadResult.content as Buffer
    const data: FileReadToolData = {
      type: 'pdf',
      file: {
        filePath: file_path,
        base64: buffer.toString('base64'),
        originalSize: fileReadResult.stats?.size ?? buffer.byteLength,
      },
    }
    yield {
      type: 'result',
      data,
      resultForAssistant: renderResultForAssistant(data),
    }
    return
  }

  const startLine = offset
  const zeroBasedOffset = startLine === 0 ? 0 : startLine - 1
  const { content, lineCount, totalLines } = readTextContent(
    fullFilePath,
    zeroBasedOffset,
    limit,
  )

  const truncatedLines = content
    .split(/\r?\n/)
    .map(line =>
      line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH) : line,
    )
    .join('\n')

  if (Buffer.byteLength(truncatedLines, 'utf8') > MAX_OUTPUT_SIZE) {
    throw new Error(
      formatFileSizeError(Buffer.byteLength(truncatedLines, 'utf8')),
    )
  }

  const data: FileReadToolData = {
    type: 'text',
    file: {
      filePath: file_path,
      content: truncatedLines,
      numLines: lineCount,
      startLine,
      totalLines,
    },
  }

  try {
    ;(ctx.readFileHashes ??= {})[fullFilePath] = await sha256File(fullFilePath)
  } catch {
    // Hashing is best-effort; freshness guards will fall back to mtime-only behavior.
  }

  yield {
    type: 'result',
    data,
    resultForAssistant: renderResultForAssistant(data),
  }
}
