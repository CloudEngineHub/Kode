#!/usr/bin/env bun
import esbuild from 'esbuild'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

function toPosixPath(value) {
  return value.replaceAll('\\', '/')
}

function isDirectory(path) {
  try {
    return existsSync(path) && statSync(path).isDirectory()
  } catch {
    return false
  }
}

function walkFiles(rootDir) {
  const out = []
  const stack = [rootDir]
  while (stack.length) {
    const current = stack.pop()
    if (!current) continue
    const entries = readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (!entry.isFile()) continue
      if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) continue
      out.push(fullPath)
    }
  }
  return out
}

function normalizeToRepoRelative(filePath) {
  const rel = toPosixPath(relative(process.cwd(), filePath))
  return rel.startsWith('./') ? rel.slice(2) : rel
}

function resolveWithExtensions(basePath) {
  if (existsSync(basePath) && statSync(basePath).isFile()) return basePath

  const exts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
  for (const ext of exts) {
    const candidate = basePath + ext
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }

  if (existsSync(basePath) && statSync(basePath).isDirectory()) {
    for (const ext of exts) {
      const candidate = join(basePath, 'index' + ext)
      if (existsSync(candidate) && statSync(candidate).isFile())
        return candidate
    }
  }

  return null
}

function readTsconfigPaths() {
  try {
    const raw = readFileSync(join(process.cwd(), 'tsconfig.json'), 'utf8')
    const json = JSON.parse(raw)
    const paths = json?.compilerOptions?.paths
    if (!paths || typeof paths !== 'object') return []
    return Object.entries(paths)
      .filter(
        ([key, targets]) =>
          typeof key === 'string' &&
          key.startsWith('#') &&
          Array.isArray(targets),
      )
      .map(([key, targets]) => {
        const first = targets.find(t => typeof t === 'string')
        return typeof first === 'string' ? { key, target: first } : null
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

function tsconfigPathsPlugin() {
  const mappings = readTsconfigPaths()
  if (mappings.length === 0) return null

  return {
    name: 'tsconfig-paths',
    setup(build) {
      build.onResolve({ filter: /^#/ }, args => {
        for (const { key, target } of mappings) {
          const hasStar = key.includes('*')
          if (!hasStar) {
            if (args.path !== key) continue
            const candidate = resolveWithExtensions(
              resolve(process.cwd(), target),
            )
            if (candidate) return { path: candidate }
            continue
          }

          const [prefix, suffix] = key.split('*')
          if (!args.path.startsWith(prefix) || !args.path.endsWith(suffix))
            continue
          const matched = args.path.slice(
            prefix.length,
            args.path.length - suffix.length,
          )

          const targetPattern = target.includes('*') ? target : target + '*'
          const replaced = targetPattern.replace('*', matched)
          const candidate = resolveWithExtensions(
            resolve(process.cwd(), replaced),
          )
          if (candidate) return { path: candidate }
        }
        return null
      })
    },
  }
}

function guessDefaultEntrypoints() {
  return ['apps/cli/src/dispatch.ts']
}

function guessDefaultSourceRoots() {
  const candidates = ['apps', 'packages']
  return candidates.filter(d => isDirectory(join(process.cwd(), d)))
}

export async function analyzeReachability(options = {}) {
  const entrypoints = Array.isArray(options.entrypoints)
    ? options.entrypoints
    : guessDefaultEntrypoints()

  const sourceRoots = Array.isArray(options.sourceRoots)
    ? options.sourceRoots
    : guessDefaultSourceRoots()

  const outFile =
    typeof options.outFile === 'string' && options.outFile.trim()
      ? options.outFile.trim()
      : '.tmp/reachability/report.json'

  const result = await esbuild.build({
    entryPoints: entrypoints,
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    metafile: true,
    logLevel: 'silent',
    plugins: [tsconfigPathsPlugin()].filter(Boolean),
  })

  const inputs = Object.keys(result.metafile?.inputs ?? {})
  const reachable = inputs
    .map(p => (resolve(p) === p ? p : resolve(process.cwd(), p)))
    .map(normalizeToRepoRelative)
    .filter(p => sourceRoots.some(root => p.startsWith(`${root}/`)))
    .sort()

  const allSourceFiles = sourceRoots
    .flatMap(root => {
      const abs = join(process.cwd(), root)
      if (!isDirectory(abs)) return []
      return walkFiles(abs)
    })
    .map(normalizeToRepoRelative)
    .sort()

  const reachableSet = new Set(reachable)
  const unreachable = allSourceFiles.filter(p => !reachableSet.has(p))

  const report = {
    generatedAt: new Date().toISOString(),
    entrypoints,
    reachable,
    unreachable,
    counts: {
      reachable: reachable.length,
      unreachable: unreachable.length,
      total: allSourceFiles.length,
    },
  }

  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n', 'utf8')

  return { outFile, report }
}

async function main() {
  const args = process.argv.slice(2)
  const entrypoints = []
  const roots = []
  let outFile

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--entry' && args[i + 1]) {
      entrypoints.push(args[i + 1])
      i++
      continue
    }
    if (arg === '--root' && args[i + 1]) {
      roots.push(args[i + 1])
      i++
      continue
    }
    if (arg === '--out' && args[i + 1]) {
      outFile = args[i + 1]
      i++
      continue
    }
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        [
          'Usage: bun scripts/analyze-reachability.mjs [--entry <file>]... [--root <dir>]... [--out <file>]',
          '',
          'Defaults:',
          `  --entry ${guessDefaultEntrypoints().join(', ')}`,
          `  --root  ${guessDefaultSourceRoots().join(', ')}`,
          '  --out   .tmp/reachability/report.json',
          '',
        ].join('\n'),
      )
      process.exit(0)
    }
  }

  const { outFile: written, report } = await analyzeReachability({
    entrypoints: entrypoints.length ? entrypoints : undefined,
    sourceRoots: roots.length ? roots : undefined,
    outFile,
  })

  process.stdout.write(
    `Reachability report written: ${written}\n` +
      `- entrypoints: ${report.entrypoints.join(', ')}\n` +
      `- reachable:   ${report.counts.reachable}\n` +
      `- unreachable: ${report.counts.unreachable}\n`,
  )
}

if (import.meta.main) {
  main().catch(err => {
    console.error(
      'analyze-reachability failed:',
      err instanceof Error ? err.message : String(err),
    )
    process.exit(1)
  })
}
