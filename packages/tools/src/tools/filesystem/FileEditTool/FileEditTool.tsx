import { Hunk } from 'diff'
import { mkdirSync, readFileSync, statSync } from 'fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'path'
import { z } from 'zod'
import { Tool, ValidationResult } from '#core/tooling/Tool'
import {
  addLineNumbers,
  detectFileEncoding,
  detectLineEndings,
  findSimilarFile,
  writeTextContent,
} from '#core/utils/file'
import { readFileBun, fileExistsBun } from '#runtime/file'
import { getCwd } from '#core/utils/state'
import { emitReminderEvent } from '#core/services/systemReminder'
import { recordFileEdit } from '#core/services/fileFreshness'
import { NotebookEditTool } from '#tools/tools/filesystem/NotebookEditTool/NotebookEditTool'
import { DESCRIPTION } from './prompt'
import { applyEdit } from './utils'
import { hasWritePermission } from '#core/utils/permissions/filesystem'
import { PROJECT_FILE } from '#core/constants/product'
import { normalizeLineEndings } from '#core/utils/paste'
import { sha256File } from '#core/utils/sha256'

const inputSchema = z.strictObject({
  file_path: z.string().describe('The absolute path to the file to modify'),
  old_string: z.string().describe('The text to replace'),
  new_string: z.string().describe('The text to replace it with'),
  replace_all: z
    .boolean()
    .optional()
    .describe('Replace all occurences of old_string (default false)'),
})

export type In = typeof inputSchema

// Number of lines of context to include before/after the change in our result message
const N_LINES_SNIPPET = 4

