import type { Input } from './LspTool'
import {
  formatDocumentSymbolsResult,
  formatFindReferencesResult,
  formatGoToDefinitionResult,
  formatHoverResult,
  groupLocationsByFile,
} from './format'

type Args = {
  input: Input
  absPath: string
  pos: number
  ts: any
  program: any
  service: any
  sourceFile: any
}

export function runLspOperation({
  input,
  absPath,
  pos,
  ts,
  program,
  service,
  sourceFile,
}: Args): { formatted: string; resultCount: number; fileCount: number } {
  let formatted: string
  let resultCount = 0
  let fileCount = 0

  switch (input.operation) {
    case 'goToDefinition': {
      const defs = service.getDefinitionAtPosition?.(absPath, pos) ?? []
      const locations = defs
        .map((d: any) => {
          const defSourceFile = program.getSourceFile(d.fileName)
          if (!defSourceFile) return null
          const lc = ts.getLineAndCharacterOfPosition(
            defSourceFile,
            d.textSpan.start,
          )
          return {
            fileName: d.fileName,
            line0: lc.line,
            character0: lc.character,
          }
        })
        .filter(Boolean) as Array<{
        fileName: string
        line0: number
        character0: number
      }>
      const res = formatGoToDefinitionResult(locations)
      formatted = res.formatted
      resultCount = res.resultCount
      fileCount = res.fileCount
      break
    }
    case 'goToImplementation': {
      const impls = service.getImplementationAtPosition?.(absPath, pos) ?? []
      const locations = impls
        .map((d: any) => {
          const defSourceFile = program.getSourceFile(d.fileName)
          if (!defSourceFile) return null
          const lc = ts.getLineAndCharacterOfPosition(
            defSourceFile,
            d.textSpan.start,
          )
          return {
            fileName: d.fileName,
            line0: lc.line,
            character0: lc.character,
          }
        })
        .filter(Boolean) as Array<{
        fileName: string
        line0: number
        character0: number
      }>
      const res = formatGoToDefinitionResult(locations)
      formatted = res.formatted
      resultCount = res.resultCount
      fileCount = res.fileCount
      break
    }
    case 'findReferences': {
      const referencedSymbols = service.findReferences?.(absPath, pos) ?? []
      const refs: Array<{
        fileName: string
        line0: number
        character0: number
      }> = []
      for (const sym of referencedSymbols) {
        for (const ref of sym.references ?? []) {
          const refSource = program.getSourceFile(ref.fileName)
          if (!refSource) continue
          const lc = ts.getLineAndCharacterOfPosition(
            refSource,
            ref.textSpan.start,
          )
          refs.push({
            fileName: ref.fileName,
            line0: lc.line,
            character0: lc.character,
          })
        }
      }
      const res = formatFindReferencesResult(refs)
      formatted = res.formatted
      resultCount = res.resultCount
      fileCount = res.fileCount
      break
    }
    case 'hover': {
      const info = service.getQuickInfoAtPosition?.(absPath, pos)
      let text: string | null = null
      let hoverLine0 = input.line - 1
      let hoverCharacter0 = input.character - 1
      if (info) {
        const parts: string[] = []
        const signature = ts.displayPartsToString(info.displayParts ?? [])
        if (signature) parts.push(signature)
        const doc = ts.displayPartsToString(info.documentation ?? [])
        if (doc) parts.push(doc)
        if (info.tags && info.tags.length > 0) {
          for (const tag of info.tags) {
            const tagText = ts.displayPartsToString(tag.text ?? [])
            parts.push(`@${tag.name}${tagText ? ` ${tagText}` : ''}`)
          }
        }
        text = parts.filter(Boolean).join('\\n\\n')
        const lc = ts.getLineAndCharacterOfPosition(
          sourceFile,
          info.textSpan.start,
        )
        hoverLine0 = lc.line
        hoverCharacter0 = lc.character
      }
      const res = formatHoverResult(text, hoverLine0, hoverCharacter0)
      formatted = res.formatted
      resultCount = res.resultCount
      fileCount = res.fileCount
      break
    }
    case 'documentSymbol': {
      const tree = service.getNavigationTree?.(absPath)
      const lines: string[] = []
      let count = 0

      const kindLabel = (kind: string) => {
        const m = {
          class: 'Class',
          interface: 'Interface',
          enum: 'Enum',
          function: 'Function',
          method: 'Method',
          property: 'Property',
          var: 'Variable',
          let: 'Variable',
          const: 'Constant',
          module: 'Module',
          alias: 'Alias',
          type: 'Type',
        } as Record<string, string>
        return (
          m[kind] ?? (kind ? kind[0].toUpperCase() + kind.slice(1) : 'Unknown')
        )
      }

      const walk = (node: any, depth: number) => {
        const children: any[] = node?.childItems ?? []
        for (const child of children) {
          const span = child.spans?.[0]
          if (!span) continue
          const lc = ts.getLineAndCharacterOfPosition(sourceFile, span.start)
          const indent = '  '.repeat(depth)
          const label = kindLabel(child.kind)
          const detail = child.kindModifiers ? ` ${child.kindModifiers}` : ''
          lines.push(
            `${indent}${child.text} (${label})${detail} - Line ${lc.line + 1}`,
          )
          count += 1
          if (child.childItems && child.childItems.length > 0) {
            walk(child, depth + 1)
          }
        }
      }
      walk(tree, 0)

      const res = formatDocumentSymbolsResult(lines, count)
      formatted = res.formatted
      resultCount = res.resultCount
      fileCount = res.fileCount
      break
    }
    case 'workspaceSymbol': {
      const items =
        service.getNavigateToItems?.('', 100, undefined, true, true) ?? []
      if (!items || items.length === 0) {
        formatted =
          'No symbols found in workspace. This may occur if the workspace is empty, or if the LSP server has not finished indexing the project.'
        resultCount = 0
        fileCount = 0
        break
      }

      const lines: string[] = [
        `Found ${items.length} symbol${items.length === 1 ? '' : 's'} in workspace:`,
      ]
      const wrappedItems: Array<{ fileName: string; item: any }> = items.map(
        (it: any) => ({
          fileName: it.fileName,
          item: it,
        }),
      )
      const grouped = groupLocationsByFile(wrappedItems)
      for (const [file, itemsInFile] of grouped) {
        lines.push(`\\n${file}:`)
        for (const wrapper of itemsInFile) {
          const it = wrapper.item
          const sf = program.getSourceFile(it.fileName)
          if (!sf) continue
          const span = it.textSpan
          const lc = span
            ? ts.getLineAndCharacterOfPosition(sf, span.start)
            : { line: 0, character: 0 }
          const label = it.kind
            ? String(it.kind)[0].toUpperCase() + String(it.kind).slice(1)
            : 'Symbol'
          let line = `  ${it.name} (${label}) - Line ${lc.line + 1}`
          if (it.containerName) line += ` in ${it.containerName}`
          lines.push(line)
        }
      }
      formatted = lines.join('\\n')
      resultCount = items.length
      fileCount = grouped.size
      break
    }
    case 'prepareCallHierarchy':
    case 'incomingCalls':
    case 'outgoingCalls': {
      const opLabel = input.operation
      formatted = `Error performing ${opLabel}: Call hierarchy is not supported by the TypeScript backend`
      resultCount = 0
      fileCount = 0
      break
    }
    default: {
      formatted = `Error performing ${input.operation}: Unsupported operation`
      resultCount = 0
      fileCount = 0
    }
  }

  return { formatted, resultCount, fileCount }
}
