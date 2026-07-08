#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const scanRootNames = ['apps', 'packages']
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const ignoredDirectoryNames = new Set([
  '.git',
  '.next',
  '.tmp',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'static',
])

const reportPath = path.join(
  repoRoot,
  '.tmp',
  'refactor-baseline',
  'report.json',
)

function toRepoPath(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, '/')
}

function isTestRepoPath(repoPath) {
  return (
    /(^|\/)(__tests__|test|tests)\//.test(repoPath) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(repoPath)
  )
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

async function listWorkspaceOwners() {
  const owners = []

  for (const scanRootName of scanRootNames) {
    const scanRoot = path.join(repoRoot, scanRootName)
    const entries = await readdir(scanRoot, { withFileTypes: true }).catch(
      () => [],
    )

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const root = path.join(scanRoot, entry.name)
      const packageJson = await readJson(path.join(root, 'package.json'))

      owners.push({
        id: `${scanRootName}/${entry.name}`,
        root,
        packageName:
          packageJson && typeof packageJson.name === 'string'
            ? packageJson.name
            : null,
      })
    }
  }

  return owners.sort((a, b) => a.id.localeCompare(b.id))
}

async function* walkSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  entries.sort((a, b) => a.name.localeCompare(b.name))

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (ignoredDirectoryNames.has(entry.name)) continue
      yield* walkSourceFiles(filePath)
      continue
    }

    if (!entry.isFile()) continue
    if (!sourceExtensions.has(path.extname(entry.name))) continue

    yield filePath
  }
}

function ownerForPath(filePath, owners) {
  const resolved = path.resolve(filePath)

  return owners.find(owner => {
    const root = path.resolve(owner.root)
    return resolved === root || resolved.startsWith(`${root}${path.sep}`)
  })
}

function stripCommentsAndStrings(source) {
  let out = ''
  let state = 'code'
  let escaped = false

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    const next = source[i + 1]

    if (state === 'code') {
      if (char === '/' && next === '/') {
        out += '  '
        state = 'lineComment'
        i += 1
        continue
      }

      if (char === '/' && next === '*') {
        out += '  '
        state = 'blockComment'
        i += 1
        continue
      }

      if (char === "'") {
        out += ' '
        state = 'singleQuote'
        escaped = false
        continue
      }

      if (char === '"') {
        out += ' '
        state = 'doubleQuote'
        escaped = false
        continue
      }

      if (char === '`') {
        out += ' '
        state = 'template'
        escaped = false
        continue
      }

      out += char
      continue
    }

    if (state === 'lineComment') {
      if (char === '\n') {
        out += '\n'
        state = 'code'
      } else {
        out += ' '
      }
      continue
    }

    if (state === 'blockComment') {
      if (char === '*' && next === '/') {
        out += '  '
        state = 'code'
        i += 1
      } else {
        out += char === '\n' ? '\n' : ' '
      }
      continue
    }

    if (
      state === 'singleQuote' ||
      state === 'doubleQuote' ||
      state === 'template'
    ) {
      const quote =
        state === 'singleQuote' ? "'" : state === 'doubleQuote' ? '"' : '`'

      if (char === '\n') {
        out += '\n'
        if (state !== 'template') state = 'code'
        escaped = false
        continue
      }

      out += ' '

      if (escaped) {
        escaped = false
        continue
      }

      if (char === '\\') {
        escaped = true
        continue
      }

      if (char === quote) {
        state = 'code'
      }
    }
  }

  return out
}

function countAnyTokens(source) {
  const codeOnly = stripCommentsAndStrings(source)
  return Array.from(codeOnly.matchAll(/\bany\b/g)).length
}

function extractImportSpecifiers(source) {
  const specifiers = new Set()
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gs,
    /\bexport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+|[*]\s+from\s+)?['"]([^'"]+)['"]/gs,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.add(match[1])
    }
  }

  return Array.from(specifiers).sort()
}

function getTsconfigPathMatchers(tsconfig) {
  const paths = tsconfig?.compilerOptions?.paths ?? {}

  return Object.entries(paths)
    .flatMap(([pattern, targets]) => {
      if (!Array.isArray(targets) || targets.length === 0) return []

      const [patternPrefix, patternSuffix = ''] = pattern.split('*')
      const target = targets[0]

      return [
        {
          pattern,
          patternPrefix,
          patternSuffix,
          target,
          weight: patternPrefix.length + patternSuffix.length,
        },
      ]
    })
    .sort((a, b) => b.weight - a.weight)
}

function matchTsconfigPath(specifier, matchers) {
  for (const matcher of matchers) {
    const hasWildcard = matcher.pattern.includes('*')

    if (!hasWildcard && specifier === matcher.pattern) {
      return path.resolve(repoRoot, matcher.target)
    }

    if (!hasWildcard) continue
    if (!specifier.startsWith(matcher.patternPrefix)) continue
    if (!specifier.endsWith(matcher.patternSuffix)) continue

    const capture = specifier.slice(
      matcher.patternPrefix.length,
      specifier.length - matcher.patternSuffix.length,
    )

    return path.resolve(repoRoot, matcher.target.replace('*', capture))
  }

  return null
}

