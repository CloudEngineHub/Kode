// Bun 1.3.6 shares module mocks and process state between imported test files.
// Keep root discovery deterministic, but give each file a fresh process.
import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const files = new Set<string>()
for (const root of ['apps', 'packages']) {
  for (const suffix of ['test.ts', 'test.tsx', 'spec.ts', 'spec.tsx']) {
    for await (const file of new Bun.Glob(`${root}/**/*.${suffix}`).scan({
      cwd: repoRoot,
      onlyFiles: true,
    })) {
      if (!file.split('/').includes('node_modules')) files.add(file)
    }
  }
}
if (files.size === 0) throw new Error('No workspace tests discovered')

const totals = { pass: 0, skip: 0, fail: 0 }
afterAll(() =>
  console.log(
    `Workspace cases: ${totals.pass} pass, ${totals.skip} skip, ${totals.fail} fail`,
  ),
)

for (const file of [...files].sort()) {
  test(
    file,
    async () => {
      const configDir = mkdtempSync(join(tmpdir(), 'kode-test-config-'))
      const child = Bun.spawn(
        [process.execPath, 'test', resolve(repoRoot, file)],
        {
          cwd: repoRoot,
          env: { ...process.env, KODE_CONFIG_DIR: configDir, NO_COLOR: '1' },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      )
      const timer = setTimeout(() => child.kill(), 60_000)
      try {
        const [stdout, stderr, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ])
        const output = stdout + stderr
        // A CLI calling process.exit(0) must not turn an unfinished suite green.
        for (const kind of ['pass', 'skip', 'fail'] as const) {
          const match = output.match(new RegExp(`^\\s*(\\d+) ${kind}$`, 'm'))
          totals[kind] += Number(match?.[1] ?? 0)
        }
        const completed = /Ran \d+ tests? across \d+ files?\./.test(output)
        if (code !== 0 || !completed) console.error(output)
        expect(code, `Child test process failed: ${file}`).toBe(0)
        expect(completed, `Missing test completion summary: ${file}`).toBe(true)
      } finally {
        clearTimeout(timer)
        rmSync(configDir, { recursive: true, force: true })
      }
    },
    65_000,
  )
}
