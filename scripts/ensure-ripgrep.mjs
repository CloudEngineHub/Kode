#!/usr/bin/env bun
import { createHash } from 'node:crypto'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'

const DEFAULT_VERSION = '15.1.0'

const version = process.env.KODE_RIPGREP_VERSION || DEFAULT_VERSION
const vendorRoot = join(process.cwd(), 'vendor', 'ripgrep')
const cacheRoot = join(process.cwd(), '.tmp', 'ripgrep-downloads')
const baseUrl =
  process.env.KODE_RIPGREP_BASE_URL ||
  'https://github.com/BurntSushi/ripgrep/releases/download'
const normalizedBaseUrl = String(baseUrl).replace(/\/+$/, '')

const targets = [
  {
    id: 'arm64-darwin',
    assetSuffix: 'aarch64-apple-darwin',
    archiveExt: 'tar.gz',
    exe: 'rg',
  },
  {
    id: 'x64-darwin',
    assetSuffix: 'x86_64-apple-darwin',
    archiveExt: 'tar.gz',
    exe: 'rg',
  },
  {
    id: 'arm64-linux',
    assetSuffix: 'aarch64-unknown-linux-gnu',
    archiveExt: 'tar.gz',
    exe: 'rg',
  },
  {
    id: 'x64-linux',
    assetSuffix: 'x86_64-unknown-linux-musl',
    archiveExt: 'tar.gz',
    exe: 'rg',
  },
  {
    id: 'arm64-win32',
    assetSuffix: 'aarch64-pc-windows-msvc',
    archiveExt: 'zip',
    exe: 'rg.exe',
  },
  {
    id: 'x64-win32',
    assetSuffix: 'x86_64-pc-windows-msvc',
    archiveExt: 'zip',
    exe: 'rg.exe',
  },
]

function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

async function download(url, destPath) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'kode-cli' },
  })
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}): ${url}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  mkdirSync(dirname(destPath), { recursive: true })
  await Bun.write(destPath, buf)
  return buf
}

async function downloadAndVerify(url, destPath) {
  if (existsSync(destPath)) {
    const buf = Buffer.from(await Bun.file(destPath).arrayBuffer())
    return buf
  }

  const buf = await download(url, destPath)
  const shaUrl = url + '.sha256'
  try {
    const shaText = await (
      await fetch(shaUrl, { headers: { 'User-Agent': 'kode-cli' } })
    ).text()
    const expected = shaText.match(/\b[a-f0-9]{64}\b/i)?.[0]
    const actual = sha256(buf)
    if (expected && expected !== actual) {
      throw new Error(
        `SHA256 mismatch for ${basename(destPath)}: expected ${expected}, got ${actual}`,
      )
    }
  } catch (err) {
    // Verification is best-effort; keep the download but warn loudly.
    console.warn(
      '⚠️  Could not verify ripgrep archive checksum:',
      err instanceof Error ? err.message : String(err),
    )
  }
  return buf
}

function run(cmd, args, options = {}) {
  const proc = Bun.spawnSync({
    cmd: [cmd, ...args],
    stdio: ['ignore', 'inherit', 'inherit'],
    ...options,
  })
  if (proc.exitCode !== 0) {
    throw new Error(`${cmd} failed (exit ${proc.exitCode})`)
  }
}

function ensureExecutable(filePath) {
  if (process.platform === 'win32') return
  try {
    chmodSync(filePath, 0o755)
  } catch {}
}

async function ensureTarget(target) {
  const outDir = join(vendorRoot, target.id)
  const outBin = join(outDir, target.exe)

  if (existsSync(outBin)) {
    try {
      const st = statSync(outBin)
      if (st.isFile() && st.size > 0) {
        ensureExecutable(outBin)
        return { id: target.id, status: 'ok' }
      }
    } catch {}
  }

  mkdirSync(outDir, { recursive: true })
  mkdirSync(cacheRoot, { recursive: true })

  const asset = `ripgrep-${version}-${target.assetSuffix}.${target.archiveExt}`
  const url = `${normalizedBaseUrl}/${version}/${asset}`
  const archivePath = join(cacheRoot, asset)

  await downloadAndVerify(url, archivePath)

  const folder = `ripgrep-${version}-${target.assetSuffix}`
  const extractRoot = join(cacheRoot, `extract-${target.id}`)
  rmSync(extractRoot, { recursive: true, force: true })
  mkdirSync(extractRoot, { recursive: true })

  if (target.archiveExt === 'tar.gz') {
    run('tar', [
      '-xzf',
      archivePath,
      '-C',
      extractRoot,
      `${folder}/${target.exe}`,
    ])
  } else {
    // zip (prefer unzip, fall back to bsdtar-compatible tar)
    const unzip = Bun.which('unzip')
    if (unzip) {
      run(unzip, [
        '-o',
        archivePath,
        `${folder}/${target.exe}`,
        '-d',
        extractRoot,
      ])
    } else {
      run('tar', [
        '-xf',
        archivePath,
        '-C',
        extractRoot,
        `${folder}/${target.exe}`,
      ])
    }
  }

  const extracted = join(extractRoot, folder, target.exe)
  cpSync(extracted, outBin)
  ensureExecutable(outBin)

  return { id: target.id, status: 'downloaded' }
}

async function main() {
  console.log(`📦 Ensuring bundled ripgrep (${version})...`)
  mkdirSync(vendorRoot, { recursive: true })

  const currentOnly =
    process.argv.includes('--current-only') ||
    process.env.KODE_RIPGREP_CURRENT_ONLY === '1'

  const wanted = currentOnly
    ? targets.filter(
        t =>
          t.id === `${process.arch}-${process.platform}` ||
          (process.platform === 'win32' && t.id === `${process.arch}-win32`),
      )
    : targets

  if (wanted.length === 0) {
    throw new Error(
      `No ripgrep target mapping for ${process.arch}-${process.platform}`,
    )
  }

  const results = []
  for (const target of wanted) {
    results.push(await ensureTarget(target))
  }

  const downloaded = results.filter(r => r.status !== 'ok').length
  console.log(
    `✅ ripgrep ready (${results.length} target(s), ${downloaded} downloaded). Vendor root: ${vendorRoot}`,
  )
}

main().catch(err => {
  console.error(
    '❌ ensure-ripgrep failed:',
    err instanceof Error ? err.message : String(err),
  )
  process.exit(1)
})
