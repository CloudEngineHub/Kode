import type { ToolUseContext } from '#core/tooling/Tool'
import { getAbsolutePath } from '#core/utils/file'
import { extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFile } from 'node:fs/promises'
import type { Input, Output } from './LspTool'
import {
  formatDocumentSymbolsResult,
  formatFindReferencesResult,
  formatGoToDefinitionResult,
  formatHoverResult,
  toProjectRelativeIfPossible,
} from './format'
import { listResolvedLspServers } from './lspConfig'
import { LspServerManager } from './lspManager'
import type { LspServerRunState } from './lspServer'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function uriToFilePath(uri: string): string | null {
  try {
    if (!uri.startsWith('file:')) return null
    return fileURLToPath(uri)
  } catch {
    return null
  }
}

function formatUriForDisplay(uri: string): string {
  const filePath = uriToFilePath(uri)
  if (filePath) return toProjectRelativeIfPossible(filePath)

  try {
    return decodeURIComponent(uri)
  } catch {
    return uri
  }
}

function positionFromRangeStart(
  range: unknown,
): { line0: number; character0: number } | null {
  const record = asRecord(range)
  const start = record ? asRecord(record.start) : null
  if (!start) return null
  const line = start.line
  const character = start.character
  if (typeof line !== 'number' || typeof character !== 'number') return null
  return { line0: line, character0: character }
}

function coerceLocationArray(
  value: unknown,
): Array<{ uri: string; range: unknown }> {
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  const out: Array<{ uri: string; range: unknown }> = []
  for (const item of list) {
    const record = asRecord(item)
    if (!record) continue
    // LocationLink uses targetUri + targetSelectionRange/targetRange.
    if (typeof record.targetUri === 'string') {
      const range = record.targetSelectionRange ?? record.targetRange
      out.push({ uri: record.targetUri, range })
      continue
    }
    if (typeof record.uri === 'string') {
      out.push({ uri: record.uri, range: record.range })
      continue
    }
  }
  return out
}

function extractHoverText(hover: unknown): string | null {
  const record = asRecord(hover)
  if (!record) return null

  const contents = record.contents
  if (!contents) return null

  if (typeof contents === 'string') return contents

  // MarkupContent: { kind, value }
  const contentsRec = asRecord(contents)
  if (contentsRec && typeof contentsRec.value === 'string')
    return contentsRec.value

  // MarkedString[] or mixed array.
  if (Array.isArray(contents)) {
    const parts: string[] = []
    for (const block of contents) {
      if (typeof block === 'string') {
        parts.push(block)
        continue
      }
      const blockRec = asRecord(block)
      if (!blockRec) continue
      if (typeof blockRec.value === 'string') parts.push(blockRec.value)
    }
    const text = parts.join('\n\n').trim()
    return text.length > 0 ? text : null
  }

  // MarkedString: { language, value }
  if (contentsRec && typeof contentsRec.value === 'string')
    return contentsRec.value

  return null
}

function formatSymbolKind(kind: unknown): string {
  const k = typeof kind === 'number' ? kind : 0
  const map: Record<number, string> = {
    1: 'File',
    2: 'Module',
    3: 'Namespace',
    4: 'Package',
    5: 'Class',
    6: 'Method',
    7: 'Property',
    8: 'Field',
    9: 'Constructor',
    10: 'Enum',
    11: 'Interface',
    12: 'Function',
    13: 'Variable',
    14: 'Constant',
    15: 'String',
    16: 'Number',
    17: 'Boolean',
    18: 'Array',
    19: 'Object',
    20: 'Key',
    21: 'Null',
    22: 'EnumMember',
    23: 'Struct',
    24: 'Event',
    25: 'Operator',
    26: 'TypeParameter',
  }
  return map[k] ?? 'Unknown'
}

function countUniqueUris(uris: Array<string | null | undefined>): number {
  const set = new Set<string>()
  for (const uri of uris) {
    if (!uri) continue
    set.add(uri)
  }
  return set.size
}

