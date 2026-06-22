#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('node:child_process')

console.log('📦 Pre-publish checks...\n')

const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function toPackPath(p) {
  return String(p).replace(/\\/g, '/')
}

// Check required files
const requiredFiles = [
  'cli.js',
  'cli-acp.js',
  'mcp-cli.js',
  'package.json',
  'yoga.wasm',
  path.join('dist', 'index.js'),
  path.join('dist', 'entrypoints', 'cli.js'),
  path.join('dist', 'entrypoints', 'mcp.js'),
  path.join('dist', 'entrypoints', 'daemon.js'),
  path.join('dist', 'sdk', 'protocol.js'),
  path.join('dist', 'sdk', 'protocol.cjs'),
  path.join('dist', 'sdk', 'client.js'),
  path.join('dist', 'sdk', 'client.cjs'),
  path.join('dist', 'sdk', 'daemon-client.js'),
  path.join('dist', 'sdk', 'daemon-client.cjs'),
  path.join('dist', 'sdk', 'core.js'),
  path.join('dist', 'sdk', 'core.cjs'),
  path.join('dist', 'sdk', 'tools.js'),
  path.join('dist', 'sdk', 'tools.cjs'),
  path.join('dist', 'sdk', 'runtime.js'),
  path.join('dist', 'sdk', 'runtime.cjs'),
  path.join('dist', 'sdk', 'runtime-node.js'),
  path.join('dist', 'sdk', 'runtime-node.cjs'),
  // Linux seccomp assets (used for Unix socket blocking).
  path.join('dist', 'vendor', 'seccomp', 'x64', 'apply-seccomp'),
  path.join('dist', 'vendor', 'seccomp', 'x64', 'unix-block.bpf'),
  path.join('dist', 'vendor', 'seccomp', 'arm64', 'apply-seccomp'),
  path.join('dist', 'vendor', 'seccomp', 'arm64', 'unix-block.bpf'),
  path.join('dist', 'package.json'),
  path.join('dist', 'yoga.wasm'),
  path.join('dist', 'webui', 'index.html'),
  path.join('packages', 'builtin-skills', 'THIRD_PARTY_NOTICES.md'),
]
const missingFiles = requiredFiles.filter(file => !fs.existsSync(file))

if (missingFiles.length > 0) {
  console.error('❌ Missing required files:', missingFiles.join(', '))
  console.error('   Run "bun run build" first')
  process.exit(1)
}

function fileExistsNonEmpty(filePath) {
  try {
    const st = fs.statSync(filePath)
    return st.isFile() && st.size > 0
  } catch {
    return false
  }
}

function runOrExit(cmd, args, options) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })
  if (result.error) {
    console.error(`❌ Failed to run ${cmd}:`, result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    console.error(
      `❌ Command failed (${result.status}): ${cmd} ${args.join(' ')}`,
    )
    process.exit(typeof result.status === 'number' ? result.status : 1)
  }
  return result.stdout || ''
}

