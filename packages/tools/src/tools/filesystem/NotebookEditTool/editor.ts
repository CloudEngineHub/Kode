import { randomUUID } from 'crypto'
import { isAbsolute, resolve } from 'path'

import type { NotebookCellType } from '#core/types/notebook'
import { NotebookContent } from '#core/types/notebook'
import {
  detectFileEncoding,
  detectLineEndings,
  writeTextContent,
} from '#core/utils/file'
import { readFileBun } from '#runtime/file'
import { getCwd } from '#core/utils/state'
import { emitReminderEvent } from '#core/services/systemReminder'
import { recordFileEdit } from '#core/services/fileFreshness'

import { findCellIndex, getCellId, getDerivedCellId } from './cells'

export type NotebookEditResult = {
  cell_id?: string
  new_source: string
  cell_type: NotebookCellType
  language: string
  edit_mode: string
  error?: string
}

export function resolveNotebookPath(input: string): string {
  return isAbsolute(input) ? input : resolve(getCwd(), input)
}

export async function editNotebookFile(args: {
  notebook_path: string
  cell_id?: string
  new_source: string
  cell_type?: NotebookCellType
  edit_mode?: 'replace' | 'insert' | 'delete'
}): Promise<NotebookEditResult> {
  const fullPath = resolveNotebookPath(args.notebook_path)
  const mode = args.edit_mode ?? 'replace'
  let editedCellId: string | undefined = args.cell_id

  try {
    const enc = detectFileEncoding(fullPath)
    const content = await readFileBun(fullPath)
    if (!content) {
      throw new Error('Could not read notebook file')
    }

    const notebook = JSON.parse(content) as NotebookContent
    const language = notebook.metadata.language_info?.name ?? 'python'

    const resolveIndexOrThrow = (): number => {
      if (!args.cell_id) {
        throw new Error('cell_id is required for this edit')
      }
      const idx = findCellIndex(notebook, args.cell_id)
      if (idx === null || idx < 0 || idx >= notebook.cells.length) {
        throw new Error(`Cell not found: ${args.cell_id}`)
      }
      return idx
    }

    if (mode === 'delete') {
      const idx = resolveIndexOrThrow()
      editedCellId = getCellId(notebook.cells[idx]!, idx)
      notebook.cells.splice(idx, 1)
    } else if (mode === 'insert') {
      if (!args.cell_type) {
        throw new Error('cell_type is required for insert edits')
      }

      const afterIndex =
        args.cell_id === undefined ? -1 : findCellIndex(notebook, args.cell_id)
      if (afterIndex === null) {
        throw new Error(`Cell not found: ${args.cell_id}`)
      }

      const insertIndex = afterIndex === -1 ? 0 : afterIndex + 1

      const newCell: NotebookContent['cells'][number] = {
        cell_type: args.cell_type,
        source: args.new_source,
        metadata: {},
        ...(args.cell_type === 'code' ? { outputs: [] } : {}),
      }

      if (notebook.nbformat === 4 && notebook.nbformat_minor >= 5) {
        newCell.id = randomUUID()
      }

      notebook.cells.splice(insertIndex, 0, newCell)
      editedCellId = newCell.id ?? getDerivedCellId(insertIndex)
    } else {
      const idx = resolveIndexOrThrow()
      const targetCell = notebook.cells[idx]!
      targetCell.source = args.new_source
      targetCell.execution_count = undefined
      targetCell.outputs = []
      if (args.cell_type && args.cell_type !== targetCell.cell_type) {
        targetCell.cell_type = args.cell_type
      }
      editedCellId = getCellId(targetCell, idx)
    }

    const endings = detectLineEndings(fullPath)
    const updatedNotebook = JSON.stringify(notebook, null, 1)
    writeTextContent(fullPath, updatedNotebook, enc, endings!)

    recordFileEdit(fullPath, updatedNotebook)
    emitReminderEvent('file:edited', {
      filePath: fullPath,
      cellId: editedCellId,
      newSource: args.new_source,
      cellType: args.cell_type,
      editMode: mode,
      timestamp: Date.now(),
      operation: 'notebook_edit',
    })

    return {
      cell_id: editedCellId,
      new_source: args.new_source,
      cell_type: args.cell_type ?? 'code',
      language,
      edit_mode: mode,
      error: '',
    }
  } catch (error) {
    return {
      cell_id: args.cell_id,
      new_source: args.new_source,
      cell_type: args.cell_type ?? 'code',
      language: 'python',
      edit_mode: mode,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error occurred while editing notebook',
    }
  }
}
