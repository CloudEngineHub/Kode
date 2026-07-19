type StartupEvent = 'first_render' | 'prompt_ready'
type StartupProfileDetail = string | number | boolean | undefined

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function isEnabled(): boolean {
  return isTruthyEnv(process.env.KODE_STARTUP_PROFILE)
}

const seen = new Set<StartupEvent>()

function bytesToMb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10
}

function getMemoryDetails(): Record<string, number> | undefined {
  if (!isTruthyEnv(process.env.KODE_STARTUP_PROFILE_MEMORY)) return undefined

  const memory = process.memoryUsage()
  return {
    rssMb: bytesToMb(memory.rss),
    heapUsedMb: bytesToMb(memory.heapUsed),
    externalMb: bytesToMb(memory.external),
  }
}

function formatDetails(details?: Record<string, StartupProfileDetail>): string {
  if (!details) return ''

  return Object.entries(details)
    .filter((entry): entry is [string, string | number | boolean] => {
      return entry[1] !== undefined
    })
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ')
}

export function logStartupProfile(event: StartupEvent): void {
  if (!isEnabled()) return
  if (seen.has(event)) return
  seen.add(event)

  const ms = Math.round(process.uptime() * 1000)
  const suffix = formatDetails(getMemoryDetails())
  // Use stderr so we don't corrupt Ink's stdout rendering.
  process.stderr.write(
    `[startup] ${event}=${ms}ms${suffix ? ` ${suffix}` : ''}\n`,
  )
}

export function logStartupProfileDuration(
  event: string,
  durationMs: number,
  details?: Record<string, StartupProfileDetail>,
): void {
  if (!isEnabled()) return

  const suffix = formatDetails(details)
  process.stderr.write(
    `[startup] ${event}=${Math.round(durationMs)}ms${suffix ? ` ${suffix}` : ''}\n`,
  )
}
