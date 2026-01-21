import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { exec } from 'node:child_process'
import { LEGACY_ENV } from '#core/compat/legacyEnv'

function openBrowser(url: string): void {
  const platform = process.platform
  let cmd: string

  if (platform === 'darwin') {
    cmd = `open "${url}"`
  } else if (platform === 'win32') {
    cmd = `start "" "${url}"`
  } else {
    cmd = `xdg-open "${url}"`
  }

  exec(cmd, err => {
    if (err) {
      // Silent fail - user can still click the link
    }
  })
}

function getKodeConfigDir(): string {
  const envDir =
    process.env.KODE_CONFIG_DIR ?? process.env[LEGACY_ENV.configDir]
  if (envDir && envDir.trim()) return envDir.trim()
  return join(homedir(), '.kode')
}

function getOrCreateWebToken(): string {
  const configDir = getKodeConfigDir()
  const tokenFile = join(configDir, 'web-token')

  if (existsSync(tokenFile)) {
    try {
      const token = readFileSync(tokenFile, 'utf-8').trim()
      if (token && token.length >= 8) return token
    } catch {}
  }

  const newToken = randomUUID().replace(/-/g, '').slice(0, 9)
  try {
    mkdirSync(configDir, { recursive: true })
    writeFileSync(tokenFile, newToken, 'utf-8')
  } catch {}

  return newToken
}

export async function runWebOnlyMode(args: {
  cwd: string
  webHost?: string
  webPort?: string
}): Promise<void> {
  const { startKodeDaemon } = await import('#daemon/server')

  const host =
    typeof args.webHost === 'string' && args.webHost.trim()
      ? args.webHost.trim()
      : undefined

  const port = (() => {
    const raw = typeof args.webPort === 'string' ? args.webPort.trim() : ''
    if (!raw) return 0
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : 0
  })()

  const token = getOrCreateWebToken()

  const daemon = await startKodeDaemon({
    host,
    port,
    token,
    cwd: args.cwd,
  })

  const link = `\x1b]8;;${daemon.url}\x07${daemon.url}\x1b]8;;\x07`

  console.log('')
  console.log('Kode Web Server')
  console.log('')
  console.log(`  ${link}`)
  console.log('')
  console.log('Press Ctrl+C to stop')
  console.log('')

  openBrowser(daemon.url)

  await new Promise<void>(resolve => {
    const cleanup = () => {
      daemon.stop()
      resolve()
    }
    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
  })
}
