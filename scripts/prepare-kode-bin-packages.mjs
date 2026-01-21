#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()

const mappings = [
  {
    platform: 'darwin',
    arch: 'arm64',
    pkgDir: 'packages/kode-bin-darwin-arm64',
    exe: 'kode',
  },
  {
    platform: 'darwin',
    arch: 'x64',
    pkgDir: 'packages/kode-bin-darwin-x64',
    exe: 'kode',
  },
  {
    platform: 'linux',
    arch: 'arm64',
    pkgDir: 'packages/kode-bin-linux-arm64',
    exe: 'kode',
  },
  {
    platform: 'linux',
    arch: 'x64',
    pkgDir: 'packages/kode-bin-linux-x64',
    exe: 'kode',
  },
  {
    platform: 'win32',
    arch: 'arm64',
    pkgDir: 'packages/kode-bin-win32-arm64',
    exe: 'kode.exe',
    fallbackFrom: { platform: 'win32', arch: 'x64' },
  },
  {
    platform: 'win32',
    arch: 'x64',
    pkgDir: 'packages/kode-bin-win32-x64',
    exe: 'kode.exe',
  },
]

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function ensureExecutable(filePath) {
  if (filePath.endsWith('.exe')) return
  try {
    fs.chmodSync(filePath, 0o755)
  } catch {
    // best-effort
  }
}

function fileExistsNonEmpty(filePath) {
  try {
    const st = fs.statSync(filePath)
    return st.isFile() && st.size > 0
  } catch {
    return false
  }
}

function findFirstByName(startDir, filename, maxDepth) {
  if (!fs.existsSync(startDir)) return null

  const stack = [{ dir: startDir, depth: 0 }]
  while (stack.length > 0) {
    const next = stack.pop()
    if (!next) break

    const { dir, depth } = next
    if (depth > maxDepth) continue

    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isFile() && ent.name === filename) return full
      if (ent.isDirectory()) stack.push({ dir: full, depth: depth + 1 })
    }
  }

  return null
}

function assetNameFor(platform, arch) {
  const ext = platform === 'win32' ? '.exe' : ''
  return `kode-${platform}-${arch}${ext}`
}

function findSourceBinary(platform, arch) {
  const ext = platform === 'win32' ? '.exe' : ''

  const distCandidate = path.join(
    rootDir,
    'dist',
    'bin',
    `${platform}-${arch}`,
    `kode${ext}`,
  )
  if (fileExistsNonEmpty(distCandidate)) return distCandidate

  const localAsset = path.join(rootDir, assetNameFor(platform, arch))
  if (fileExistsNonEmpty(localAsset)) return localAsset

  const artifactsRoot = path.join(rootDir, 'artifacts')
  const fromArtifacts = findFirstByName(
    artifactsRoot,
    assetNameFor(platform, arch),
    4,
  )
  if (fromArtifacts && fileExistsNonEmpty(fromArtifacts)) return fromArtifacts

  return null
}

function main() {
  const copied = []
  const missing = []

  for (const m of mappings) {
    let src = findSourceBinary(m.platform, m.arch)
    if (!src && m.fallbackFrom) {
      src = findSourceBinary(m.fallbackFrom.platform, m.fallbackFrom.arch)
    }

    if (!src) {
      missing.push(`${m.platform}-${m.arch}`)
      continue
    }

    const destDir = path.join(rootDir, m.pkgDir, 'bin')
    const dest = path.join(destDir, m.exe)
    ensureDir(destDir)
    fs.copyFileSync(src, dest)
    ensureExecutable(dest)
    copied.push({ target: `${m.platform}-${m.arch}`, dest })
  }

  if (missing.length > 0) {
    console.error('❌ Missing Kode native binaries for:')
    for (const item of missing) console.error(`   - ${item}`)
    console.error(
      '   Build binaries first (CI artifacts or local dist/bin/<platform>-<arch>/kode).',
    )
    process.exit(1)
  }

  console.log(
    `✅ Prepared Kode binary platform packages (${copied.length} binaries)`,
  )
  for (const item of copied) {
    console.log(`   - ${item.target} -> ${item.dest}`)
  }
}

main()
