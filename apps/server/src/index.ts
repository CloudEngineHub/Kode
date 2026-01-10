import '#core/utils/sanitizeAnthropicEnv'
import { ensurePackagedRuntimeEnv } from './bootstrapEnv'
import { startKodeDaemon } from './server'
import { cwd as processCwd } from 'process'
import { runAcpStdio } from './acp/runAcpStdio'
import { initDebugLogger } from '#core/utils/debugLogger'
import { enableConfigs } from '#config'
import { logError } from '#core/utils/log'

ensurePackagedRuntimeEnv()

if (process.argv.includes('--acp')) {
  runAcpStdio()
} else {
  initDebugLogger()
  try {
    enableConfigs()
  } catch (e) {
    logError(e)
  }

  function getArgValue(flag: string): string | null {
    const idx = process.argv.indexOf(flag)
    if (idx >= 0) {
      const v = process.argv[idx + 1]
      if (typeof v === 'string') return v
    }
    const withEq = process.argv.find(a => a.startsWith(flag + '='))
    if (withEq) return withEq.slice(flag.length + 1)
    return null
  }

  const host =
    getArgValue('--host') ?? process.env.KODE_DAEMON_HOST ?? '127.0.0.1'
  const portRaw = getArgValue('--port') ?? process.env.KODE_DAEMON_PORT ?? ''
  const port = portRaw ? Number(portRaw) : 0
  const cwd =
    getArgValue('--cwd') ?? process.env.KODE_DAEMON_CWD ?? processCwd()
  const token =
    getArgValue('--token') ?? process.env.KODE_DAEMON_TOKEN ?? undefined
  const echo =
    process.argv.includes('--echo') || process.env.KODE_DAEMON_ECHO === '1'

  const daemon = await startKodeDaemon({
    host,
    port: Number.isFinite(port) ? port : 0,
    cwd,
    token,
    echo,
  })

  console.log(daemon.url)

  process.on('SIGINT', () => {
    daemon.stop()
    process.exit(0)
  })
  process.on('SIGTERM', () => {
    daemon.stop()
    process.exit(0)
  })
}
