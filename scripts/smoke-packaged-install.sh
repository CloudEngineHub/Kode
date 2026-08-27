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

for (const subpath of ['protocol', 'daemon-client']) {
  const specifier = `@shareai-lab/kode/${subpath}`
  const loaded = require(specifier)
  if (!loaded || typeof loaded !== 'object') {
    console.error(`Could not require ${specifier}`)
    process.exit(1)
  }
}
NODE
