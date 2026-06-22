type StartupEvent = 'first_render' | 'prompt_ready'

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function isEnabled(): boolean {
  return isTruthyEnv(process.env.KODE_STARTUP_PROFILE)
}

const seen = new Set<StartupEvent>()

export function logStartupProfile(event: StartupEvent): void {
  if (!isEnabled()) return
  if (seen.has(event)) return
  seen.add(event)

  const ms = Math.round(process.uptime() * 1000)
  // Use stderr so we don't corrupt Ink's stdout rendering.
  process.stderr.write(`[startup] ${event}=${ms}ms\n`)
}

export function logStartupProfileDuration(
  event: string,
  durationMs: number,
  details?: Record<string, string | number | boolean | undefined>,
): void {
  if (!isEnabled()) return

  const suffix = details
    ? Object.entries(details)
        .filter((entry): entry is [string, string | number | boolean] => {
          return entry[1] !== undefined
        })
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(' ')
    : ''
  process.stderr.write(
    `[startup] ${event}=${Math.round(durationMs)}ms${suffix ? ` ${suffix}` : ''}\n`,
  )
}
