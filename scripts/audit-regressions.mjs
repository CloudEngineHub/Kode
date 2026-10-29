// PRs must not add high/critical dependency vulnerabilities. Compare both
// lockfiles against the same advisory set, including newly disclosed issues.
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
import semver from 'semver'

export function lockedVersions(text) {
  const parsed = ts.parseConfigFileTextToJson('bun.lock', text)
  if (
    parsed.error ||
    parsed.config?.lockfileVersion !== 1 ||
    !parsed.config?.packages
  ) {
    throw new Error('Unsupported or malformed bun.lock')
  }
  const result = new Map()
  for (const entry of Object.values(parsed.config.packages)) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string')
      throw new Error('Invalid package record')
    const spec = entry[0]
    if (spec.includes('@workspace:')) continue
    const split = spec.lastIndexOf('@')
    if (split <= 0 || !semver.valid(spec.slice(split + 1))) {
      throw new Error(`Unsupported locked package: ${spec}`)
    }
    const name = spec.slice(0, split)
    const versions = result.get(name) ?? new Set()
    versions.add(spec.slice(split + 1))
    result.set(name, versions)
  }
  return result
}

export function validateAudit(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid audit response')
  for (const advisories of Object.values(value)) {
    if (!Array.isArray(advisories))
      throw new Error('Invalid audit advisory list')
    for (const advisory of advisories) {
      if (
        !advisory ||
        !Number.isInteger(advisory.id) ||
        !['low', 'moderate', 'high', 'critical'].includes(advisory.severity) ||
        typeof advisory.vulnerable_versions !== 'string' ||
        !advisory.vulnerable_versions.trim() ||
        !semver.validRange(advisory.vulnerable_versions)
      ) {
        throw new Error('Malformed audit advisory')
      }
    }
  }
  return value
}

export function highRiskFindings(versions, reports) {
  const findings = new Map()
  for (const report of reports) {
    for (const [name, advisories] of Object.entries(validateAudit(report))) {
      for (const advisory of advisories) {
        if (!['high', 'critical'].includes(advisory.severity)) continue
        for (const version of versions.get(name) ?? []) {
          if (
            semver.satisfies(version, advisory.vulnerable_versions, {
              includePrerelease: true,
            })
          ) {
            findings.set(`${name}@${version}#${advisory.id}`, {
              name,
              version,
              ...advisory,
            })
          }
        }
      }
    }
  }
  return findings
}

function audit(lockfile) {
  const dir = mkdtempSync(join(tmpdir(), 'kode-audit-'))
  try {
    writeFileSync(join(dir, 'bun.lock'), lockfile)
    writeFileSync(
      join(dir, 'package.json'),
      '{"name":"kode-audit","version":"0.0.0"}',
    )
    let output
    try {
      output = execFileSync(process.execPath, ['audit', '--json'], {
        cwd: dir,
        encoding: 'utf8',
        timeout: 60_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      // Exit 1 is normal when advisories are returned. Transport errors,
      // timeouts and invalid JSON remain failures, never an empty baseline.
      if (error.status !== 1)
        throw new Error('Dependency audit could not complete')
      output = error.stdout
    }
    return validateAudit(JSON.parse(output))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  const base = process.env.CI_AUDIT_BASE_SHA
  if (!/^[a-f0-9]{40}$/.test(base ?? '') || /^0+$/.test(base)) {
    throw new Error('CI_AUDIT_BASE_SHA must identify a trusted base commit')
  }
  const baseLock = execFileSync('git', ['show', `${base}:bun.lock`], {
    encoding: 'utf8',
  })
  const headLock = readFileSync('bun.lock', 'utf8')
  const reports =
    headLock === baseLock
      ? [audit(headLock)]
      : [audit(baseLock), audit(headLock)]
  const baseline = highRiskFindings(lockedVersions(baseLock), reports)
  const current = highRiskFindings(lockedVersions(headLock), reports)
  const added = [...current.entries()].filter(([key]) => !baseline.has(key))
  const lines = [
    `Dependency audit: ${current.size} high/critical findings; ${added.length} newly introduced.`,
    '',
    ...[...current.entries()].map(
      ([key, finding]) =>
        `- ${baseline.has(key) ? 'Existing' : 'NEW'}: ${finding.name}@${finding.version} (${finding.severity}) ${finding.url}`,
    ),
    '',
    'Existing findings remain unresolved. `bun run security:audit` performs the full blocking audit.',
  ]
  console.log(lines.join('\n'))
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n')
  if (added.length) process.exitCode = 1
}
