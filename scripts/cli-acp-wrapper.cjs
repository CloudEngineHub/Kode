#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function tryResolveNativeBinaryFromOptionalDeps() {
  const platform = process.platform
  const arch = process.arch

  const candidates = [`@shareai-lab/kode-bin-${platform}-${arch}`]

  if (platform === 'win32' && arch === 'arm64') {
    candidates.push('@shareai-lab/kode-bin-win32-x64')
  }

  for (const pkgName of candidates) {
    try {
      // eslint-disable-next-line import/no-dynamic-require
      const mod = require(pkgName)
      const binPath = mod?.kodePath
      if (typeof binPath === 'string' && fs.existsSync(binPath)) {
        return binPath
      }
    } catch {}
  }

  return null
}

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

  const args = ['--acp', ...process.argv.slice(2)]

  // Native binary (npm optionalDependencies, no GitHub postinstall).
  const nativeBin = tryResolveNativeBinaryFromOptionalDeps()
  if (nativeBin) {
    run(nativeBin, args)
  }

  // Node.js runtime fallback.
  const distEntry = path.join(packageRoot, 'dist', 'index.js')
  if (fs.existsSync(distEntry)) {
    run(process.execPath, [distEntry, ...args])
  }

  process.stderr.write(
    [
      '❌ kode-acp is not runnable on this system.',
      '',
      'Tried:',
      '- Native binary (optionalDependencies)',
      '- Node.js runtime fallback',
      '',
      'Fix:',
      '- Reinstall with optionalDependencies enabled (avoid --no-optional/--omit=optional)',
      '- Or install a platform binary package: @shareai-lab/kode-bin-<platform>-<arch>',
      '- Or run from source: bun run apps/cli/src/dispatch.ts --acp',
      '',
      version ? `Package version: ${version}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  )
  process.exit(1)
}

if (require.main === module) {
  main()
}

module.exports = { main }
