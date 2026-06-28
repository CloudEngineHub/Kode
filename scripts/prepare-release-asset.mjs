#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  getBinaryFilename,
  getGithubReleaseBinaryAssetName,
  getPlatformArch,
} = require('./binary-utils.cjs')

const platform = process.platform
const arch = process.arch
const src = path.join(
  'dist',
  'bin',
  getPlatformArch(platform, arch),
  getBinaryFilename(platform),
)
const dest = getGithubReleaseBinaryAssetName(platform, arch)

fs.copyFileSync(src, dest)
if (platform !== 'win32') {
  try {
    fs.chmodSync(dest, 0o755)
  } catch {}
}

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `asset=${dest}\n`)
}

console.log(`Prepared ${dest}`)
