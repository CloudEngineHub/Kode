#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function getFlagValue(flag) {
  const idx = process.argv.indexOf(flag)
  if (idx === -1) return null
  const value = process.argv[idx + 1]
  if (!value || value.startsWith('-')) return null
  return value
}

function hasFlag(flag) {
  return process.argv.includes(flag)
}

function runOrThrow(cmd, args, options) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...options })
  if (res.error) throw res.error
  if (res.status !== 0) {
    throw new Error(`Command failed (${res.status}): ${cmd} ${args.join(' ')}`)
  }
}

function detectArch() {
  switch (process.arch) {
    case 'x64':
    case 'x86_64':
      return 'x64'
    case 'arm64':
    case 'aarch64':
      return 'arm64'
    default:
      return null
  }
}

function main() {
  const outRoot = getFlagValue('--out-root') ?? path.join('vendor', 'seccomp')
  const requireBuild = hasFlag('--require')

  if (process.platform !== 'linux') {
    if (hasFlag('--verbose')) {
      console.log('[seccomp] Skipping (non-linux platform)')
    }
    return
  }

  const arch = detectArch()
  if (!arch) {
    console.warn(`[seccomp] Unsupported arch: ${process.arch}`)
    if (requireBuild) process.exit(1)
    return
  }

  const cc = process.env.CC || 'cc'
  const ccProbe = spawnSync(cc, ['--version'], { stdio: 'ignore' })
  if (ccProbe.error || ccProbe.status !== 0) {
    console.warn(`[seccomp] No C compiler found (${cc})`)
    if (requireBuild) process.exit(1)
    return
  }

  const outDir = path.join(outRoot, arch)
  fs.mkdirSync(outDir, { recursive: true })

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kode-seccomp-'))
  const genBin = path.join(tmpDir, 'gen-unix-block-bpf')
  const applyBin = path.join(tmpDir, 'apply-seccomp')
  const outBpf = path.join(tmpDir, 'unix-block.bpf')

  try {
    runOrThrow(cc, [
      '-O2',
      '-Wall',
      '-Werror',
      '-o',
      genBin,
      'scripts/seccomp/gen-unix-block-bpf.c',
    ])
    runOrThrow(genBin, [outBpf])

    runOrThrow(cc, [
      '-O2',
      '-Wall',
      '-Werror',
      '-o',
      applyBin,
      'scripts/seccomp/apply-seccomp.c',
    ])

    fs.copyFileSync(applyBin, path.join(outDir, 'apply-seccomp'))
    fs.copyFileSync(outBpf, path.join(outDir, 'unix-block.bpf'))
    try {
      fs.chmodSync(path.join(outDir, 'apply-seccomp'), 0o755)
    } catch {
      // best-effort
    }

    if (hasFlag('--verbose')) {
      console.log(`[seccomp] Built ${path.join(outDir, 'apply-seccomp')}`)
      console.log(`[seccomp] Built ${path.join(outDir, 'unix-block.bpf')}`)
    }
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
}

main()
