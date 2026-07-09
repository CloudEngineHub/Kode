import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { parseConfigFileTextToJson } from 'typescript'

const ROOT_DIR = process.cwd()
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])

type BoundaryViolation = {
  file: string
  specifier: string
}

type WorkspacePackage = {
  name: string
  root: string
  dependencies: Set<string>
}

function collectSourceFiles(root: string, options?: { exclude?: string[] }) {
  const absoluteRoot = join(ROOT_DIR, root)
  const excluded = new Set(options?.exclude ?? [])
  const files: string[] = []

  function visit(path: string) {
    const relativePath = relative(ROOT_DIR, path).split(sep).join('/')
    if (excluded.has(relativePath)) return

    const stat = statSync(path)
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) {
        visit(join(path, entry))
      }
      return
    }

    const extension = path.endsWith('.tsx')
      ? '.tsx'
      : path.endsWith('.ts')
        ? '.ts'
        : ''
    if (SOURCE_EXTENSIONS.has(extension)) {
      files.push(path)
    }
  }

  visit(absoluteRoot)
  return files
}

function extractImportSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const importPattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2] ?? match[3]
    if (specifier) specifiers.push(specifier)
  }

  return specifiers
}

function isProductionSourceFile(file: string): boolean {
  const repoPath = relative(ROOT_DIR, file).split(sep).join('/')
  return (
    !/(^|\/)(__tests__|test|tests|test-helpers|test-utils)\//.test(repoPath) &&
    !/\.(test|spec)\.[cm]?[jt]sx?$/.test(repoPath)
  )
}

function listWorkspacePackages(): WorkspacePackage[] {
  const packages: WorkspacePackage[] = []

  for (const workspaceRoot of ['apps', 'packages']) {
    for (const entry of readdirSync(join(ROOT_DIR, workspaceRoot))) {
      const root = join(ROOT_DIR, workspaceRoot, entry)
      const packageJsonPath = join(root, 'package.json')
      if (!existsSync(packageJsonPath)) continue

      const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
        name?: unknown
        dependencies?: Record<string, string>
      }
      if (typeof manifest.name !== 'string') continue

      packages.push({
        name: manifest.name,
        root,
        dependencies: new Set(Object.keys(manifest.dependencies ?? {})),
      })
    }
  }

  return packages.sort((a, b) => a.name.localeCompare(b.name))
}

function getTsconfigAliasOwners(
  packages: WorkspacePackage[],
): Array<{ pattern: string; owner: string }> {
  const tsconfig = JSON.parse(
    readFileSync(join(ROOT_DIR, 'tsconfig.json'), 'utf8'),
  ) as { compilerOptions?: { paths?: Record<string, string[]> } }

  return Object.entries(tsconfig.compilerOptions?.paths ?? {}).flatMap(
    ([pattern, targets]) => {
      const firstTarget = targets[0]
      if (!firstTarget) return []

      const targetRoot = resolve(ROOT_DIR, firstTarget.replace(/\*.*$/, ''))
      const owner = packages.find(pkg => {
        const packageRoot = resolve(pkg.root)
        return (
          targetRoot === packageRoot ||
          targetRoot.startsWith(`${packageRoot}${sep}`)
        )
      })

      return owner ? [{ pattern, owner: owner.name }] : []
    },
  )
}

function matchesAliasPattern(specifier: string, pattern: string): boolean {
  const wildcardIndex = pattern.indexOf('*')
  if (wildcardIndex === -1) return specifier === pattern

  const prefix = pattern.slice(0, wildcardIndex)
  const suffix = pattern.slice(wildcardIndex + 1)
  return specifier.startsWith(prefix) && specifier.endsWith(suffix)
}

function resolveWorkspaceImport(args: {
  aliases: Array<{ pattern: string; owner: string }>
  importer: string
  packages: WorkspacePackage[]
  specifier: string
}): string | null {
  const directPackage = args.packages.find(
    pkg =>
      args.specifier === pkg.name || args.specifier.startsWith(`${pkg.name}/`),
  )
  if (directPackage) return directPackage.name

  const alias = args.aliases.find(candidate =>
    matchesAliasPattern(args.specifier, candidate.pattern),
  )
  if (alias) return alias.owner

  if (!args.specifier.startsWith('.')) return null
  const target = resolve(args.importer, '..', args.specifier)
  return (
    args.packages.find(pkg => {
      const packageRoot = resolve(pkg.root)
      return target === packageRoot || target.startsWith(`${packageRoot}${sep}`)
    })?.name ?? null
  )
}

function collectProductionDependencyEdges(
  packages: WorkspacePackage[],
): Map<string, Set<string>> {
  const aliases = getTsconfigAliasOwners(packages)
  const edges = new Map(packages.map(pkg => [pkg.name, new Set<string>()]))

  for (const pkg of packages) {
    const sourceRoot = join(pkg.root, 'src')
    if (!existsSync(sourceRoot)) continue

    for (const file of collectSourceFiles(relative(ROOT_DIR, sourceRoot))) {
      if (!isProductionSourceFile(file)) continue

      const source = readFileSync(file, 'utf8')
      for (const specifier of extractImportSpecifiers(source)) {
        const target = resolveWorkspaceImport({
          aliases,
          importer: file,
          packages,
          specifier,
        })
        if (target && target !== pkg.name) edges.get(pkg.name)?.add(target)
      }
    }
  }

  return edges
}

