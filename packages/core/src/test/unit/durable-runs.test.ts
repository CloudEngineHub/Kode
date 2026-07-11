import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createDurableRun,
  finishDurableRun,
  heartbeatDurableRun,
  reconcileDurableRuns,
} from '#core/runs'

describe('durable run reconciliation', () => {
  test('never falsely attaches an LLM agent after restart', () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'kode-runs-'))
    try {
      createDurableRun({
        id: 'agent1',
        kind: 'agent',
        cwd: storageRoot,
        storageRoot,
        now: 1,
      })
      const result = reconcileDurableRuns({ storageRoot, now: 2 })
      expect(result).toHaveLength(1)
      expect(result[0]?.action).toBe('requeueable')
      expect(result[0]?.run.status).toBe('interrupted')
    } finally {
      rmSync(storageRoot, { recursive: true, force: true })
    }
  })

  test('only exposes an exact-identity shell as tail-only', () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'kode-runs-'))
    try {
      createDurableRun({
        id: 'shell1',
        kind: 'shell',
        cwd: storageRoot,
        storageRoot,
        process: { pid: 42, startToken: 'start-1' },
        now: 1,
      })
      const result = reconcileDurableRuns({
        storageRoot,
        now: 2,
        probeProcess: () => ({ alive: true, startToken: 'start-1' }),
      })
      expect(result[0]?.action).toBe('tail_only')
      expect(result[0]?.run.status).toBe('running')
      expect(
        heartbeatDurableRun({ id: 'shell1', storageRoot, now: 3 })?.heartbeatAt,
      ).toBe(3)
    } finally {
      rmSync(storageRoot, { recursive: true, force: true })
    }
  })

  test('does not overwrite a terminal cancellation when a late completion arrives', () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'kode-runs-'))
    try {
      createDurableRun({
        id: 'shell-cancelled',
        kind: 'shell',
        cwd: storageRoot,
        storageRoot,
        now: 1,
      })
      expect(
        finishDurableRun({
          id: 'shell-cancelled',
          status: 'cancelled',
          storageRoot,
          now: 2,
        })?.status,
      ).toBe('cancelled')
      expect(
        finishDurableRun({
          id: 'shell-cancelled',
          status: 'completed',
          storageRoot,
          now: 3,
        })?.status,
      ).toBe('cancelled')
    } finally {
      rmSync(storageRoot, { recursive: true, force: true })
    }
  })
})
