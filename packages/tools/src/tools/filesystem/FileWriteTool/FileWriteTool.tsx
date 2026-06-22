import type { StructuredPatchHunk } from 'diff'
import { mkdirSync, statSync } from 'fs'
import { dirname, isAbsolute, relative, resolve } from 'path'
import { z } from 'zod'
import type { Tool } from '#core/tooling/Tool'
import {
  addLineNumbers,
  detectFileEncoding,
  detectLineEndings,
  detectRepoLineEndings,
  writeTextContent,
} from '#core/utils/file'
import { readFileBun, fileExistsBun } from '#runtime/file'
import { getCwd } from '#core/utils/state'
import { PROMPT } from './prompt'
import { hasWritePermission } from '#core/utils/permissions/filesystem'
import { getPatch } from '#core/utils/diff'
import { emitReminderEvent } from '#core/services/systemReminder'
import { recordFileEdit } from '#core/services/fileFreshness'
import { sha256File } from '#core/utils/sha256'

const MAX_LINES_TO_RENDER_FOR_ASSISTANT = 16000
const TRUNCATED_MESSAGE =
  '<response clipped><NOTE>To save on context only part of this file has been shown to you. You should retry this tool after you have searched inside the file with Grep in order to find the line numbers of what you are looking for.</NOTE>'

const inputSchema = z.strictObject({
  file_path: z
    .string()
    .describe(
      'The absolute path to the file to write (must be absolute, not relative)',
    ),
  content: z.string().describe('The content to write to the file'),
})

export const FileWriteTool = {
  name: 'Write',
  async description() {
    return 'Write a file to the local filesystem.'
  },
  userFacingName: () => 'Write',
  async prompt() {
    return PROMPT
  },
  inputSchema,
  async isEnabled() {
    return true
  },
  isReadOnly() {
    return false
  },
  isConcurrencySafe() {
    return false // FileWriteTool modifies state/files, not safe for concurrent execution
  },
  needsPermissions({ file_path }) {
    return !hasWritePermission(file_path)
  },
  renderToolUseMessage(input, { verbose }) {
    const fullPath = isAbsolute(input.file_path)
      ? input.file_path
      : resolve(getCwd(), input.file_path)
    return `file_path: ${fullPath}`
  },
  async validateInput({ file_path }, { readFileTimestamps, readFileHashes }) {
    const fullFilePath = isAbsolute(file_path)
      ? file_path
      : resolve(getCwd(), file_path)

    if (fullFilePath.endsWith('.ipynb')) {
      return {
        result: false,
        message:
          'This tool cannot write Jupyter notebooks. Use the NotebookEdit tool instead.',
      }
    }
    if (!fileExistsBun(fullFilePath)) {
      return { result: true }
    }

    const readTimestamp = readFileTimestamps[fullFilePath]
    if (!readTimestamp) {
      return {
        result: false,
        message:
          'File has not been read yet. Read it first before writing to it.',
      }
    }

    // Check if file exists and get its last modified time
    const stats = statSync(fullFilePath)
    const lastWriteTime = stats.mtimeMs
    if (lastWriteTime > readTimestamp) {
      const lastReadHash = readFileHashes?.[fullFilePath]
      if (!lastReadHash) {
        return {
          result: false,
          message:
            'File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.',
        }
      }

      let currentHash: string
      try {
        currentHash = await sha256File(fullFilePath)
      } catch {
        return {
          result: false,
          message:
            'File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.',
        }
      }
      if (currentHash !== lastReadHash) {
        return {
          result: false,
          message:
            'File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.',
        }
      }

      // The file was touched (mtime changed) without content changes. Treat as fresh.
      readFileTimestamps[fullFilePath] = lastWriteTime
    }

    return { result: true }
  },
  async *call({ file_path, content }, { readFileTimestamps, readFileHashes }) {
    const fullFilePath = isAbsolute(file_path)
      ? file_path
      : resolve(getCwd(), file_path)
    const dir = dirname(fullFilePath)
    const oldFileExists = fileExistsBun(fullFilePath)

    if (oldFileExists) {
      const readTimestamp = readFileTimestamps[fullFilePath]
      const lastWriteTime = statSync(fullFilePath).mtimeMs
      if (!readTimestamp) {
        throw new Error(
          'File has been unexpectedly modified. Read it again before attempting to write it.',
        )
      }
      if (lastWriteTime > readTimestamp) {
        const lastReadHash = readFileHashes?.[fullFilePath]
        if (lastReadHash) {
          let currentHash: string
          try {
            currentHash = await sha256File(fullFilePath)
          } catch {
            throw new Error(
              'File has been unexpectedly modified. Read it again before attempting to write it.',
            )
          }
          if (currentHash === lastReadHash) {
            readFileTimestamps[fullFilePath] = lastWriteTime
          } else {
            throw new Error(
              'File has been unexpectedly modified. Read it again before attempting to write it.',
            )
          }
        } else {
          throw new Error(
            'File has been unexpectedly modified. Read it again before attempting to write it.',
          )
        }
      }
    }

    const enc = oldFileExists ? detectFileEncoding(fullFilePath) : 'utf-8'
    const oldContent = oldFileExists ? await readFileBun(fullFilePath) : null

    const endings = oldFileExists
      ? detectLineEndings(fullFilePath)
      : await detectRepoLineEndings(getCwd())

    mkdirSync(dir, { recursive: true })
    writeTextContent(fullFilePath, content, enc, endings!)

    // Record Agent edit operation for file freshness tracking
    recordFileEdit(fullFilePath, content)

    // Update read timestamp, to invalidate stale writes
    readFileTimestamps[fullFilePath] = statSync(fullFilePath).mtimeMs

    if (readFileHashes) {
      try {
        readFileHashes[fullFilePath] = await sha256File(fullFilePath)
      } catch {
        // ignore
      }
    }

    // Emit file edited event for system reminders
    emitReminderEvent('file:edited', {
      filePath: fullFilePath,
      content,
      oldContent: oldContent || '',
      timestamp: Date.now(),
      operation: oldFileExists ? 'update' : 'create',
    })

    if (oldContent) {
      const patch = getPatch({
        filePath: file_path,
        fileContents: oldContent,
        oldStr: oldContent,
        newStr: content,
      })

      const data = {
        type: 'update' as const,
        filePath: file_path,
        content,
        structuredPatch: patch,
        originalFile: oldContent,
      }
      yield {
        type: 'result',
        data,
        resultForAssistant: this.renderResultForAssistant(data),
      }
      return
    }

    const data = {
      type: 'create' as const,
      filePath: file_path,
      content,
      structuredPatch: [],
      originalFile: null,
    }
    yield {
      type: 'result',
      data,
      resultForAssistant: this.renderResultForAssistant(data),
    }
  },
  renderResultForAssistant({ filePath, content, type }) {
    switch (type) {
      case 'create':
        return `File created successfully at: ${filePath}`
      case 'update':
        return `The file ${filePath} has been updated. Here's the result of running \`cat -n\` on a snippet of the edited file:
${addLineNumbers({
  content:
    content.split(/\r?\n/).length > MAX_LINES_TO_RENDER_FOR_ASSISTANT
      ? content
          .split(/\r?\n/)
          .slice(0, MAX_LINES_TO_RENDER_FOR_ASSISTANT)
          .join('\n') + TRUNCATED_MESSAGE
      : content,
  startLine: 1,
})}`
    }
  },
} satisfies Tool<
  typeof inputSchema,
  {
    type: 'create' | 'update'
    filePath: string
    content: string
    structuredPatch: StructuredPatchHunk[]
    originalFile: string | null
  }
>
