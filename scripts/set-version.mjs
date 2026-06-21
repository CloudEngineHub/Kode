#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()

const ripgrepPackages = [
  {
    name: '@shareai-lab/kode-ripgrep-darwin-arm64',
    dir: 'packages/kode-ripgrep-darwin-arm64',
  },
  {
    name: '@shareai-lab/kode-ripgrep-darwin-x64',
    dir: 'packages/kode-ripgrep-darwin-x64',
  },
  {
    name: '@shareai-lab/kode-ripgrep-linux-arm64',
    dir: 'packages/kode-ripgrep-linux-arm64',
  },
  {
    name: '@shareai-lab/kode-ripgrep-linux-x64',
    dir: 'packages/kode-ripgrep-linux-x64',
  },
  {
    name: '@shareai-lab/kode-ripgrep-win32-arm64',
    dir: 'packages/kode-ripgrep-win32-arm64',
  },
  {
    name: '@shareai-lab/kode-ripgrep-win32-x64',
    dir: 'packages/kode-ripgrep-win32-x64',
  },
]

const binaryPackages = [
  {
    name: '@shareai-lab/kode-bin-darwin-arm64',
    dir: 'packages/kode-bin-darwin-arm64',
  },
  {
    name: '@shareai-lab/kode-bin-darwin-x64',
    dir: 'packages/kode-bin-darwin-x64',
  },
  {
    name: '@shareai-lab/kode-bin-linux-arm64',
    dir: 'packages/kode-bin-linux-arm64',
  },
  {
    name: '@shareai-lab/kode-bin-linux-x64',
    dir: 'packages/kode-bin-linux-x64',
  },
  {
    name: '@shareai-lab/kode-bin-win32-arm64',
    dir: 'packages/kode-bin-win32-arm64',
  },
  {
    name: '@shareai-lab/kode-bin-win32-x64',
    dir: 'packages/kode-bin-win32-x64',
  },
]

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n')
}

const managedPackages = [...ripgrepPackages, ...binaryPackages]

function main() {
  const rootPkgPath = path.join(rootDir, 'package.json')
  const rootPkg = readJson(rootPkgPath)

  const requested = process.argv[2]
  const version = requested || rootPkg.version
  if (!version || typeof version !== 'string') {
    console.error('Usage: scripts/set-version.mjs <version>')
    process.exit(1)
  }

  rootPkg.version = version
  rootPkg.optionalDependencies = rootPkg.optionalDependencies || {}
  for (const pkg of managedPackages) {
    rootPkg.optionalDependencies[pkg.name] = version
  }
  writeJson(rootPkgPath, rootPkg)

  for (const pkg of managedPackages) {
    const pkgJsonPath = path.join(rootDir, pkg.dir, 'package.json')
    const pkgJson = readJson(pkgJsonPath)
    pkgJson.version = version
    writeJson(pkgJsonPath, pkgJson)
  }

  console.log(`✅ Synced versions to ${version}`)
}

main()
