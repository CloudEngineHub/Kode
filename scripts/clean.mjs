#!/usr/bin/env bun
import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const artifacts = [
  'dist',
  'cli.js',
  'cli-acp.js',
  'mcp-cli.js',
  'apps/web/dist',
  'apps/server/static',
  'vendor',
  'artifacts',
  'seccomp-assets',
  '.tmp',
]

for (const entry of readdirSync('packages', { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  if (entry.name.startsWith('kode-bin-')) {
    artifacts.push(
      join('packages', entry.name, 'bin', 'kode'),
      join('packages', entry.name, 'bin', 'kode.exe'),
    )
  }
  if (entry.name.startsWith('kode-ripgrep-')) {
    artifacts.push(
      join('packages', entry.name, 'bin', 'rg'),
      join('packages', entry.name, 'bin', 'rg.exe'),
    )
  }
}

artifacts.push(...readdirSync('.').filter(entry => entry.endsWith('.tgz')))

for (const target of artifacts) {
  try {
    rmSync(target, { recursive: true, force: true })
  } catch {}
}

console.log('✅ Cleaned build artifacts:', artifacts.join(', '))
