import { Box, Text } from 'ink'
import { extname, relative } from 'path'
import * as React from 'react'
import { z } from 'zod'
import { highlight, supportsLanguage } from 'cli-highlight'
import type { Tool } from '#core/tooling/Tool'
import { NotebookCellType, NotebookContent } from '#core/types/notebook'
import { readFileBun, fileExistsBun } from '#runtime/file'
import { safeParseJSON } from '#core/utils/json'
import { getCwd } from '#core/utils/state'
import { DESCRIPTION, PROMPT } from './prompt'
import { hasWritePermission } from '#core/utils/permissions/filesystem'
import { findCellIndex } from './cells'
import { editNotebookFile, resolveNotebookPath } from './editor'

function highlightCode(code: string, language: string): string {
  try {
    if (supportsLanguage(language)) {
      return highlight(code, { language })
    }
    return highlight(code, { language: 'markdown' })
  } catch {
    return highlight(code, { language: 'markdown' })
  }
}

const inputSchema = z.strictObject({
  notebook_path: z
    .string()
    .describe(
      'The absolute path to the Jupyter notebook file to edit (must be absolute, not relative)',
    ),
  cell_id: z
    .string()
    .optional()
    .describe(
      'The ID of the cell to edit. When inserting a new cell, the new cell will be inserted after the cell with this ID, or at the beginning if not specified.',
    ),
  new_source: z.string().describe('The new source for the cell'),
  cell_type: z
    .enum(['code', 'markdown'])
    .optional()
    .describe(
      'The type of the cell (code or markdown). If not specified, it defaults to the current cell type. If using edit_mode=insert, this is required.',
    ),
  edit_mode: z
    .enum(['replace', 'insert', 'delete'])
    .optional()
    .describe(
      'The type of edit to make (replace, insert, delete). Defaults to replace.',
    ),
})

export const NotebookEditTool = {
  name: 'NotebookEdit',
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  inputSchema,
  userFacingName() {
    return 'Edit Notebook'
  },
  async isEnabled() {
    return true
  },
  isReadOnly() {
    return false
  },
  isConcurrencySafe() {
    return false // NotebookEditTool modifies state/files, not safe for concurrent execution
  },
  needsPermissions({ notebook_path }) {
    return !hasWritePermission(notebook_path)
  },
  renderResultForAssistant({ cell_id, edit_mode, new_source, error }) {
    if (error) {
      return error
    }
    switch (edit_mode) {
      case 'replace':
        return `Updated cell ${cell_id} with ${new_source}`
      case 'insert':
        return `Inserted cell after ${cell_id ?? 'beginning'} with ${new_source}`
      case 'delete':
        return `Deleted cell ${cell_id}`
    }
  },
  renderToolUseMessage(input, { verbose }) {
    const cellRef = input.cell_id ?? '(none)'
    return `notebook_path: ${verbose ? input.notebook_path : relative(getCwd(), input.notebook_path)}, cell_id: ${cellRef}, content: ${input.new_source.slice(0, 30)}…, cell_type: ${input.cell_type}, edit_mode: ${input.edit_mode ?? 'replace'}`
  },
  renderToolResultMessage({ cell_id, new_source, language, error }) {
    if (error) {
      return (
        <Box flexDirection="column">
          <Text color="red">{error}</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Text>Updated cell {cell_id}:</Text>
        <Box marginLeft={2}>
          <Text>{highlightCode(new_source, language)}</Text>
        </Box>
      </Box>
    )
  },
  async validateInput({
    notebook_path,
    cell_id,
    cell_type,
    edit_mode = 'replace',
  }) {
    const fullPath = resolveNotebookPath(notebook_path)

    if (!fileExistsBun(fullPath)) {
      return {
        result: false,
        message: 'Notebook file does not exist.',
      }
    }

    if (extname(fullPath) !== '.ipynb') {
      return {
        result: false,
        message:
          'File must be a Jupyter notebook (.ipynb file). For editing other file types, use the FileEdit tool.',
      }
    }

    if (edit_mode === 'insert' && !cell_type) {
      return {
        result: false,
        message: 'Cell type is required when using edit_mode=insert.',
      }
    }

    const content = await readFileBun(fullPath)
    if (!content) {
      return {
        result: false,
        message: 'Could not read notebook file.',
      }
    }
    const notebook = safeParseJSON(content) as NotebookContent | null
    if (!notebook) {
      return {
        result: false,
        message: 'Notebook is not valid JSON.',
      }
    }

    if ((edit_mode === 'replace' || edit_mode === 'delete') && !cell_id) {
      return {
        result: false,
        message: 'cell_id is required for replace/delete edits.',
      }
    }

    if (cell_id) {
      const index = findCellIndex(notebook, cell_id)
      if (index === null || index < 0 || index >= notebook.cells.length) {
        return {
          result: false,
          message: `Cell ID is out of bounds or not found. Notebook has ${notebook.cells.length} cells.`,
        }
      }
    }

    return { result: true }
  },
  async *call({ notebook_path, cell_id, new_source, cell_type, edit_mode }) {
    const data = await editNotebookFile({
      notebook_path,
      cell_id,
      new_source,
      cell_type,
      edit_mode,
    })
    yield {
      type: 'result',
      data,
      resultForAssistant: this.renderResultForAssistant(data),
    }
  },
} satisfies Tool<
  typeof inputSchema,
  {
    cell_id?: string
    new_source: string
    cell_type: NotebookCellType
    language: string
    edit_mode: string
    error?: string
  }
>
