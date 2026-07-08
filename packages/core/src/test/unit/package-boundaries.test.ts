import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, test } from 'bun:test'

const ROOT_DIR = process.cwd()
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])

type BoundaryViolation = {
  file: string
  specifier: string
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
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2]
    if (specifier) specifiers.push(specifier)
  }

  return specifiers
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