export const FileEditTool = {
  name: 'Edit',
  async description() {
    return 'A tool for editing files'
  },
  async prompt() {
    return DESCRIPTION
  },
  inputSchema,
  userFacingName() {
    return 'Edit'
  },
  async isEnabled() {
    return true
  },
  isReadOnly() {
    return false
  },
  isConcurrencySafe() {
    return false // FileEdit modifies files, not safe for concurrent execution
  },
  needsPermissions({ file_path }) {
    return !hasWritePermission(file_path)
  },
  renderToolUseMessage(input, { verbose }) {
    return `file_path: ${verbose ? input.file_path : relative(getCwd(), input.file_path)}`
  },
  async validateInput(
    { file_path, old_string, new_string, replace_all },
    { readFileTimestamps, readFileHashes },
  ) {
    if (old_string === new_string) {
      return {
        result: false,
        message:
          'No changes to make: old_string and new_string are exactly the same.',
        meta: {
          old_string,
        },
      } as ValidationResult
    }

    const fullFilePath = isAbsolute(file_path)
      ? file_path
      : resolve(getCwd(), file_path)

    if (old_string === '') {
      if (!fileExistsBun(fullFilePath)) return { result: true }
      const existingContent = await readFileBun(fullFilePath)
      if (normalizeLineEndings(existingContent ?? '').trim() !== '') {
        return {
          result: false,
          message: 'Cannot create new file - file already exists.',
        }
      }
      return { result: true }
    }

    if (!fileExistsBun(fullFilePath)) {
      // Try to find a similar file with a different extension
      const similarFilename = findSimilarFile(fullFilePath)
      let message = 'File does not exist.'

      // If we found a similar file, suggest it to the assistant
      if (similarFilename) {
        message += ` Did you mean ${similarFilename}?`
      }

      return {
        result: false,
        message,
      }
    }

    if (fullFilePath.endsWith('.ipynb')) {
      return {
        result: false,
        message: `File is a Jupyter Notebook. Use the ${NotebookEditTool.name} to edit this file.`,
      }
    }

    const readTimestamp = readFileTimestamps[fullFilePath]
    if (!readTimestamp) {
      return {
        result: false,
        message:
          'File has not been read yet. Read it first before writing to it.',
        meta: {
          isFilePathAbsolute: String(isAbsolute(file_path)),
        },
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

    const file = await readFileBun(fullFilePath)
    const normalizedFile = normalizeLineEndings(file ?? '')
    const normalizedOldString = normalizeLineEndings(old_string)
    if (!file) {
      return {
        result: false,
        message: 'Could not read file.',
        meta: {
          isFilePathAbsolute: String(isAbsolute(file_path)),
        },
      }
    }
    if (!normalizedFile.includes(normalizedOldString)) {
      return {
        result: false,
        message: `String to replace not found in file.\nString: ${old_string}`,
        meta: {
          isFilePathAbsolute: String(isAbsolute(file_path)),
        },
      }
    }

    const matches = normalizedFile.split(normalizedOldString).length - 1
    if (matches > 1 && !replace_all) {
      return {
        result: false,
        message: `Found ${matches} matches of the string to replace, but replace_all is false. To replace all occurrences, set replace_all to true. To replace only one occurrence, please provide more context to uniquely identify the instance.\nString: ${old_string}`,
        meta: {
          isFilePathAbsolute: String(isAbsolute(file_path)),
        },
      }
    }

    return { result: true }
  },
  async *call(
    { file_path, old_string, new_string, replace_all },
    { readFileTimestamps, readFileHashes },
  ) {
    const fullFilePath = isAbsolute(file_path)
      ? file_path
      : resolve(getCwd(), file_path)

    if (fileExistsBun(fullFilePath)) {
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

    const { patch, updatedFile } = await applyEdit(
      file_path,
      old_string,
      new_string,
      replace_all ?? false,
    )

    const dir = dirname(fullFilePath)
    mkdirSync(dir, { recursive: true })
    const enc = fileExistsBun(fullFilePath)
      ? detectFileEncoding(fullFilePath)
      : 'utf8'
    const endings = fileExistsBun(fullFilePath)
      ? detectLineEndings(fullFilePath)
      : 'LF'
    const originalFile = fileExistsBun(fullFilePath)
      ? normalizeLineEndings((await readFileBun(fullFilePath)) ?? '')
      : ''
    writeTextContent(fullFilePath, updatedFile, enc, endings)

    // Record Agent edit operation for file freshness tracking
    recordFileEdit(fullFilePath, updatedFile)

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
      oldString: old_string,
      newString: new_string,
      timestamp: Date.now(),
      operation:
        old_string === '' ? 'create' : new_string === '' ? 'delete' : 'update',
    })

    const data = {
      filePath: file_path,
      oldString: old_string,
      newString: new_string,
      originalFile,
      structuredPatch: patch,
      userModified: false,
      replaceAll: replace_all ?? false,
    }
    yield {
      type: 'result',
      data,
      resultForAssistant: this.renderResultForAssistant(data),
    }
  },
  renderResultForAssistant({ filePath, originalFile, oldString, newString }) {
    const { snippet, startLine } = getSnippet(
      normalizeLineEndings(originalFile || ''),
      normalizeLineEndings(oldString),
      normalizeLineEndings(newString),
    )
    return `The file ${filePath} has been updated. Here's the result of running \`cat -n\` on a snippet of the edited file:
${addLineNumbers({
  content: snippet,
  startLine,
})}`
  },
} satisfies Tool<
  typeof inputSchema,
  {
    filePath: string
    oldString: string
    newString: string
    originalFile: string
    structuredPatch: Hunk[]
    userModified: boolean
    replaceAll: boolean
  }
>

export function getSnippet(
  initialText: string,
  oldStr: string,
  newStr: string,
): { snippet: string; startLine: number } {
  const before = initialText.split(oldStr)[0] ?? ''
  const replacementLine = before.split(/\r?\n/).length - 1
  const newFileLines = initialText.replace(oldStr, newStr).split(/\r?\n/)
  // Calculate the start and end line numbers for the snippet
  const startLine = Math.max(0, replacementLine - N_LINES_SNIPPET)
  const endLine =
    replacementLine + N_LINES_SNIPPET + newStr.split(/\r?\n/).length
  // Get snippet
  const snippetLines = newFileLines.slice(startLine, endLine + 1)
  const snippet = snippetLines.join('\n')
  return { snippet, startLine: startLine + 1 }
}
