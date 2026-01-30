#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

function getFlagValue(flag) {
  const idx = process.argv.indexOf(flag)
  if (idx === -1) return null
  const value = process.argv[idx + 1]
  if (!value || value.startsWith('-')) return null
  return value
}

function fileExistsNonEmpty(filePath) {
  try {
    const st = fs.statSync(filePath)
    return st.isFile() && st.size > 0
  } catch {
    return false
  }
}

function copyFileOrThrow(src, dest) {
  if (!fileExistsNonEmpty(src)) {
    throw new Error(`Missing seccomp asset: ${src}`)
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

function main() {
  const artifactsDir = getFlagValue('--artifacts-dir') ?? 'artifacts'
  const destRoot = getFlagValue('--dest-root') ?? path.join('vendor', 'seccomp')

  const mappings = [
    {
      arch: 'x64',
      srcDir: path.join(artifactsDir, 'seccomp-assets', 'linux-x64'),
    },
    {
      arch: 'arm64',
      srcDir: path.join(artifactsDir, 'seccomp-assets', 'linux-arm64'),
    },
  ]

  const copied = []
  for (const m of mappings) {
    const srcApply = path.join(m.srcDir, 'apply-seccomp')
    const srcBpf = path.join(m.srcDir, 'unix-block.bpf')

    const destDir = path.join(destRoot, m.arch)
    copyFileOrThrow(srcApply, path.join(destDir, 'apply-seccomp'))
    copyFileOrThrow(srcBpf, path.join(destDir, 'unix-block.bpf'))
    try {
      fs.chmodSync(path.join(destDir, 'apply-seccomp'), 0o755)
    } catch {
      // best-effort
    }
    copied.push(destDir)
  }

  console.log(`✅ Prepared seccomp assets (${copied.length} arch dirs)`)
  for (const dir of copied) console.log(`   - ${dir}`)
}

main()
