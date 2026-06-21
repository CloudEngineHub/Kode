#!/usr/bin/env node
import { chmodSync, cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import * as esbuild from 'esbuild'

const OUT_DIR = 'dist'

console.log('🧠 Building CLI…')

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(join(OUT_DIR, 'entrypoints'), { recursive: true })
mkdirSync(join(OUT_DIR, 'sdk'), { recursive: true })

await esbuild.build({
  entryPoints: {
    index: 'apps/cli/src/dispatch.ts',
    'entrypoints/cli': 'apps/cli/src/entrypoints/cli.ts',
    'entrypoints/mcp': 'packages/core/src/mcp/index.ts',
    'entrypoints/daemon': 'apps/cli/src/entrypoints/daemon.ts',
  },
  outdir: OUT_DIR,
  bundle: true,
  platform: 'node',
  format: 'esm',
  splitting: true,
  sourcemap: 'external',
  target: ['node20'],
  tsconfig: 'tsconfig.json',
  packages: 'external',
  entryNames: '[dir]/[name]',
  chunkNames: 'chunks/[name]-[hash]',
  minify: false,
})

cpSync(join('scripts', 'cli-wrapper.cjs'), 'cli.js')
try {
  chmodSync('cli.js', 0o755)
} catch {}

cpSync(join('scripts', 'cli-acp-wrapper.cjs'), 'cli-acp.js')
try {
  chmodSync('cli-acp.js', 0o755)
} catch {}

console.log('✅ CLI built')
console.log('  - dist/index.js')
console.log('  - cli.js')
console.log('  - cli-acp.js')
