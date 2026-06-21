#!/usr/bin/env bun
import { rmSync } from 'node:fs'

const artifacts = ['dist', 'cli.js', 'cli-acp.js', 'vendor', '.tmp']

for (const target of artifacts) {
  try {
    rmSync(target, { recursive: true, force: true })
  } catch {}
}

console.log('✅ Cleaned build artifacts:', artifacts.join(', '))
