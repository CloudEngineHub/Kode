#!/usr/bin/env bash
set -euo pipefail

MAIN_TARBALL="$(npm pack --ignore-scripts)"
BIN_TARBALL="$(cd packages/kode-bin-linux-x64 && npm pack --ignore-scripts)"
RG_TARBALL="$(cd packages/kode-ripgrep-linux-x64 && npm pack --ignore-scripts)"

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cp "$MAIN_TARBALL" "$TMP_DIR/"
cp "packages/kode-bin-linux-x64/$BIN_TARBALL" "$TMP_DIR/"
cp "packages/kode-ripgrep-linux-x64/$RG_TARBALL" "$TMP_DIR/"

cd "$TMP_DIR"
npm init -y >/dev/null 2>&1
npm install "./$RG_TARBALL" --ignore-scripts
npm install "./$BIN_TARBALL" --ignore-scripts
npm install "./$MAIN_TARBALL" --ignore-scripts

node node_modules/@shareai-lab/kode/dist/index.js --version
node node_modules/@shareai-lab/kode/dist/index.js --ripgrep --version >/dev/null
node node_modules/@shareai-lab/kode/cli.js --help >/dev/null
./node_modules/.bin/kode --version

test -x node_modules/@shareai-lab/kode/dist/vendor/seccomp/x64/apply-seccomp
test -s node_modules/@shareai-lab/kode/dist/vendor/seccomp/x64/unix-block.bpf
test -x node_modules/@shareai-lab/kode/dist/vendor/seccomp/arm64/apply-seccomp
test -s node_modules/@shareai-lab/kode/dist/vendor/seccomp/arm64/unix-block.bpf

mkdir -p no-optional
cd no-optional
npm init -y >/dev/null 2>&1
npm install "../$MAIN_TARBALL" --ignore-scripts --omit=optional
./node_modules/.bin/kode --version
test -x node_modules/@shareai-lab/kode/dist/vendor/seccomp/x64/apply-seccomp
test -s node_modules/@shareai-lab/kode/dist/vendor/seccomp/x64/unix-block.bpf
test -x node_modules/@shareai-lab/kode/dist/vendor/seccomp/arm64/apply-seccomp
test -s node_modules/@shareai-lab/kode/dist/vendor/seccomp/arm64/unix-block.bpf
cd ..

node - <<'NODE'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

process.env.PATH = ''

const { rgPath } = require('@shareai-lab/kode-ripgrep-linux-x64')
if (!rgPath || !fs.existsSync(rgPath)) {
  console.error(`Missing ripgrep binary: ${rgPath}`)
  process.exit(1)
}
const rgRes = spawnSync(rgPath, ['--version'], {
  encoding: 'utf8',
  timeout: 10_000,
})
if (rgRes.status !== 0) {
  console.error(rgRes.stderr || rgRes.stdout || `rg exited with ${rgRes.status}`)
  process.exit(rgRes.status || 1)
}

const { getAllTools } = require('@shareai-lab/kode/tools')
const grepTool = getAllTools().find(t => t && t.name === 'Grep')
if (!grepTool) {
  console.error('Missing Grep tool export')
  process.exit(1)
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kode-grep-smoke-'))
fs.writeFileSync(path.join(tmpRoot, 'hello.txt'), 'hello from kode')

const ctx = {
  messageId: undefined,
  abortController: new AbortController(),
  readFileTimestamps: {},
  options: { __sandboxPlatform: process.platform },
}

;(async () => {
  let result = null
  for await (const evt of grepTool.call(
    { pattern: 'hello', path: tmpRoot, output_mode: 'files_with_matches' },
    ctx,
  )) {
    if (evt.type === 'result') result = evt.data
  }
  if (!result || result.numFiles < 1) {
    console.error('Grep smoke test failed:', result)
    process.exit(1)
  }
  console.log('Grep OK:', result.filenames)
})().catch(err => {
  console.error(err)
  process.exit(1)
})
NODE
