#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function findPackageRoot(startDir) {
  let dir = startDir
  for (let i = 0; i < 25; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return startDir
}

function readPackageJson(packageRoot) {
  try {
    const p = path.join(packageRoot, 'package.json')
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    env: { ...process.env, KODE_PACKAGED: process.env.KODE_PACKAGED || '1' },
  })
  if (result.error) {
    throw result.error
  }
  process.exit(typeof result.status === 'number' ? result.status : 1)
}

function main() {
  const packageRoot = findPackageRoot(__dirname)
  const pkg = readPackageJson(packageRoot)
  const version = pkg?.version || ''

  // Prefer native binary if present, but route through the JS entry with --acp
  // so both dev and packaged layouts behave the same.
  const distEntry = path.join(packageRoot, 'dist', 'index.js')
  if (fs.existsSync(distEntry)) {
    run(process.execPath, [distEntry, '--acp', ...process.argv.slice(2)])
  }

  process.stderr.write(
    [
      '❌ kode-acp is not runnable on this system.',
      '',
      'Tried:',
      '- Node.js runtime fallback',
      '',
      'Fix:',
      '- Run from source: bun run apps/cli/src/dispatch.ts --acp',
      '',
      version ? `Package version: ${version}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  )
  process.exit(1)
}

main()
