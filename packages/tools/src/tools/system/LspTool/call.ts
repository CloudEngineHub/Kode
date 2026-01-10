import type { ToolUseContext } from '#core/tooling/Tool'
import { getAbsolutePath } from '#core/utils/file'
import { getCwd } from '#core/utils/state'
import { extname } from 'path'
import type { Input, Output } from './LspTool'
import {
  getOrCreateTsProject,
  isFileTypeSupportedByTypescriptBackend,
} from './tsProject'
import { runLspOperation } from './operations'

export async function* callLspTool(
  input: Input,
  _context: ToolUseContext,
): AsyncGenerator<{
  type: 'result'
  data: Output
  resultForAssistant: string
}> {
  const absPath = getAbsolutePath(input.filePath) ?? input.filePath

  if (!isFileTypeSupportedByTypescriptBackend(absPath)) {
    const ext = extname(absPath)
    const out: Output = {
      operation: input.operation,
      result: `No LSP server available for file type: ${ext}`,
      filePath: input.filePath,
      resultCount: 0,
      fileCount: 0,
    }
    yield { type: 'result', data: out, resultForAssistant: out.result }
    return
  }

  const project = getOrCreateTsProject(getCwd())
  if (!project) {
    const out: Output = {
      operation: input.operation,
      result:
        'LSP server manager not initialized. This may indicate a startup issue.',
      filePath: input.filePath,
      resultCount: 0,
      fileCount: 0,
    }
    yield { type: 'result', data: out, resultForAssistant: out.result }
    return
  }

  project.rootFiles.add(absPath)

  const ts = project.ts
  const service = project.languageService
  const program = service.getProgram?.()
  if (!program) {
    const out: Output = {
      operation: input.operation,
      result: `Error performing ${input.operation}: TypeScript program not available`,
      filePath: input.filePath,
      resultCount: 0,
      fileCount: 0,
    }
    yield { type: 'result', data: out, resultForAssistant: out.result }
    return
  }

  const sourceFile = program.getSourceFile(absPath)
  if (!sourceFile) {
    const out: Output = {
      operation: input.operation,
      result: `Error performing ${input.operation}: File is not part of the TypeScript program`,
      filePath: input.filePath,
      resultCount: 0,
      fileCount: 0,
    }
    yield { type: 'result', data: out, resultForAssistant: out.result }
    return
  }

  const pos = ts.getPositionOfLineAndCharacter(
    sourceFile,
    input.line - 1,
    input.character - 1,
  )

  try {
    const { formatted, resultCount, fileCount } = runLspOperation({
      input,
      absPath,
      pos,
      program,
      service,
      ts,
      sourceFile,
    })

    const out: Output = {
      operation: input.operation,
      result: formatted,
      filePath: input.filePath,
      resultCount,
      fileCount,
    }
    yield { type: 'result', data: out, resultForAssistant: out.result }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const out: Output = {
      operation: input.operation,
      result: `Error performing ${input.operation}: ${message}`,
      filePath: input.filePath,
    }
    yield { type: 'result', data: out, resultForAssistant: out.result }
  }
}