function npmPackDryRunJson(cwd) {
  const stdout = runOrExit(
    NPM_CMD,
    ['pack', '--dry-run', '--ignore-scripts', '--json'],
    { cwd },
  )

  let data
  try {
    data = JSON.parse(stdout)
  } catch (err) {
    console.error('❌ Failed to parse npm pack JSON output')
    process.stderr.write(stdout)
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  const pack = Array.isArray(data) ? data[0] : null
  if (!pack || !Array.isArray(pack.files)) {
    console.error('❌ Unexpected npm pack JSON shape (missing files[])')
    process.exit(1)
  }
  return pack
}

function assertPackContainsExactPaths(pack, requiredPaths) {
  const fileSet = new Set(pack.files.map(f => f.path))
  const missing = requiredPaths.filter(p => !fileSet.has(p))
  if (missing.length === 0) return

  console.error('❌ npm pack is missing required paths (files field mismatch):')
  for (const p of missing) console.error(`   - ${p}`)
  process.exit(1)
}

function assertPackContainsSomeUnderPrefix(pack, prefix, humanName) {
  const hasAny = pack.files.some(
    f => typeof f?.path === 'string' && f.path.startsWith(prefix),
  )
  if (hasAny) return
  console.error(
    `❌ npm pack is missing ${humanName} (expected files under ${prefix})`,
  )
  process.exit(1)
}

function assertPackExcludesPrefixes(pack, prefixes) {
  const offenders = pack.files
    .map(f => f?.path)
    .filter(
      p =>
        typeof p === 'string' && prefixes.some(prefix => p.startsWith(prefix)),
    )

  if (offenders.length === 0) return
  console.error('❌ npm pack includes forbidden paths:')
  for (const p of offenders.slice(0, 50)) console.error(`   - ${p}`)
  if (offenders.length > 50) {
    console.error(`   ... (${offenders.length - 50} more)`)
  }
  process.exit(1)
}

// Ensure builtin skills exist (and are included in the packlist).
const builtinSkillsRoot = path.join('packages', 'builtin-skills', 'skills')
if (!fs.existsSync(builtinSkillsRoot)) {
  console.error(`❌ Missing builtin skills directory: ${builtinSkillsRoot}`)
  process.exit(1)
}

// Validate `files` packlist for the main package (guards against accidental excludes).
const mainPack = npmPackDryRunJson(process.cwd())
const requiredPackPaths = requiredFiles.map(toPackPath)
assertPackContainsExactPaths(mainPack, requiredPackPaths)
assertPackContainsSomeUnderPrefix(
  mainPack,
  `${toPackPath(path.join('packages', 'builtin-skills', 'skills'))}/`,
  'builtin skills',
)
assertPackExcludesPrefixes(mainPack, [
  'node_modules/',
  'vendor/',
  '.tmp/',
  'dist/bin/',
  'dist/binary/',
])

// Ensure ripgrep platform packages are prepared (main package stays small; binaries are shipped per-platform).
const rootPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const rootVersion = rootPkg.version
const ripgrepPackages = [
  {
    name: '@shareai-lab/kode-ripgrep-darwin-arm64',
    dir: path.join('packages', 'kode-ripgrep-darwin-arm64'),
    bin: path.join('bin', 'rg'),
  },
  {
    name: '@shareai-lab/kode-ripgrep-darwin-x64',
    dir: path.join('packages', 'kode-ripgrep-darwin-x64'),
    bin: path.join('bin', 'rg'),
  },
  {
    name: '@shareai-lab/kode-ripgrep-linux-arm64',
    dir: path.join('packages', 'kode-ripgrep-linux-arm64'),
    bin: path.join('bin', 'rg'),
  },
  {
    name: '@shareai-lab/kode-ripgrep-linux-x64',
    dir: path.join('packages', 'kode-ripgrep-linux-x64'),
    bin: path.join('bin', 'rg'),
  },
  {
    name: '@shareai-lab/kode-ripgrep-win32-arm64',
    dir: path.join('packages', 'kode-ripgrep-win32-arm64'),
    bin: path.join('bin', 'rg.exe'),
  },
  {
    name: '@shareai-lab/kode-ripgrep-win32-x64',
    dir: path.join('packages', 'kode-ripgrep-win32-x64'),
    bin: path.join('bin', 'rg.exe'),
  },
]

const missingRipgrepBins = []
for (const pkg of ripgrepPackages) {
  const pkgJsonPath = path.join(pkg.dir, 'package.json')
  if (!fs.existsSync(pkgJsonPath)) {
    missingRipgrepBins.push(`${pkg.dir}/package.json`)
    continue
  }

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
  if (pkgJson.version !== rootVersion) {
    console.error(
      `❌ Version mismatch: ${pkg.name} is ${pkgJson.version}, root is ${rootVersion}`,
    )
    console.error('   Run: node scripts/set-version.mjs <version>')
    process.exit(1)
  }

  const binPath = path.join(pkg.dir, pkg.bin)
  if (!fileExistsNonEmpty(binPath)) {
    missingRipgrepBins.push(binPath)
  }

  const expectedDepVersion = rootPkg.optionalDependencies?.[pkg.name]
  if (expectedDepVersion !== rootVersion) {
    console.error(
      `❌ optionalDependencies mismatch: ${pkg.name} is ${JSON.stringify(expectedDepVersion)} (expected ${rootVersion})`,
    )
    console.error('   Run: node scripts/set-version.mjs <version>')
    process.exit(1)
  }

  // Only run packlist checks if the binary exists (otherwise npm pack may fail early).
  if (fileExistsNonEmpty(binPath)) {
    const ripgrepPack = npmPackDryRunJson(pkg.dir)
    assertPackContainsExactPaths(ripgrepPack, [
      'package.json',
      'index.js',
      pkg.bin.replace(/\\/g, '/'),
    ])
  }
}

if (missingRipgrepBins.length > 0) {
  console.error('❌ Missing ripgrep platform binaries:')
  for (const file of missingRipgrepBins) console.error(`   - ${file}`)
  console.error(
    '   Run: bun run scripts/ensure-ripgrep.mjs && node scripts/prepare-ripgrep-packages.mjs',
  )
  process.exit(1)
}

// Ensure Kode native binary platform packages are prepared.
const kodeBinPackages = [
  {
    name: '@shareai-lab/kode-bin-darwin-arm64',
    dir: path.join('packages', 'kode-bin-darwin-arm64'),
    bin: path.join('bin', 'kode'),
  },
  {
    name: '@shareai-lab/kode-bin-darwin-x64',
    dir: path.join('packages', 'kode-bin-darwin-x64'),
    bin: path.join('bin', 'kode'),
  },
  {
    name: '@shareai-lab/kode-bin-linux-arm64',
    dir: path.join('packages', 'kode-bin-linux-arm64'),
    bin: path.join('bin', 'kode'),
  },
  {
    name: '@shareai-lab/kode-bin-linux-x64',
    dir: path.join('packages', 'kode-bin-linux-x64'),
    bin: path.join('bin', 'kode'),
  },
  {
    name: '@shareai-lab/kode-bin-win32-arm64',
    dir: path.join('packages', 'kode-bin-win32-arm64'),
    bin: path.join('bin', 'kode.exe'),
  },
  {
    name: '@shareai-lab/kode-bin-win32-x64',
    dir: path.join('packages', 'kode-bin-win32-x64'),
    bin: path.join('bin', 'kode.exe'),
  },
]

const missingKodeBins = []
for (const pkg of kodeBinPackages) {
  const pkgJsonPath = path.join(pkg.dir, 'package.json')
  if (!fs.existsSync(pkgJsonPath)) {
    missingKodeBins.push(`${pkg.dir}/package.json`)
    continue
  }

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
  if (pkgJson.version !== rootVersion) {
    console.error(
      `❌ Version mismatch: ${pkg.name} is ${pkgJson.version}, root is ${rootVersion}`,
    )
    console.error('   Run: node scripts/set-version.mjs <version>')
    process.exit(1)
  }

  const binPath = path.join(pkg.dir, pkg.bin)
  if (!fileExistsNonEmpty(binPath)) {
    missingKodeBins.push(binPath)
  }

  const expectedDepVersion = rootPkg.optionalDependencies?.[pkg.name]
  if (expectedDepVersion !== rootVersion) {
    console.error(
      `❌ optionalDependencies mismatch: ${pkg.name} is ${JSON.stringify(expectedDepVersion)} (expected ${rootVersion})`,
    )
    console.error('   Run: node scripts/set-version.mjs <version>')
    process.exit(1)
  }

  // Only run packlist checks if the binary exists (otherwise npm pack may fail early).
  if (fileExistsNonEmpty(binPath)) {
    const kodeBinPack = npmPackDryRunJson(pkg.dir)
    assertPackContainsExactPaths(kodeBinPack, [
      'package.json',
      'index.js',
      pkg.bin.replace(/\\/g, '/'),
    ])
  }
}

if (missingKodeBins.length > 0) {
  console.error('❌ Missing Kode binary platform binaries:')
  for (const file of missingKodeBins) console.error(`   - ${file}`)
  console.error('   Run: node scripts/prepare-kode-bin-packages.mjs')
  process.exit(1)
}

// Check Unix executable bits only on platforms that expose them meaningfully.
if (process.platform !== 'win32') {
  const cliStats = fs.statSync('cli.js')
  if (!(cliStats.mode & 0o100)) {
    console.error('❌ cli.js is not executable')
    process.exit(1)
  }

  const cliAcpStats = fs.statSync('cli-acp.js')
  if (!(cliAcpStats.mode & 0o100)) {
    console.error('❌ cli-acp.js is not executable')
    process.exit(1)
  }

  const mcpCliStats = fs.statSync('mcp-cli.js')
  if (!(mcpCliStats.mode & 0o100)) {
    console.error('❌ mcp-cli.js is not executable')
    process.exit(1)
  }

  for (const seccompBin of [
    path.join('dist', 'vendor', 'seccomp', 'x64', 'apply-seccomp'),
    path.join('dist', 'vendor', 'seccomp', 'arm64', 'apply-seccomp'),
  ]) {
    const st = fs.statSync(seccompBin)
    if (!(st.mode & 0o100)) {
      console.error(`❌ ${seccompBin} is not executable`)
      process.exit(1)
    }
  }
}

// Check package.json
const pkg = rootPkg

if (!pkg.bin || !pkg.bin.kode || !pkg.bin['mcp-cli'] || !pkg.bin['kode-acp']) {
  console.error('❌ Missing bin field in package.json')
  process.exit(1)
}

// Bundled dependencies check removed - not needed for this package structure

console.log('✅ All checks passed!')
console.log('\n📋 Package info:')
console.log(`   Name: ${pkg.name}`)
console.log(`   Version: ${pkg.version}`)
console.log(`   Main: ${pkg.main}`)
console.log(`   Bin: kode -> ${pkg.bin.kode}`)
console.log('\n🚀 Ready to publish!')
console.log('   Run: npm publish')
