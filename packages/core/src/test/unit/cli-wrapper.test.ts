import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

function writeFile(path: string, content: string, mode?: number) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
  if (mode !== undefined) chmodSync(path, mode)
}

function makeTempPackageRoot(options: { version: string }) {
  const root = mkdtempSync(join(tmpdir(), 'kode-cli-wrapper-'))
  mkdirSync(join(root, 'dist'), { recursive: true })

  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify(
      { name: '@shareai-lab/kode-test', version: options.version },
      null,
      2,
    ) + '\n',
    'utf8',
  )

  // Copy the real wrapper + utils into the temp package root.
  const repoRoot = process.cwd()
  writeFileSync(
    join(root, 'cli.js'),
    readFileSync(join(repoRoot, 'scripts', 'cli-wrapper.cjs'), 'utf8'),
    'utf8',
  )
  chmodSync(join(root, 'cli.js'), 0o755)

  return {
    root,
    cleanup() {
      rmSync(root, { recursive: true, force: true })
    },
  }
}

function runWrapper(
  packageRoot: string,
  args: string[],
  env: Record<string, string | undefined> = {},
) {
  return spawnSync(process.execPath, [join(packageRoot, 'cli.js'), ...args], {
    cwd: packageRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  })
}

describe('cli.js wrapper (native binary optionalDependencies + Node fallback)', () => {
  test('--help-lite prints usage without requiring Bun', () => {
    const pkg = makeTempPackageRoot({ version: '9.9.9' })
    const emptyPath = mkdtempSync(join(tmpdir(), 'kode-empty-path-'))
    try {
      const res = runWrapper(pkg.root, ['--help-lite'], {
        PATH: emptyPath,
      })
      expect(res.status).toBe(0)
      expect(res.stdout).toContain('Usage: kode')
      expect(res.stdout).toContain('--help')
    } finally {
      rmSync(emptyPath, { recursive: true, force: true })
      pkg.cleanup()
    }
  })

  test('--version prints package.json version without requiring Bun', () => {
    const pkg = makeTempPackageRoot({ version: '9.9.9' })
    const emptyPath = mkdtempSync(join(tmpdir(), 'kode-empty-path-'))
    try {
      const res = runWrapper(pkg.root, ['--version'], {
        PATH: emptyPath,
      })
      expect(res.status).toBe(0)
      expect(res.stdout.trim()).toBe('9.9.9')
    } finally {
      rmSync(emptyPath, { recursive: true, force: true })
      pkg.cleanup()
    }
  })

  test('runs Node runtime entrypoint (dist/index.js) when present', () => {
    const pkg = makeTempPackageRoot({ version: '9.9.9' })
    const emptyPath = mkdtempSync(join(tmpdir(), 'kode-empty-path-'))
    try {
      writeFileSync(
        join(pkg.root, 'dist', 'index.js'),
        `console.log("DIST_OK", process.argv.slice(2).join(" "));`,
        'utf8',
      )

      const res = runWrapper(pkg.root, ['arg1', 'arg2'], {
        PATH: emptyPath,
      })

      expect(res.status).toBe(0)
      expect(res.stdout).toContain('DIST_OK arg1 arg2')
    } finally {
      rmSync(emptyPath, { recursive: true, force: true })
      pkg.cleanup()
    }
  })

  test('prefers native binary from optionalDependencies when present', () => {
    const pkg = makeTempPackageRoot({ version: '9.9.9' })
    const emptyPath = mkdtempSync(join(tmpdir(), 'kode-empty-path-'))
    try {
      writeFileSync(
        join(pkg.root, 'dist', 'index.js'),
        `console.log("DIST_OK");`,
        'utf8',
      )

      const platform = process.platform
      const arch = process.arch
      const pkgName = `kode-bin-${platform}-${arch}`
      const modDir = join(pkg.root, 'node_modules', '@shareai-lab', pkgName)
      writeFile(
        join(modDir, 'index.js'),
        `module.exports = { kodePath: process.execPath }\n`,
      )

      const res = runWrapper(pkg.root, ['-e', 'console.log("BINARY_OK")'], {
        PATH: emptyPath,
      })

      expect(res.status).toBe(0)
      expect(res.stdout).toContain('BINARY_OK')
      expect(res.stdout).not.toContain('DIST_OK')
    } finally {
      rmSync(emptyPath, { recursive: true, force: true })
      pkg.cleanup()
    }
  })

  test('prints guidance and exits 1 when dist/ is missing', () => {
    const pkg = makeTempPackageRoot({ version: '9.9.9' })
    const emptyPath = mkdtempSync(join(tmpdir(), 'kode-empty-path-'))
    try {
      const res = runWrapper(pkg.root, [], {
        PATH: emptyPath,
      })
      expect(res.status).toBe(1)
      expect(res.stderr).toContain('Kode is not runnable')
      expect(res.stderr).toContain('dist/index.js')
      expect(res.stderr).toContain('bun run dev')
    } finally {
      rmSync(emptyPath, { recursive: true, force: true })
      pkg.cleanup()
    }
  })
})