function buildLspMethodParams(
  input: Input,
  absPath: string,
): { method: string; params: unknown } {
  const uri = pathToFileURL(absPath).href
  const pos = { line: input.line - 1, character: input.character - 1 }

  switch (input.operation) {
    case 'goToDefinition':
      return {
        method: 'textDocument/definition',
        params: { textDocument: { uri }, position: pos },
      }
    case 'findReferences':
      return {
        method: 'textDocument/references',
        params: {
          textDocument: { uri },
          position: pos,
          context: { includeDeclaration: true },
        },
      }
    case 'hover':
      return {
        method: 'textDocument/hover',
        params: { textDocument: { uri }, position: pos },
      }
    case 'documentSymbol':
      return {
        method: 'textDocument/documentSymbol',
        params: { textDocument: { uri } },
      }
    case 'workspaceSymbol':
      return { method: 'workspace/symbol', params: { query: '' } }
    case 'goToImplementation':
      return {
        method: 'textDocument/implementation',
        params: { textDocument: { uri }, position: pos },
      }
    case 'prepareCallHierarchy':
    case 'incomingCalls':
    case 'outgoingCalls':
      return {
        method: 'textDocument/prepareCallHierarchy',
        params: { textDocument: { uri }, position: pos },
      }
    default: {
      const exhaustiveCheck: never = input.operation
      throw new Error(`Unsupported LSP operation: ${exhaustiveCheck}`)
    }
  }
}

function formatWorkspaceSymbols(result: unknown): {
  formatted: string
  resultCount: number
  fileCount: number
} {
  const list = Array.isArray(result) ? result : []
  if (list.length === 0) {
    return {
      formatted:
        'No symbols found in workspace. This may occur if the workspace is empty, or if the LSP server has not finished indexing the project.',
      resultCount: 0,
      fileCount: 0,
    }
  }

  const symbols = list
    .map(item => {
      const rec = asRecord(item)
      if (!rec) return null
      const location = asRecord(rec.location)
      if (!location) return null
      if (typeof location.uri !== 'string' || !location.uri) return null
      return rec
    })
    .filter(Boolean) as Record<string, unknown>[]

  if (symbols.length === 0) {
    return {
      formatted:
        'No symbols found in workspace. This may occur if the workspace is empty, or if the LSP server has not finished indexing the project.',
      resultCount: 0,
      fileCount: 0,
    }
  }

  const grouped = new Map<string, Record<string, unknown>[]>()
  for (const sym of symbols) {
    const location = asRecord(sym.location)
    const uri =
      location && typeof location.uri === 'string' ? location.uri : null
    const fileKey = uri ? formatUriForDisplay(uri) : '<unknown location>'
    const existing = grouped.get(fileKey)
    if (existing) existing.push(sym)
    else grouped.set(fileKey, [sym])
  }

  const lines: string[] = [
    `Found ${symbols.length} symbol${symbols.length === 1 ? '' : 's'} in workspace:`,
  ]

  for (const [file, items] of grouped) {
    lines.push('', `${file}:`)
    for (const item of items) {
      const name = typeof item.name === 'string' ? item.name : '(anonymous)'
      const kind = formatSymbolKind(item.kind)
      const location = asRecord(item.location)
      const range = location ? location.range : null
      const pos = positionFromRangeStart(range)
      const line0 = pos?.line0 ?? 0
      let line = `  ${name} (${kind}) - Line ${line0 + 1}`
      if (typeof item.containerName === 'string' && item.containerName) {
        line += ` in ${item.containerName}`
      }
      lines.push(line)
    }
  }

  return {
    formatted: lines.join('\n'),
    resultCount: symbols.length,
    fileCount: grouped.size,
  }
}

function formatCallHierarchyItem(item: Record<string, unknown>): string {
  const name = typeof item.name === 'string' ? item.name : '(anonymous)'
  const kind = formatSymbolKind(item.kind)

  const uri = typeof item.uri === 'string' ? item.uri : null
  if (!uri) return `${name} (${kind}) - <unknown location>`

  const fileForDisplay = formatUriForDisplay(uri)

  const range = asRecord(item.range)
  const start = range ? asRecord(range.start) : null
  const line0 = start && typeof start.line === 'number' ? start.line : null
  const line = typeof line0 === 'number' ? line0 + 1 : 1

  let out = `${name} (${kind}) - ${fileForDisplay}:${line}`

  if (typeof item.detail === 'string' && item.detail) {
    out += ` [${item.detail}]`
  }

  return out
}

