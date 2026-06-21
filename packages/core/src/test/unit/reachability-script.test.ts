import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('scripts/analyze-reachability.mjs', () => {
  test(
    'writes a stable JSON report for apps/cli/src/dispatch.ts',
    () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'kode-reachability-tests-'))
      const outFile = join(tmpDir, 'report.json')

      try {
        const script = join(
          process.cwd(),
          'scripts',
          'analyze-reachability.mjs',
        )
        const res = spawnSync(process.execPath, [script, '--out', outFile], {
          cwd: process.cwd(),
          env: { ...process.env },
          encoding: 'utf8',
          timeout: 2 * 60 * 1000,
        })

        expect(res.status).toBe(0)

        const report = JSON.parse(readFileSync(outFile, 'utf8'))
        expect(report).toHaveProperty('entrypoints')
        expect(report).toHaveProperty('reachable')
        expect(report).toHaveProperty('unreachable')
        expect(report).toHaveProperty('counts')

        expect(report.entrypoints).toContain('apps/cli/src/dispatch.ts')
        expect(report.reachable).toContain('apps/cli/src/dispatch.ts')

        expect(typeof report.counts.total).toBe('number')
        expect(typeof report.counts.reachable).toBe('number')
        expect(typeof report.counts.unreachable).toBe('number')

        expect(report.counts.total).toBeGreaterThan(0)
        expect(report.counts.reachable).toBeGreaterThan(0)
        expect(report.counts.total).toBe(
          report.counts.reachable + report.counts.unreachable,
        )
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    },
    { timeout: 180_000 },
  )
})
