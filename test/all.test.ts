// Aggregates workspace tests so `bun test` from repo root doesn't accidentally
// execute non-workspace script-style files (e.g. `kode-agent-sdk/tests/*.test.ts`).

import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

async function importWorkspaceTests(): Promise<void> {
  const thisDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
  const repoRoot = resolve(thisDir, '..')

  const patterns = [
    'apps/**/*.test.ts',
    'apps/**/*.test.tsx',
    'apps/**/*.spec.ts',
    'apps/**/*.spec.tsx',
    'packages/**/*.test.ts',
    'packages/**/*.test.tsx',
    'packages/**/*.spec.ts',
    'packages/**/*.spec.tsx',
  ]

  const files = new Set<string>()
  for (const pattern of patterns) {
    const glob = new Bun.Glob(pattern)
    for await (const relPath of glob.scan(repoRoot)) {
      files.add(relPath)
    }
  }

  const sorted = Array.from(files).sort()
  for (const relPath of sorted) {
    const absPath = resolve(repoRoot, relPath)
    await import(pathToFileURL(absPath).href)
  }
}

await importWorkspaceTests()
