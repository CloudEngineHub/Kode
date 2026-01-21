#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const vendorRoot = path.join(rootDir, 'vendor', 'ripgrep')

const mappings = [
  {
    vendorId: 'arm64-darwin',
    pkgDir: 'packages/kode-ripgrep-darwin-arm64',
    exe: 'rg',
  },
  {
    vendorId: 'x64-darwin',
    pkgDir: 'packages/kode-ripgrep-darwin-x64',
    exe: 'rg',
  },
  {
    vendorId: 'arm64-linux',
    pkgDir: 'packages/kode-ripgrep-linux-arm64',
    exe: 'rg',
  },
  {
    vendorId: 'x64-linux',
    pkgDir: 'packages/kode-ripgrep-linux-x64',
    exe: 'rg',
  },
  {
    vendorId: 'arm64-win32',
    pkgDir: 'packages/kode-ripgrep-win32-arm64',
    exe: 'rg.exe',
  },
  {
    vendorId: 'x64-win32',
    pkgDir: 'packages/kode-ripgrep-win32-x64',
    exe: 'rg.exe',
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

function main() {
  if (!fs.existsSync(vendorRoot)) {
    console.error(`❌ Missing vendor ripgrep directory: ${vendorRoot}`)
    console.error('   Run: bun run scripts/ensure-ripgrep.mjs')
    process.exit(1)
  }

  const copied = []
  for (const m of mappings) {
    const src = path.join(vendorRoot, m.vendorId, m.exe)
    if (!fileExistsNonEmpty(src)) {
      console.error(`❌ Missing vendor ripgrep binary: ${src}`)
      console.error('   Run: bun run scripts/ensure-ripgrep.mjs')
      process.exit(1)
    }

    const destDir = path.join(rootDir, m.pkgDir, 'bin')
    const dest = path.join(destDir, m.exe)
    ensureDir(destDir)
    fs.copyFileSync(src, dest)
    ensureExecutable(dest)
    copied.push({ vendorId: m.vendorId, dest })
  }

  console.log(
    `✅ Prepared ripgrep platform packages (${copied.length} binaries)`,
  )
  for (const item of copied) {
    console.log(`   - ${item.vendorId} -> ${item.dest}`)
  }
}

main()
