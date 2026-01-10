#!/usr/bin/env node
import { rmSync } from 'node:fs'
import * as esbuild from 'esbuild'

console.log('🛰️  Building server…')

// Keep outputs in dist/server to avoid clobbering existing CLI outputs.
rmSync('dist/server', { recursive: true, force: true })

await esbuild.build({
  entryPoints: {
    'server/index': 'apps/server/src/index.ts',
  },
  outdir: 'dist',
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

console.log('✅ Server built')
console.log('  - dist/server/index.js')