function formatCallHierarchyItems(items: unknown): {
  formatted: string
  resultCount: number
  fileCount: number
} {
  const list = Array.isArray(items) ? items : []
  if (list.length === 0) {
    return {
      formatted: 'No call hierarchy item found at this position',
      resultCount: 0,
      fileCount: 0,
    }
  }

  const parsed = list.map(item => asRecord(item))
  const uris = parsed.map(item =>
    item && typeof item.uri === 'string' ? item.uri : null,
  )

  if (list.length === 1) {
    const first = parsed[0]
    return {
      formatted: first
        ? `Call hierarchy item: ${formatCallHierarchyItem(first)}`
        : 'No call hierarchy item found at this position',
      resultCount: 1,
      fileCount: countUniqueUris(uris),
    }
  }

  const lines: string[] = [`Found ${list.length} call hierarchy items:`]
  for (const item of parsed) {
    if (!item) continue
    lines.push(`  ${formatCallHierarchyItem(item)}`)
  }

  return {
    formatted: lines.join('\n'),
    resultCount: list.length,
    fileCount: countUniqueUris(uris),
  }
}

function formatIncomingCalls(calls: unknown): {
  formatted: string
  resultCount: number
  fileCount: number
} {
  const list = Array.isArray(calls) ? calls : []
  if (list.length === 0) {
    return {
      formatted: 'No incoming calls found (nothing calls this function)',
      resultCount: 0,
      fileCount: 0,
    }
  }

  const grouped = new Map<string, Array<Record<string, unknown>>>()
  const uris: Array<string | null> = []

  for (const call of list) {
    const rec = asRecord(call)
    if (!rec) continue
    const from = asRecord(rec.from)
    if (!from) continue

    const uri = typeof from.uri === 'string' ? from.uri : null
    uris.push(uri)
    const fileKey = uri ? formatUriForDisplay(uri) : '<unknown location>'

    const existing = grouped.get(fileKey)
    if (existing) existing.push(rec)
    else grouped.set(fileKey, [rec])
  }

  const lines: string[] = [
    `Found ${list.length} incoming call${list.length === 1 ? '' : 's'}:`,
  ]

  for (const [file, items] of grouped) {
    lines.push('', `${file}:`)
    for (const call of items) {
      const from = asRecord(call.from)
      if (!from) continue
      const kind = formatSymbolKind(from.kind)
      const range = asRecord(from.range)
      const start = range ? asRecord(range.start) : null
      const line0 = start && typeof start.line === 'number' ? start.line : null
      const line = typeof line0 === 'number' ? line0 + 1 : 1

      const name = typeof from.name === 'string' ? from.name : '(anonymous)'
      let text = `  ${name} (${kind}) - Line ${line}`

      const fromRanges = Array.isArray(call.fromRanges) ? call.fromRanges : []
      if (fromRanges.length > 0) {
        const refs = fromRanges
          .map(r => {
            const rr = asRecord(r)
            const rs = rr ? asRecord(rr.start) : null
            const rl = rs && typeof rs.line === 'number' ? rs.line : null
            const rc =
              rs && typeof rs.character === 'number' ? rs.character : null
            if (typeof rl !== 'number' || typeof rc !== 'number') return null
            return `${rl + 1}:${rc + 1}`
          })
          .filter(Boolean) as string[]
        if (refs.length > 0) text += ` [calls at: ${refs.join(', ')}]`
      }

      lines.push(text)
    }
  }

  return {
    formatted: lines.join('\n'),
    resultCount: list.length,
    fileCount: countUniqueUris(uris),
  }
}

