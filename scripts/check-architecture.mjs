#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import ts from 'typescript'

const repositoryRoot = process.cwd()

const zones = new Map([
  ['cli', 'apps/cli/src'],
  ['server', 'apps/server/src'],
  ['web', 'apps/web/src'],
  ['client', 'packages/client/src'],
  ['config', 'packages/config/src'],
  ['core', 'packages/core/src'],
  ['protocol', 'packages/protocol/src'],
  ['runtime', 'packages/runtime/src'],
  ['tools', 'packages/tools/src'],
])

const aliases = new Map([
  ['@kode/client', 'client'],
  ['#client', 'client'],
  ['@kode/config', 'config'],
  ['#config', 'config'],
  ['@kode/core', 'core'],
  ['#core', 'core'],
  ['@kode/protocol', 'protocol'],
  ['#protocol', 'protocol'],
  ['@kode/runtime', 'runtime'],
  ['#runtime', 'runtime'],
  ['@kode/tools', 'tools'],
  ['#tools', 'tools'],
  ['#daemon', 'server'],
  ['#host-acp', 'server'],
  ['#host-cli', 'cli'],
  ['#cli-commands', 'cli'],
  ['#cli-services', 'cli'],
  ['#cli-utils', 'cli'],
  ['#ui-ink', 'cli'],
  ['#host-mcp', 'core'],
])

// These are the intended dependency directions. Known reverse edges are listed
// separately and may shrink, but new exceptions must not appear unnoticed.
const allowedEdges = new Map([
  [
    'cli',
    new Set([
      'client',
      'config',
      'core',
      'protocol',
      'runtime',
      'server',
      'tools',
    ]),
  ],
  [
    'server',
    new Set(['client', 'config', 'core', 'protocol', 'runtime', 'tools']),
  ],
  ['web', new Set(['client', 'protocol'])],
  ['client', new Set(['protocol'])],
  ['config', new Set()],
  ['core', new Set(['config', 'protocol', 'runtime'])],
  ['protocol', new Set()],
  ['runtime', new Set()],
  ['tools', new Set(['config', 'core', 'protocol', 'runtime'])],
])

const knownDebt = new Map([
  ['config -> runtime', new Set(['packages/config/src/cwd.ts'])],
  ['core -> tools', new Set(['packages/core/src/mcp/server.ts'])],
  [
    'protocol -> config',
    new Set(['packages/protocol/src/utils/kodeAgentSessionLog.ts']),
  ],
  [
    'protocol -> core',
    new Set(['packages/protocol/src/utils/kodeAgentStreamJsonSession.ts']),
  ],
  [
    'runtime -> config',
    new Set([
      'packages/runtime/src/shell/sandboxEnv.ts',
      'packages/runtime/src/taskOutputStore.ts',
    ]),
  ],
  [
    'tools -> cli',
    new Set([
      'packages/tools/src/tools/interaction/SkillTool/SkillTool.tsx',
      'packages/tools/src/tools/system/BashTool/OutputLine.tsx',
    ]),
  ],
])

function toPosix(filePath) {
  return filePath.split(sep).join('/')
}

function zoneForAbsolutePath(filePath) {
  for (const [zone, root] of zones) {
    const absoluteRoot = resolve(repositoryRoot, root)
    if (
      filePath === absoluteRoot ||
      filePath.startsWith(`${absoluteRoot}${sep}`)
    ) {
      return zone
    }
  }
  return null
}

function zoneForSpecifier(specifier, sourceFile) {
  if (specifier.startsWith('.')) {
    return zoneForAbsolutePath(resolve(dirname(sourceFile), specifier))
  }

  for (const [alias, zone] of aliases) {
    if (specifier === alias || specifier.startsWith(`${alias}/`)) return zone
  }

  return null
}

function listSourceFiles(root) {
  const files = []

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!['test', 'tests', '__tests__', 'fixtures'].includes(entry.name)) {
          visit(fullPath)
        }
        continue
      }

      if (!/\.(?:ts|tsx)$/.test(entry.name)) continue
      if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)) continue
      files.push(fullPath)
    }
  }

  visit(root)
  return files
}

function stringLiteralValue(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : null
}

function collectSpecifiers(sourceFile) {
  const specifiers = []

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const value = stringLiteralValue(node.moduleSpecifier)
      if (value) specifiers.push({ value, position: node.getStart(sourceFile) })
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length > 0 &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    ) {
      const value = stringLiteralValue(node.arguments[0])
      if (value) specifiers.push({ value, position: node.getStart(sourceFile) })
    } else if (ts.isImportTypeNode(node)) {
      const value = stringLiteralValue(node.argument.literal)
      if (value) specifiers.push({ value, position: node.getStart(sourceFile) })
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return specifiers
}

const violations = []
const observedDebt = new Map()
let checkedFiles = 0

for (const [sourceZone, root] of zones) {
  for (const absoluteFile of listSourceFiles(resolve(repositoryRoot, root))) {
    checkedFiles += 1
    const projectFile = toPosix(relative(repositoryRoot, absoluteFile))
    const sourceText = readFileSync(absoluteFile, 'utf8')
    const sourceFile = ts.createSourceFile(
      absoluteFile,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      absoluteFile.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )

    for (const specifier of collectSpecifiers(sourceFile)) {
      const targetZone = zoneForSpecifier(specifier.value, absoluteFile)
      if (!targetZone || targetZone === sourceZone) continue
      if (allowedEdges.get(sourceZone)?.has(targetZone)) continue

      const edge = `${sourceZone} -> ${targetZone}`
      if (knownDebt.get(edge)?.has(projectFile)) {
        if (!observedDebt.has(edge)) observedDebt.set(edge, new Set())
        observedDebt.get(edge).add(projectFile)
        continue
      }

      const line =
        sourceFile.getLineAndCharacterOfPosition(specifier.position).line + 1
      violations.push(
        `${projectFile}:${line} imports ${specifier.value} (${edge})`,
      )
    }
  }
}

for (const [edge, files] of knownDebt) {
  for (const file of files) {
    if (!observedDebt.get(edge)?.has(file)) {
      violations.push(`Stale architecture-debt allowance: ${edge} in ${file}`)
    }
  }
}

if (violations.length > 0) {
  console.error('Architecture boundary check failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

const debtFileCount = [...observedDebt.values()].reduce(
  (total, files) => total + files.size,
  0,
)
console.log(
  `Architecture boundaries passed (${checkedFiles} production files; ${debtFileCount} allowlisted debt files).`,
)
