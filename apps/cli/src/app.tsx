import '#core/utils/sanitizeAnthropicEnv'
import { initDebugLogger } from '#core/utils/debugLogger'
import { logError } from '#core/utils/log'
import { ConfigParseError } from '#core/utils/errors'
import { BunShell } from '#runtime/shell'
import {
  enableConfigs,
  getGlobalConfig,
  validateAndRepairAllGPT5Profiles,
} from '#config'
import { showInvalidConfigDialog } from '#ui-ink/screens/setup/InvalidConfigScreen'
import { ensurePackagedRuntimeEnv, ensureYogaWasmPath } from './bootstrapEnv'
import { parseArgs } from '#host-cli'
import { terminalCapabilityManager } from '#ui-ink/utils/terminalCapabilityManager'
import {
  enableLineWrapping,
  enterAlternateScreen,
  exitAlternateScreen,
  shouldEnterAlternateScreen,
} from '#cli-utils/terminal'
import {
  restoreTuiStdioPatch,
  writeToStderr,
  writeToStdout,
} from '#cli-utils/stdio'

import { cursorShow } from 'ansi-escapes'
import { openSync } from 'fs'
import { cwd } from 'process'
import { ReadStream } from 'tty'

// ink and REPL are imported lazily to avoid top-level awaits during module init
import type { RenderOptions } from 'ink'

let didEnterAlternateScreen = false

function wantsPrintMode(): boolean {
  return process.argv.includes('-p') || process.argv.includes('--print')
}

export async function runCli(): Promise<void> {
  ensurePackagedRuntimeEnv()
  ensureYogaWasmPath(import.meta.url)

  // 初始化调试日志系统
  initDebugLogger()

  // Validate configs are valid and enable configuration system
  try {
    enableConfigs()

    // 🔧 Validate and auto-repair GPT-5 model profiles (best-effort, non-blocking)
    // Avoid printing during interactive render; log to file on failure.
    queueMicrotask(() => {
      try {
        validateAndRepairAllGPT5Profiles()
      } catch (repairError) {
        logError(`GPT-5 configuration validation failed: ${repairError}`)
      }
    })
  } catch (error: unknown) {
    if (error instanceof ConfigParseError) {
      await showInvalidConfigDialog({ error })
      return
    }
  }

  const config = getGlobalConfig()
  const screenReaderEnv =
    process.env.KODE_SCREEN_READER ?? process.env.SCREENREADER
  const isScreenReader = Boolean(screenReaderEnv)

  if (
    shouldEnterAlternateScreen(
      config.useAlternateBuffer ?? false,
      isScreenReader,
    ) &&
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    !wantsPrintMode()
  ) {
    enterAlternateScreen()
    didEnterAlternateScreen = true
  }

  // Disabled background notifier to avoid mid-screen logs during REPL

  let inputPrompt = ''
  let renderContext: RenderOptions | undefined = {
    exitOnCtrlC: false,
  }

  const wantsStreamJsonStdin =
    process.argv.some(
      (arg, idx, all) =>
        arg === '--input-format' && all[idx + 1] === 'stream-json',
    ) || process.argv.some(arg => arg.startsWith('--input-format=stream-json'))

  if (
    !process.stdin.isTTY &&
    !process.env.CI &&
    // Input hijacking breaks MCP.
    !process.argv.includes('mcp') &&
    !wantsStreamJsonStdin
  ) {
    inputPrompt = await stdin()
    if (process.platform !== 'win32') {
      try {
        const ttyFd = openSync('/dev/tty', 'r')
        renderContext = { ...renderContext, stdin: new ReadStream(ttyFd) }
      } catch (err) {
        logError(`Could not open /dev/tty: ${err}`)
      }
    }
  }
  if (process.stdin.isTTY && process.stdout.isTTY) {
    await terminalCapabilityManager.detectCapabilities()
    terminalCapabilityManager.enableSupportedModes()
  }
  await parseArgs(inputPrompt, renderContext)
}

// NOTE: stdin is currently buffered; streaming can be added if needed.
async function stdin() {
  if (process.stdin.isTTY) {
    return ''
  }

  let data = ''
  for await (const chunk of process.stdin) data += chunk
  return data
}

process.on('exit', () => {
  try {
    restoreTuiStdioPatch()
  } catch {}
  try {
    enableLineWrapping()
  } catch {}
  resetCursor()
  if (didEnterAlternateScreen) {
    exitAlternateScreen()
  }
  BunShell.getInstance().close()
  terminalCapabilityManager.disableAllModes()
})

let isGracefulExitInProgress = false
async function gracefulExit(code = 0) {
  if (isGracefulExitInProgress) {
    process.exit(code)
    return
  }
  isGracefulExitInProgress = true

  try {
    const { runSessionEndHooks } = await import('#core/utils/kodeHooks')
    const { getKodeAgentSessionId } =
      await import('#protocol/utils/kodeAgentSessionId')
    const { tmpdir } = await import('os')
    const { join } = await import('path')

    const sessionId = getKodeAgentSessionId()
    const transcriptPath = join(
      tmpdir(),
      'kode-hooks-transcripts',
      `${sessionId}.transcript.txt`,
    )

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const signal = controller.signal
    const cleanup = () => clearTimeout(timer)

    try {
      await runSessionEndHooks({
        reason: 'exit',
        cwd: cwd(),
        transcriptPath,
        signal,
      })
    } finally {
      cleanup()
    }
  } catch {
    // best-effort only
  }

  try {
    resetCursor()
  } catch {}
  try {
    enableLineWrapping()
  } catch {}
  if (didEnterAlternateScreen) {
    try {
      exitAlternateScreen()
    } catch {}
  }
  try {
    BunShell.getInstance().close()
  } catch {}
  process.exit(code)
}

process.on('SIGINT', () => void gracefulExit(0))
process.on('SIGTERM', () => void gracefulExit(0))
// Windows CTRL+BREAK
process.on('SIGBREAK', () => void gracefulExit(0))
process.on('unhandledRejection', err => {
  logError(err)
  void gracefulExit(1)
})
process.on('uncaughtException', err => {
  logError(err)
  void gracefulExit(1)
})

function resetCursor() {
  if (process.stderr.isTTY) {
    writeToStderr(cursorShow)
    return
  }

  if (process.stdout.isTTY) {
    writeToStdout(cursorShow)
  }
}