function formatOutgoingCalls(calls: unknown): {
  formatted: string
  resultCount: number
  fileCount: number
} {
  const list = Array.isArray(calls) ? calls : []
  if (list.length === 0) {
    return {
      formatted: 'No outgoing calls found (this function calls nothing)',
      resultCount: 0,
      fileCount: 0,
    }
  }

  const grouped = new Map<string, Array<Record<string, unknown>>>()
  const uris: Array<string | null> = []

  for (const call of list) {
    const rec = asRecord(call)
    if (!rec) continue
    const to = asRecord(rec.to)
    if (!to) continue

    const uri = typeof to.uri === 'string' ? to.uri : null
    uris.push(uri)
    const fileKey = uri ? formatUriForDisplay(uri) : '<unknown location>'

    const existing = grouped.get(fileKey)
    if (existing) existing.push(rec)
    else grouped.set(fileKey, [rec])
  }

  const lines: string[] = [
    `Found ${list.length} outgoing call${list.length === 1 ? '' : 's'}:`,
  ]

  for (const [file, items] of grouped) {
    lines.push('', `${file}:`)
    for (const call of items) {
      const to = asRecord(call.to)
      if (!to) continue
      const kind = formatSymbolKind(to.kind)
      const range = asRecord(to.range)
      const start = range ? asRecord(range.start) : null
      const line0 = start && typeof start.line === 'number' ? start.line : null
      const line = typeof line0 === 'number' ? line0 + 1 : 1

      const name = typeof to.name === 'string' ? to.name : '(anonymous)'
      let text = `  ${name} (${kind}) - Line ${line}`

      const fromRanges = Array.isArray(call.fromRanges) ? call.fromRanges : []
      if (fromRanges.length > 0) {
        const refs = fromRanges
          .map(r => {
            const rr = asRecord(r)
            const rs = rr ? asRecord(rr.start) : null
            const rl = rs && typeof rs.line === 'number' ? rs.line : null
            const rc =
              rs && typeof rs.character === 'number' ? rs.character : null
            if (typeof rl !== 'number' || typeof rc !== 'number') return null
            return `${rl + 1}:${rc + 1}`
          })
          .filter(Boolean) as string[]
        if (refs.length > 0) text += ` [called from: ${refs.join(', ')}]`
      }

      lines.push(text)
    }
  }

  return {
    formatted: lines.join('\n'),
    resultCount: list.length,
    fileCount: countUniqueUris(uris),
  }
}

let cachedManager: { signature: string; manager: LspServerManager } | null =
  null

export type LspRuntimeServerStatus = {
  name: string
  state: LspServerRunState
  pid: number | null
  restartCount: number
  lastError: string | null
}

export function getCachedLspRuntimeStatus(): {
  hasManager: boolean
  signature: string | null
  servers: LspRuntimeServerStatus[]
} {
  if (!cachedManager) {
    return { hasManager: false, signature: null, servers: [] }
  }

  const servers: LspRuntimeServerStatus[] = []
  for (const [name, server] of cachedManager.manager.getAllServers()) {
    servers.push({
      name,
      state: server.state,
      pid: server.getProcessPid(),
      restartCount: server.restartCount,
      lastError: server.lastError ? server.lastError.message : null,
    })
  }

  return {
    hasManager: true,
    signature: cachedManager.signature,
    servers: servers.sort((a, b) => a.name.localeCompare(b.name)),
  }
}

async function getLspManager(): Promise<LspServerManager | null> {
  const servers = await listResolvedLspServers()
  if (servers.length === 0) return null

  const signature = JSON.stringify(
    servers.map(s => ({
      name: s.name,
      command: s.command,
      args: s.args ?? [],
      transport: s.transport ?? 'stdio',
      extensionToLanguage: s.extensionToLanguage ?? {},
      workspaceFolder: s.workspaceFolder ?? '',
      env: s.env ?? {},
      initializationOptions: s.initializationOptions ?? null,
      settings: s.settings ?? null,
      startupTimeout: s.startupTimeout ?? null,
      shutdownTimeout: s.shutdownTimeout ?? null,
      restartOnCrash: s.restartOnCrash ?? false,
      maxRestarts: s.maxRestarts ?? null,
    })),
  )

  if (cachedManager && cachedManager.signature === signature) {
    return cachedManager.manager
  }

  if (cachedManager) {
    await cachedManager.manager.dispose()
    cachedManager = null
  }

  const manager = new LspServerManager(servers)
  await manager.initialize()
  cachedManager = { signature, manager }
  return manager
}