function resolveInternalOwner({ importerPath, matchers, owners, specifier }) {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    return ownerForPath(
      path.resolve(path.dirname(importerPath), specifier),
      owners,
    )
  }

  const tsconfigPath = matchTsconfigPath(specifier, matchers)
  if (tsconfigPath) return ownerForPath(tsconfigPath, owners)

  return owners.find(
    owner =>
      owner.packageName &&
      (specifier === owner.packageName ||
        specifier.startsWith(`${owner.packageName}/`)),
  )
}

function incrementEdge(edgeMap, from, to, specifier, importerPath) {
  const key = `${from}\0${to}`
  const edge = edgeMap.get(key) ?? {
    from,
    to,
    count: 0,
    examples: [],
  }

  edge.count += 1

  if (edge.examples.length < 3) {
    edge.examples.push({
      file: toRepoPath(importerPath),
      specifier,
    })
  }

  edgeMap.set(key, edge)
}

function findStronglyConnectedComponents(nodes, edges) {
  const adjacency = new Map(nodes.map(node => [node, []]))

  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to)
  }

  const indexByNode = new Map()
  const lowlinkByNode = new Map()
  const stack = []
  const onStack = new Set()
  const components = []
  let nextIndex = 0

  function strongConnect(node) {
    indexByNode.set(node, nextIndex)
    lowlinkByNode.set(node, nextIndex)
    nextIndex += 1
    stack.push(node)
    onStack.add(node)

    for (const target of adjacency.get(node) ?? []) {
      if (!indexByNode.has(target)) {
        strongConnect(target)
        lowlinkByNode.set(
          node,
          Math.min(lowlinkByNode.get(node), lowlinkByNode.get(target)),
        )
      } else if (onStack.has(target)) {
        lowlinkByNode.set(
          node,
          Math.min(lowlinkByNode.get(node), indexByNode.get(target)),
        )
      }
    }

    if (lowlinkByNode.get(node) !== indexByNode.get(node)) return

    const component = []
    while (stack.length > 0) {
      const member = stack.pop()
      onStack.delete(member)
      component.push(member)
      if (member === node) break
    }

    if (component.length > 1) {
      components.push(component.sort())
    }
  }

  for (const node of nodes) {
    if (!indexByNode.has(node)) strongConnect(node)
  }

  return components.sort((a, b) => a.join(',').localeCompare(b.join(',')))
}

function groupByOwner(fileRecords, owners) {
  const countByOwner = new Map(owners.map(owner => [owner.id, 0]))

  for (const record of fileRecords) {
    countByOwner.set(record.owner, (countByOwner.get(record.owner) ?? 0) + 1)
  }

  return Array.from(countByOwner.entries())
    .map(([owner, count]) => ({ owner, count }))
    .filter(item => item.count > 0)
    .sort((a, b) => a.owner.localeCompare(b.owner))
}

function shouldTrackUnresolvedSpecifier(specifier) {
  return (
    specifier.startsWith('#') ||
    specifier.startsWith('@kode/') ||
    specifier === '@kode'
  )
}

function buildDependencyGraph({
  edges,
  fileRecords,
  unresolvedInternalSpecifiers,
}) {
  const graphNodes = Array.from(
    new Set([
      ...fileRecords.map(record => record.owner),
      ...edges.flatMap(edge => [edge.from, edge.to]),
    ]),
  ).sort()

  const cycles = findStronglyConnectedComponents(graphNodes, edges)

  return {
    nodes: graphNodes,
    edges,
    cycles,
    cycleCount: cycles.length,
    unresolvedInternalSpecifiers: Array.from(
      unresolvedInternalSpecifiers.entries(),
    )
      .map(([specifier, count]) => ({ specifier, count }))
      .sort(
        (a, b) => b.count - a.count || a.specifier.localeCompare(b.specifier),
      ),
  }
}

