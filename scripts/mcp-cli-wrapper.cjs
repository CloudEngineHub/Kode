#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function tryResolveNativeBinaryFromOptionalDeps() {
  const platform = process.platform
  const arch = process.arch

  const candidates = [`@shareai-lab/kode-bin-${platform}-${arch}`]

  // Windows ARM64 can usually run x64 binaries via emulation, so offer a fallback.
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

  // Native binary (npm optionalDependencies, no GitHub postinstall).
  const nativeBin = tryResolveNativeBinaryFromOptionalDeps()
  if (nativeBin) {
    run(nativeBin, ['--mcp-cli', ...process.argv.slice(2)])
  }

  // Node.js runtime fallback.
  const distEntry = path.join(packageRoot, 'dist', 'index.js')
  if (fs.existsSync(distEntry)) {
    run(process.execPath, [distEntry, '--mcp-cli', ...process.argv.slice(2)])
  }

  process.stderr.write(
    [
      '❌ mcp-cli is not runnable on this system.',
      '',
      'Tried:',
      '- Native binary (optionalDependencies)',
      '- Node.js runtime (dist/index.js)',
      '',
      'Fix:',
      '- Reinstall with optionalDependencies enabled (avoid --no-optional/--omit=optional)',
      '- Or install a platform binary package: @shareai-lab/kode-bin-<platform>-<arch>',
      '- Or reinstall and ensure dist/ is present (npm install -g @shareai-lab/kode)',
    ].join('\n'),
  )
  process.exit(1)
}

if (require.main === module) {
  main()
}

module.exports = { main }