export async function ensureLspManagerInitialized(): Promise<LspServerManager | null> {
  return await getLspManager()
}

export async function* callLspTool(
  input: Input,
  _context: ToolUseContext,
): AsyncGenerator<{
  type: 'result'
  data: Output
  resultForAssistant: string
}> {
  const absPath = getAbsolutePath(input.filePath) ?? input.filePath

  const manager = await getLspManager()
  if (!manager) {
    const ext = extname(absPath)
    const out: Output = {
      operation: input.operation,
      result: `No LSP server available for file type: ${ext}`,
      filePath: input.filePath,
    }
    yield { type: 'result', data: out, resultForAssistant: out.result }
    return
  }

  try {
    const { method, params } = buildLspMethodParams(input, absPath)
    if (!manager.isFileOpen(absPath)) {
      const content = await readFile(absPath, 'utf8')
      await manager.openFile(absPath, content)
    }

    const result = await manager.sendRequest(absPath, method, params)
    if (result === undefined) {
      const ext = extname(absPath)
      const out: Output = {
        operation: input.operation,
        result: `No LSP server available for file type: ${ext}`,
        filePath: input.filePath,
      }
      yield { type: 'result', data: out, resultForAssistant: out.result }
      return
    }

    if (
      input.operation === 'goToDefinition' ||
      input.operation === 'goToImplementation'
    ) {
      const locations = coerceLocationArray(result)
        .map(loc => {
          const fileName = uriToFilePath(loc.uri)
          if (!fileName) return null
          const pos = positionFromRangeStart(loc.range)
          if (!pos) return null
          return { fileName, line0: pos.line0, character0: pos.character0 }
        })
        .filter(Boolean) as Array<{
        fileName: string
        line0: number
        character0: number
      }>

      const res = formatGoToDefinitionResult(locations)
      const out: Output = {
        operation: input.operation,
        result: res.formatted,
        filePath: input.filePath,
        resultCount: res.resultCount,
        fileCount: res.fileCount,
      }
      yield { type: 'result', data: out, resultForAssistant: out.result }
      return
    }

    if (input.operation === 'findReferences') {
      const locations = coerceLocationArray(result)
        .map(loc => {
          const fileName = uriToFilePath(loc.uri)
          if (!fileName) return null
          const pos = positionFromRangeStart(loc.range)
          if (!pos) return null
          return { fileName, line0: pos.line0, character0: pos.character0 }
        })
        .filter(Boolean) as Array<{
        fileName: string
        line0: number
        character0: number
      }>

      const res = formatFindReferencesResult(locations)
      const out: Output = {
        operation: input.operation,
        result: res.formatted,
        filePath: input.filePath,
        resultCount: res.resultCount,
        fileCount: res.fileCount,
      }
      yield { type: 'result', data: out, resultForAssistant: out.result }
      return
    }

    if (input.operation === 'hover') {
      const text = extractHoverText(result)
      const res = formatHoverResult(text, input.line - 1, input.character - 1)
      const out: Output = {
        operation: input.operation,
        result: res.formatted,
        filePath: input.filePath,
        resultCount: res.resultCount,
        fileCount: res.fileCount,
      }
      yield { type: 'result', data: out, resultForAssistant: out.result }
      return
    }

    if (input.operation === 'documentSymbol') {
      const symbols = Array.isArray(result) ? result : []

      if (symbols.length === 0) {
        const res = formatDocumentSymbolsResult([], 0)
        const out: Output = {
          operation: input.operation,
          result: res.formatted,
          filePath: input.filePath,
          resultCount: 0,
          fileCount: 0,
        }
        yield { type: 'result', data: out, resultForAssistant: out.result }
        return
      }

      const first = asRecord(symbols[0])
      const isDocumentSymbol = !!first && 'range' in first

      // Some LSP servers return SymbolInformation[] (which includes `location`) instead
      // of DocumentSymbol[]. In that case, use the same formatting as workspace symbols.
      if (!isDocumentSymbol) {
        const formatted = formatWorkspaceSymbols(symbols).formatted
        const out: Output = {
          operation: input.operation,
          result: formatted,
          filePath: input.filePath,
          resultCount: symbols.length,
          fileCount: 1,
        }
        yield { type: 'result', data: out, resultForAssistant: out.result }
        return
      }

      const lines: string[] = []
      let count = 0

      const walk = (items: unknown[], depth: number) => {
        for (const sym of items) {
          const rec = asRecord(sym)
          if (!rec) continue

          const name = typeof rec.name === 'string' ? rec.name : null
          if (!name) continue

          const kind = formatSymbolKind(rec.kind)
          const indent = '  '.repeat(depth)
          let line = `${indent}${name} (${kind})`

          if (typeof rec.detail === 'string' && rec.detail) {
            line += ` ${rec.detail}`
          }

          const range = asRecord(rec.range)
          const start = range ? asRecord(range.start) : null
          const line0 =
            start && typeof start.line === 'number' ? start.line : null
          const displayLine = typeof line0 === 'number' ? line0 + 1 : 1
          line += ` - Line ${displayLine}`

          lines.push(line)
          count += 1

          const children = Array.isArray(rec.children) ? rec.children : []
          if (children.length > 0) walk(children, depth + 1)
        }
      }

      walk(symbols, 0)

      const res = formatDocumentSymbolsResult(lines, count)
      const out: Output = {
        operation: input.operation,
        result: res.formatted,
        filePath: input.filePath,
        resultCount: count,
        fileCount: 1,
      }
      yield { type: 'result', data: out, resultForAssistant: out.result }
      return
    }

    if (input.operation === 'workspaceSymbol') {
      const res = formatWorkspaceSymbols(result)
      const out: Output = {
        operation: input.operation,
        result: res.formatted,
        filePath: input.filePath,
        resultCount: res.resultCount,
        fileCount: res.fileCount,
      }
      yield { type: 'result', data: out, resultForAssistant: out.result }
      return
    }

    if (input.operation === 'prepareCallHierarchy') {
      const res = formatCallHierarchyItems(result)
      const out: Output = {
        operation: input.operation,
        result: res.formatted,
        filePath: input.filePath,
        resultCount: res.resultCount,
        fileCount: res.fileCount,
      }
      yield { type: 'result', data: out, resultForAssistant: out.result }
      return
    }

    if (
      input.operation === 'incomingCalls' ||
      input.operation === 'outgoingCalls'
    ) {
      const items = Array.isArray(result) ? result : []
      if (items.length === 0) {
        const out: Output = {
          operation: input.operation,
          result: 'No call hierarchy item found at this position',
          filePath: input.filePath,
          resultCount: 0,
          fileCount: 0,
        }
        yield { type: 'result', data: out, resultForAssistant: out.result }
        return
      }

      const first = items[0]
      const nextMethod =
        input.operation === 'incomingCalls'
          ? 'callHierarchy/incomingCalls'
          : 'callHierarchy/outgoingCalls'
      const nextResult = await manager.sendRequest(absPath, nextMethod, {
        item: first,
      })

      const res =
        input.operation === 'incomingCalls'
          ? formatIncomingCalls(nextResult)
          : formatOutgoingCalls(nextResult)

      const out: Output = {
        operation: input.operation,
        result: res.formatted,
        filePath: input.filePath,
        resultCount: res.resultCount,
        fileCount: res.fileCount,
      }
      yield { type: 'result', data: out, resultForAssistant: out.result }
      return
    }

    const out: Output = {
      operation: input.operation,
      result: `Error performing ${input.operation}: Unsupported operation`,
      filePath: input.filePath,
      resultCount: 0,
      fileCount: 0,
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