async function main() {
  const owners = await listWorkspaceOwners()
  const tsconfig = await readJson(path.join(repoRoot, 'tsconfig.json'))
  const matchers = getTsconfigPathMatchers(tsconfig)
  const fileRecords = []
  const allEdgeMap = new Map()
  const productionEdgeMap = new Map()
  const allUnresolvedInternalSpecifiers = new Map()
  const productionUnresolvedInternalSpecifiers = new Map()

  for (const scanRootName of scanRootNames) {
    for await (const filePath of walkSourceFiles(
      path.join(repoRoot, scanRootName),
    )) {
      const owner = ownerForPath(filePath, owners)
      if (!owner) continue

      const source = await readFile(filePath, 'utf8')
      const repoPath = toRepoPath(filePath)
      const isTestFile = isTestRepoPath(repoPath)
      const anyTokenCount = countAnyTokens(source)

      fileRecords.push({
        path: repoPath,
        owner: owner.id,
        isTestFile,
        anyTokenCount,
      })

      for (const specifier of extractImportSpecifiers(source)) {
        const targetOwner = resolveInternalOwner({
          importerPath: filePath,
          matchers,
          owners,
          specifier,
        })

        if (!targetOwner) {
          if (shouldTrackUnresolvedSpecifier(specifier)) {
            allUnresolvedInternalSpecifiers.set(
              specifier,
              (allUnresolvedInternalSpecifiers.get(specifier) ?? 0) + 1,
            )
            if (!isTestFile) {
              productionUnresolvedInternalSpecifiers.set(
                specifier,
                (productionUnresolvedInternalSpecifiers.get(specifier) ?? 0) +
                  1,
              )
            }
          }
          continue
        }

        if (targetOwner.id === owner.id) continue
        incrementEdge(allEdgeMap, owner.id, targetOwner.id, specifier, filePath)
        if (!isTestFile) {
          incrementEdge(
            productionEdgeMap,
            owner.id,
            targetOwner.id,
            specifier,
            filePath,
          )
        }
      }
    }
  }

  const allEdges = Array.from(allEdgeMap.values()).sort(
    (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
  )
  const productionEdges = Array.from(productionEdgeMap.values()).sort(
    (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
  )
  const productionFileRecords = fileRecords.filter(record => !record.isTestFile)
  const anyTokenCount = fileRecords.reduce(
    (sum, record) => sum + record.anyTokenCount,
    0,
  )
  const productionAnyTokenCount = productionFileRecords.reduce(
    (sum, record) => sum + record.anyTokenCount,
    0,
  )
  const topAnyFiles = fileRecords
    .filter(record => record.anyTokenCount > 0)
    .sort(
      (a, b) =>
        b.anyTokenCount - a.anyTokenCount || a.path.localeCompare(b.path),
    )
    .slice(0, 25)
  const topProductionAnyFiles = productionFileRecords
    .filter(record => record.anyTokenCount > 0)
    .sort(
      (a, b) =>
        b.anyTokenCount - a.anyTokenCount || a.path.localeCompare(b.path),
    )
    .slice(0, 25)

  const report = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    scope: {
      roots: scanRootNames,
      sourceExtensions: Array.from(sourceExtensions).sort(),
      ignoredDirectoryNames: Array.from(ignoredDirectoryNames).sort(),
    },
    files: {
      total: fileRecords.length,
      productionTotal: productionFileRecords.length,
      testTotal: fileRecords.length - productionFileRecords.length,
      byOwner: groupByOwner(fileRecords, owners),
      productionByOwner: groupByOwner(productionFileRecords, owners),
    },
    any: {
      tokenCount: anyTokenCount,
      filesWithAny: fileRecords.filter(record => record.anyTokenCount > 0)
        .length,
      topFiles: topAnyFiles.map(record => ({
        path: record.path,
        owner: record.owner,
        count: record.anyTokenCount,
      })),
      production: {
        tokenCount: productionAnyTokenCount,
        filesWithAny: productionFileRecords.filter(
          record => record.anyTokenCount > 0,
        ).length,
        topFiles: topProductionAnyFiles.map(record => ({
          path: record.path,
          owner: record.owner,
          count: record.anyTokenCount,
        })),
      },
    },
    dependencyGraph: {
      productionFiles: buildDependencyGraph({
        edges: productionEdges,
        fileRecords: productionFileRecords,
        unresolvedInternalSpecifiers: productionUnresolvedInternalSpecifiers,
      }),
      allFiles: buildDependencyGraph({
        edges: allEdges,
        fileRecords,
        unresolvedInternalSpecifiers: allUnresolvedInternalSpecifiers,
      }),
    },
  }

  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(`Refactor baseline written to ${toRepoPath(reportPath)}`)
  console.log(
    `Source files: ${report.files.total} (${report.files.productionTotal} production, ${report.files.testTotal} test)`,
  )
  console.log(
    `Any tokens: ${report.any.production.tokenCount} production / ${report.any.tokenCount} all`,
  )
  console.log(
    `Production package edges: ${report.dependencyGraph.productionFiles.edges.length}; cycles: ${report.dependencyGraph.productionFiles.cycleCount}`,
  )
  console.log(
    `All package edges: ${report.dependencyGraph.allFiles.edges.length}; cycles: ${report.dependencyGraph.allFiles.cycleCount}`,
  )

  if (report.dependencyGraph.productionFiles.cycleCount > 0) {
    for (const cycle of report.dependencyGraph.productionFiles.cycles.slice(
      0,
      10,
    )) {
      console.log(`  cycle: ${cycle.join(' -> ')}`)
    }
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
