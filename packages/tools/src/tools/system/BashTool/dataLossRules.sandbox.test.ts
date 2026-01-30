import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { getBashGateFindings, type BashGateFinding } from './dataLossRules'
import {
  createTestSandbox,
  TEST_COMMANDS,
  assertAllTrigger,
  assertNoneTrigger,
  type TestSandbox,
} from './testSandbox'

// Adapter for test utilities
const detectFn = (cmd: string): Array<{ id: string; title: string }> =>
  getBashGateFindings(cmd).map(f => ({ id: f.code, title: f.title }))

describe('dataLossRules with sandbox isolation', () => {
  let sandbox: TestSandbox

  beforeEach(() => {
    sandbox = createTestSandbox('data-loss-rules')
  })

  afterEach(() => {
    sandbox.cleanup()
  })

  describe('sandbox environment', () => {
    test('creates isolated temp directory', () => {
      expect(sandbox.root).toContain('data-loss-rules')
      expect(sandbox.cwd).toContain('workspace')
      expect(sandbox.home).toContain('home')
    })

    test('can create test files safely', () => {
      const filePath = sandbox.createFile('test.txt', 'content')
      expect(filePath).toContain(sandbox.cwd)
    })

    test('cleanup removes all temp files', () => {
      sandbox.createFile('test.txt', 'content')
      sandbox.createDir('subdir')
      sandbox.cleanup()
      // After cleanup, creating new sandbox should work
      const newSandbox = createTestSandbox('cleanup-test')
      expect(newSandbox.root).toBeTruthy()
      newSandbox.cleanup()
    })
  })

  describe('batch validation: dangerous commands', () => {
    test('all dangerous commands should trigger LLM Gate', () => {
      const { passed, failed } = assertAllTrigger(
        TEST_COMMANDS.dangerous,
        detectFn,
      )

      if (failed.length > 0) {
        console.error('MISSED dangerous commands:', failed)
      }

      expect(failed).toEqual([])
      expect(passed.length).toBe(TEST_COMMANDS.dangerous.length)
    })
  })

  describe('batch validation: safe commands', () => {
    test('all safe commands should NOT trigger LLM Gate', () => {
      const { passed, failed } = assertNoneTrigger(TEST_COMMANDS.safe, detectFn)

      if (failed.length > 0) {
        console.error('FALSE POSITIVE safe commands:', failed)
      }

      expect(failed).toEqual([])
      expect(passed.length).toBe(TEST_COMMANDS.safe.length)
    })
  })

  describe('batch validation: false positive prevention', () => {
    test('all false positive cases should NOT trigger', () => {
      const { passed, failed } = assertNoneTrigger(
        TEST_COMMANDS.falsePositives,
        detectFn,
      )

      if (failed.length > 0) {
        console.error('FALSE POSITIVE cases:', failed)
      }

      expect(failed).toEqual([])
      expect(passed.length).toBe(TEST_COMMANDS.falsePositives.length)
    })
  })

  describe('path-based detection with sandbox paths', () => {
    test('rm on sandbox paths is safe', () => {
      const safePath = sandbox.createDir('temp-files')
      const cmd = `rm -rf ${safePath}`
      const findings = getBashGateFindings(cmd)
      expect(findings.length).toBe(0)
    })

    test('rm on critical paths is dangerous even with sandbox prefix', () => {
      // These should still be detected as dangerous
      const criticalCmds = [
        'rm -rf /',
        'rm -rf ~',
        `cd ${sandbox.cwd} && rm -rf /`,
      ]

      for (const cmd of criticalCmds) {
        const findings = getBashGateFindings(cmd)
        expect(findings.length).toBeGreaterThan(0)
      }
    })
  })

  describe('compound commands in sandbox context', () => {
    test('detects dangerous ops in compound commands', () => {
      const safePath = sandbox.createDir('project')
      const cmds = [
        `cd ${safePath} && git reset --hard`,
        `cd ${safePath}; git push --force`,
        `ls ${safePath} && terraform destroy`,
      ]

      for (const cmd of cmds) {
        const findings = getBashGateFindings(cmd)
        expect(findings.length).toBeGreaterThan(0)
      }
    })

    test('allows safe compound commands', () => {
      const safePath = sandbox.createDir('project')
      const cmds = [
        `cd ${safePath} && git status`,
        `cd ${safePath}; ls -la`,
        `cat ${safePath}/file.txt && echo done`,
      ]

      for (const cmd of cmds) {
        const findings = getBashGateFindings(cmd)
        expect(findings.length).toBe(0)
      }
    })
  })
})
