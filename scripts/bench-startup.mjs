import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const RUNS_DEFAULT = 5
const TIMEOUT_MS_DEFAULT = 30_000

function getArgValue(name) {
  const idx = process.argv.indexOf(name)
  if (idx === -1) return null
  const next = process.argv[idx + 1]
  if (!next || next.startsWith('-')) return null
  return next
}

function getNumberArg(name, fallback) {
  const raw = getArgValue(name)
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function parseDetails(raw) {
  if (!raw) return {}

  const details = {}
  for (const token of raw.trim().split(/\s+/)) {
    if (!token) continue

    const idx = token.indexOf('=')
    if (idx <= 0) continue

    const key = token.slice(0, idx)
    const value = token.slice(idx + 1)
    const numeric = Number(value)
    details[key] = Number.isFinite(numeric) ? numeric : value
  }

  return details
}

function parseStartupLine(line) {
  const m = line.match(/^\[startup\]\s+([a-zA-Z0-9_-]+)=(\d+)ms(?:\s+(.*))?$/)
  if (!m) return null
  return { event: m[1], ms: Number(m[2]), details: parseDetails(m[3]) }
}

async function runOnce({ timeoutMs }) {
  const cmd = [process.execPath, 'run', './apps/cli/src/index.ts', '--verbose']
  const startedAt = performance.now()

  const child = Bun.spawn(cmd, {
    env: {
      ...process.env,
      // Make benchmarks non-interactive/stable by skipping onboarding/trust dialogs.
      NODE_ENV: 'test',
      KODE_STARTUP_PROFILE: '1',
      KODE_STARTUP_PROFILE_MEMORY: '1',
    },
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'pipe',
  })

  const decoder = new TextDecoder()
  let buf = ''
  let firstRenderMs = null
  let promptReadyMs = null
  let firstRenderMemory = null
  let promptReadyMemory = null
  const events = []

  const timeout = setTimeout(() => {
    try {
      child.kill()
    } catch {}
  }, timeoutMs)

  try {
    for await (const chunk of child.stderr) {
      buf += decoder.decode(chunk)
      const lines = buf.split(/\r?\n/)
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const parsed = parseStartupLine(line.trim())
        if (!parsed) continue

        events.push(parsed)
        if (parsed.event === 'first_render') {
          firstRenderMs = parsed.ms
          firstRenderMemory = parsed.details
        }
        if (parsed.event === 'prompt_ready') {
          promptReadyMs = parsed.ms
          promptReadyMemory = parsed.details
        }
        if (promptReadyMs != null) {
          try {
            child.kill()
          } catch {}
          break
        }
      }
      if (promptReadyMs != null) break
    }
  } finally {
    clearTimeout(timeout)
  }

  const exitCode = await child.exited
  return {
    firstRenderMs,
    promptReadyMs,
    firstRenderMemory,
    promptReadyMemory,
    exitCode,
    elapsedMs: Math.round(performance.now() - startedAt),
    events,
  }
}

function finiteNumbers(values) {
  return values.filter(value => Number.isFinite(value))
}

function mean(values) {
  const xs = finiteNumbers(values)
  if (xs.length === 0) return null
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)
}

function summarize(values) {
  const xs = finiteNumbers(values)
  if (xs.length === 0) return { count: 0, min: null, max: null, mean: null }

  return {
    count: xs.length,
    min: Math.min(...xs),
    max: Math.max(...xs),
    mean: mean(xs),
  }
}

function detailNumber(results, eventName, key) {
  return results.map(result => {
    const details =
      eventName === 'first_render'
        ? result.firstRenderMemory
        : result.promptReadyMemory
    const value = details?.[key]
    return typeof value === 'number' ? value : null
  })
}

const runs = getNumberArg('--runs', RUNS_DEFAULT)
const timeoutMs = getNumberArg('--timeout-ms', TIMEOUT_MS_DEFAULT)
const jsonOutput = getArgValue('--json-output')

const results = []
for (let i = 0; i < runs; i++) {
  const r = await runOnce({ timeoutMs })
  results.push(r)
  const fr = r.firstRenderMs ?? 'NA'
  const pr = r.promptReadyMs ?? 'NA'
  const rss = r.promptReadyMemory?.rssMb ?? 'NA'
  process.stdout.write(
    `run ${i + 1}/${runs}: first_render=${fr}ms prompt_ready=${pr}ms prompt_ready_rss=${rss}MB exit=${r.exitCode}\n`,
  )
}

const report = {
  generatedAt: new Date().toISOString(),
  command: [process.execPath, 'run', './apps/cli/src/index.ts', '--verbose'],
  runs,
  timeoutMs,
  summary: {
    firstRenderMs: summarize(results.map(r => r.firstRenderMs)),
    promptReadyMs: summarize(results.map(r => r.promptReadyMs)),
    firstRenderRssMb: summarize(detailNumber(results, 'first_render', 'rssMb')),
    promptReadyRssMb: summarize(detailNumber(results, 'prompt_ready', 'rssMb')),
    firstRenderHeapUsedMb: summarize(
      detailNumber(results, 'first_render', 'heapUsedMb'),
    ),
    promptReadyHeapUsedMb: summarize(
      detailNumber(results, 'prompt_ready', 'heapUsedMb'),
    ),
  },
  results,
}

process.stdout.write('\n')
process.stdout.write(
  `avg first_render: ${report.summary.firstRenderMs.mean ?? 'NA'}ms\n`,
)
process.stdout.write(
  `avg prompt_ready: ${report.summary.promptReadyMs.mean ?? 'NA'}ms\n`,
)
process.stdout.write(
  `avg prompt_ready_rss: ${report.summary.promptReadyRssMb.mean ?? 'NA'}MB\n`,
)

if (jsonOutput) {
  const outputPath = path.resolve(process.cwd(), jsonOutput)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  process.stdout.write(`JSON report: ${jsonOutput}\n`)
}
