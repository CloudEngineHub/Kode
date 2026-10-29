import { describe, expect, test } from 'bun:test'
import {
  lockedVersions,
  validateAudit,
  highRiskFindings,
} from '../../../../../scripts/audit-regressions.mjs'

const lock = (versions: string[]) =>
  JSON.stringify({
    lockfileVersion: 1,
    packages: Object.fromEntries(
      versions.map((version, i) => [String(i), [`pkg@${version}`]]),
    ),
  })
const report = {
  pkg: [{ id: 1, severity: 'high', vulnerable_versions: '<2.0.0' }],
}

describe('dependency audit regression policy', () => {
  test('accepts JSONC, scoped packages and prerelease versions in Bun locks', () => {
    const versions = lockedVersions(
      '{"lockfileVersion":1,"packages":{"alias":["@scope/pkg@1.0.0-beta.1"],},}',
    )
    expect([...versions.get('@scope/pkg')!]).toEqual(['1.0.0-beta.1'])
  })
  test('new vulnerable versions fail even if the advisory already exists', () => {
    const base = highRiskFindings(lockedVersions(lock(['1.0.0'])), [report])
    const head = highRiskFindings(lockedVersions(lock(['1.0.0', '1.1.0'])), [
      report,
    ])
    expect([...head.keys()].filter(key => !base.has(key))).toEqual([
      'pkg@1.1.0#1',
    ])
  })
  test('a newly disclosed advisory applies equally to both lockfiles', () => {
    const versions = lockedVersions(lock(['1.0.0']))
    expect([...highRiskFindings(versions, [{}, report]).keys()]).toEqual([
      'pkg@1.0.0#1',
    ])
    expect(
      highRiskFindings(lockedVersions(lock(['2.0.0'])), [report]).size,
    ).toBe(0)
  })
  test('malformed audit and lock responses fail closed', () => {
    for (const invalid of [
      null,
      [],
      { pkg: {} },
      { pkg: [{}] },
      { pkg: [{ id: 1, severity: 'high', vulnerable_versions: 'invalid' }] },
    ]) {
      expect(() => validateAudit(invalid)).toThrow()
    }
    expect(() => lockedVersions('{}')).toThrow()
    expect(() => lockedVersions('{')).toThrow()
  })
})
