function shouldLog(): boolean {
  const enabled =
    process.env.KODE_DEBUG_CONFIG ??
    process.env.KODE_DEBUG ??
    process.env.DEBUG ??
    ''
  return ['1', 'true', 'yes', 'on'].includes(
    String(enabled).trim().toLowerCase(),
  )
}

function write(
  level: string,
  event: string,
  data?: Record<string, unknown>,
): void {
  if (!shouldLog()) return
  const suffix = data ? ` ${JSON.stringify(data)}` : ''
  // eslint-disable-next-line no-console
  console.error(`[config:${level}] ${event}${suffix}`)
}

export const debug = {
  state(event: string, data?: Record<string, unknown>): void {
    write('state', event, data)
  },
  info(event: string, data?: Record<string, unknown>): void {
    write('info', event, data)
  },
  api(event: string, data?: Record<string, unknown>): void {
    write('api', event, data)
  },
  warn(event: string, data?: Record<string, unknown>): void {
    write('warn', event, data)
  },
  error(event: string, data?: Record<string, unknown>): void {
    write('error', event, data)
  },
}
