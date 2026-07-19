import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const outputDir = path.join(repoRoot, '.tmp', 'phase2-baseline')
const reportPath = path.join(outputDir, 'report.json')
const startupReportPath = path.join(outputDir, 'startup.json')
const refactorReportPath = path.join(
  repoRoot,
  '.tmp',
  'refactor-baseline',
  'report.json',
)

function getArgValue(name) {
  const idx = process.argv.indexOf(name)
  if (idx === -1) return null
  const next = process.argv[idx + 1]
  if (!next || next.startsWith('-')) return null
  return next
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function getNumberArg(name, fallback) {
  const raw = getArgValue(name)
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function toRepoPath(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, '/')
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

function tail(text, maxChars = 8000) {
  if (text.length <= maxChars) return text
  return text.slice(text.length - maxChars)
}

async function collectStream(stream, target) {
  const decoder = new TextDecoder()
  let text = ''

  for await (const chunk of stream) {
    const value = decoder.decode(chunk)
    text += value
    target.write(value)
  }

  return text
}

async function runCommand(name, command) {
  process.stdout.write(`\n[phase2-baseline] ${name}: ${command.join(' ')}\n`)
  const startedAt = performance.now()
  const child = Bun.spawn(command, {
    cwd: repoRoot,
    env: process.env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    collectStream(child.stdout, process.stdout),
    collectStream(child.stderr, process.stderr),
    child.exited,
  ])

  const durationMs = Math.round(performance.now() - startedAt)
  process.stdout.write(
    `[phase2-baseline] ${name}: exit=${exitCode} duration=${durationMs}ms\n`,
  )

  return {
    name,
    command,
    exitCode,
    durationMs,
    stdoutTail: tail(stdout),
    stderrTail: tail(stderr),
  }
}

const startupRuns = getNumberArg('--startup-runs', 3)
const skipStartup = hasFlag('--skip-startup')
const skipTypecheck = hasFlag('--skip-typecheck')
const commandResults = []

await mkdir(outputDir, { recursive: true })

commandResults.push(
  await runCommand('refactor-baseline', [
    process.execPath,
    'run',
    'baseline:refactor',
  ]),
)

if (!skipStartup) {
  commandResults.push(
    await runCommand('startup-benchmark', [
      process.execPath,
      'run',
      'scripts/bench-startup.mjs',
      '--runs',
      String(startupRuns),
      '--json-output',
      toRepoPath(startupReportPath),
    ]),
  )
}

if (!skipTypecheck) {
  commandResults.push(
    await runCommand('typecheck-compile-time', [
      process.execPath,
      'run',
      'typecheck',
    ]),
  )
}

const refactor = await readJsonIfExists(refactorReportPath)
const startup = await readJsonIfExists(startupReportPath)
const typecheck = commandResults.find(
  result => result.name === 'typecheck-compile-time',
)

const report = {
  generatedAt: new Date().toISOString(),
  repoRoot,
  entryConditions: {
    refactorBaseline: {
      reportPath: toRepoPath(refactorReportPath),
      sourceFiles: refactor?.files ?? null,
      any: refactor?.any ?? null,
      dependencyGraph: refactor?.dependencyGraph ?? null,
    },
    performanceBaseline: {
      startupReportPath: skipStartup ? null : toRepoPath(startupReportPath),
      startupSummary: startup?.summary ?? null,
      typecheckDurationMs: typecheck?.durationMs ?? null,
      renderProxy:
        'first_render and prompt_ready are the current CLI render readiness proxies',
    },
    rollbackStrategy: {
      phase2:
        'Keep temporary re-exports while moving boundaries; revert package-split commits independently if compatibility checks fail.',
      phase3:
        'Gate any custom renderer behind a feature flag and keep third-party Ink as the default until parity is proven.',
      phase4:
        'Use per-package tsconfig strictness so strict-mode changes can be reverted package by package.',
      phase5:
        'Ship new capabilities behind disabled-by-default feature flags before widening rollout.',
    },
  },
  commands: commandResults,
}

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
process.stdout.write(
  `\nPhase 2 baseline written to ${toRepoPath(reportPath)}\n`,
)

if (commandResults.some(result => result.exitCode !== 0)) {
  process.exitCode = 1
}