function findDependencyCycles(edges: Map<string, Set<string>>): string[][] {
  const cycles = new Set<string>()
  const active: string[] = []
  const visited = new Set<string>()

  function visit(node: string): void {
    const activeIndex = active.indexOf(node)
    if (activeIndex !== -1) {
      cycles.add([...active.slice(activeIndex), node].join(' -> '))
      return
    }
    if (visited.has(node)) return

    active.push(node)
    for (const target of edges.get(node) ?? []) visit(target)
    active.pop()
    visited.add(node)
  }

  for (const node of edges.keys()) visit(node)
  return Array.from(cycles)
    .sort()
    .map(cycle => cycle.split(' -> '))
}

function findForbiddenImports(
  root: string,
  isForbidden: (specifier: string) => boolean,
  options?: { exclude?: string[] },
): BoundaryViolation[] {
  return collectSourceFiles(root, options).flatMap(file => {
    const source = readFileSync(file, 'utf8')
    const relativeFile = relative(ROOT_DIR, file).split(sep).join('/')

    return extractImportSpecifiers(source)
      .filter(isForbidden)
      .map(specifier => ({ file: relativeFile, specifier }))
  })
}

function startsWithAny(specifier: string, prefixes: string[]) {
  return prefixes.some(
    prefix => specifier === prefix || specifier.startsWith(prefix + '/'),
  )
}

describe('package boundaries', () => {
  test('keeps bun.lock workspace metadata aligned with manifests', () => {
    const packages = listWorkspacePackages()
    const packageNames = new Set(packages.map(pkg => pkg.name))
    const lockResult = parseConfigFileTextToJson(
      'bun.lock',
      readFileSync(join(ROOT_DIR, 'bun.lock'), 'utf8'),
    )
    expect(lockResult.error).toBeUndefined()

    const lockWorkspaces = (
      lockResult.config as {
        workspaces?: Record<string, { dependencies?: Record<string, string> }>
      }
    ).workspaces
    const mismatches: string[] = []

    for (const pkg of packages) {
      const workspacePath = relative(ROOT_DIR, pkg.root).split(sep).join('/')
      const lockedDependencies = new Set(
        Object.keys(lockWorkspaces?.[workspacePath]?.dependencies ?? {}).filter(
          dependency => packageNames.has(dependency),
        ),
      )
      const manifestDependencies = new Set(
        Array.from(pkg.dependencies).filter(dependency =>
          packageNames.has(dependency),
        ),
      )

      const locked = Array.from(lockedDependencies).sort()
      const manifest = Array.from(manifestDependencies).sort()
      if (JSON.stringify(locked) !== JSON.stringify(manifest)) {
        mismatches.push(
          `${pkg.name}: manifest [${manifest.join(', ')}], lock [${locked.join(', ')}]`,
        )
      }
    }

    expect(mismatches).toEqual([])
  })

  test('keeps workspace manifests aligned with production imports', () => {
    const packages = listWorkspacePackages()
    const packageNames = new Set(packages.map(pkg => pkg.name))
    const edges = collectProductionDependencyEdges(packages)
    const mismatches: string[] = []

    for (const pkg of packages) {
      const imported = edges.get(pkg.name) ?? new Set<string>()
      const declared = new Set(
        Array.from(pkg.dependencies).filter(dependency =>
          packageNames.has(dependency),
        ),
      )
      const missing = Array.from(imported)
        .filter(dependency => !declared.has(dependency))
        .sort()
      const stale = Array.from(declared)
        .filter(dependency => !imported.has(dependency))
        .sort()

      if (missing.length > 0) {
        mismatches.push(`${pkg.name}: missing ${missing.join(', ')}`)
      }
      if (stale.length > 0) {
        mismatches.push(`${pkg.name}: stale ${stale.join(', ')}`)
      }
    }

    expect(mismatches).toEqual([])
  })

  test('keeps the production workspace dependency graph acyclic', () => {
    const packages = listWorkspacePackages()
    expect(
      findDependencyCycles(collectProductionDependencyEdges(packages)),
    ).toEqual([])
  })

  test('keeps production core independent from @kode/ai', () => {
    const violations = findForbiddenImports(
      'packages/core/src',
      specifier => startsWithAny(specifier, ['@kode/ai']),
      {
        exclude: [
          'packages/core/src/test',
          'packages/core/src/test-helpers',
          'packages/core/src/test-utils',
        ],
      },
    )

    expect(violations).toEqual([])
  })

  test('keeps tool-interface free of concrete runtime and UI packages', () => {
    const violations = findForbiddenImports(
      'packages/tool-interface/src',
      specifier =>
        startsWithAny(specifier, [
          '@kode/ai',
          '@kode/core',
          '@kode/runtime',
          '@kode/tools',
          '#core',
          '#runtime',
          '#tools',
          '#ui-ink',
          'ink',
          'react',
        ]),
    )

    expect(violations).toEqual([])
  })

  test('keeps @kode/ai free of UI, tool, and runtime packages', () => {
    const violations = findForbiddenImports('packages/ai/src', specifier =>
      startsWithAny(specifier, [
        '@kode/runtime',
        '@kode/tools',
        '#runtime',
        '#tools',
        '#ui-ink',
        'ink',
        'react',
      ]),
    )

    expect(violations).toEqual([])
  })
})
