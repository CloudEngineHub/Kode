import type { ReactElement } from 'react'
import type { RenderOptions } from 'ink'
import { getGlobalConfigCached } from '#core/utils/config'
import { ensureTuiStdioPatched } from '#cli-utils/stdio'
import { disableLineWrapping } from '#cli-utils/terminal'
import { setInkInstanceForStdout } from '#ui-ink/utils/inkInstanceStore'

export type InkRenderInstance = {
  unmount?: () => void
  pause?: () => void
  resume?: () => void
  suspendStdin?: () => void
  resumeStdin?: () => void
}

export type InkRenderFn = (
  element: ReactElement,
  options?: RenderOptions,
) => InkRenderInstance

function ensureInkStdinSupportsRef(
  stdin: NodeJS.ReadStream,
): NodeJS.ReadStream {
  // Ink expects stdin to implement ref()/unref() (Node ReadStream does).
  // Bun's process.stdin can be missing these, causing a crash on startup.
  const stream = stdin as unknown as Record<string, unknown>

  if (typeof stream.ref !== 'function') {
    try {
      Object.defineProperty(stream, 'ref', {
        value: () => {},
        writable: true,
        configurable: true,
      })
    } catch {
      stream.ref = () => {}
    }
  }

  if (typeof stream.unref !== 'function') {
    try {
      Object.defineProperty(stream, 'unref', {
        value: () => {},
        writable: true,
        configurable: true,
      })
    } catch {
      stream.unref = () => {}
    }
  }

  return stdin
}

export function renderWithTuiStdio(
  render: InkRenderFn,
  element: ReactElement,
  renderContext?: RenderOptions,
): InkRenderInstance {
  const screenReaderEnv =
    process.env.KODE_SCREEN_READER ?? process.env.SCREENREADER
  const isScreenReaderEnabled = Boolean(screenReaderEnv)

  if (!isScreenReaderEnabled) {
    disableLineWrapping()
  }

  const stdio = ensureTuiStdioPatched()
  const stdin = ensureInkStdinSupportsRef(
    (renderContext?.stdin ?? process.stdin) as NodeJS.ReadStream,
  )

  const incrementalEnv = process.env.KODE_TUI_INCREMENTAL_RENDERING
  let configIncrementalRendering: boolean | undefined
  try {
    configIncrementalRendering = getGlobalConfigCached().incrementalRendering
  } catch {
    // If the config is invalid or not yet loaded, fall back to env/defaults.
  }

  const incrementalRenderingDefault = (() => {
    if (isScreenReaderEnabled) return false
    if (!stdio.stdout.isTTY) return false

    if (incrementalEnv === '0' || incrementalEnv === 'false') return false
    if (incrementalEnv === '1' || incrementalEnv === 'true') return true

    if (typeof configIncrementalRendering === 'boolean') {
      return configIncrementalRendering
    }

    return true
  })()

  const maxFpsEnv = process.env.KODE_TUI_MAX_FPS
  const maxFpsDefault = (() => {
    if (maxFpsEnv) {
      const parsed = Number.parseInt(maxFpsEnv, 10)
      if (!Number.isFinite(parsed)) return undefined
      return Math.max(1, Math.min(240, parsed))
    }

    // Prefer a smoother default when incremental rendering is enabled.
    // Ink's upstream default is 30fps.
    return incrementalRenderingDefault ? 60 : undefined
  })()

  const effectiveContext = {
    // Defaults (can be overridden by renderContext)
    patchConsole: false,
    exitOnCtrlC: false,
    isScreenReaderEnabled,
    incrementalRendering: incrementalRenderingDefault,
    ...(maxFpsDefault ? { maxFps: maxFpsDefault } : null),
    // Caller options and stdio
    ...(renderContext ?? null),
    ...stdio,
    stdin,
  } satisfies RenderOptions
  const instance = render(element, effectiveContext)

  const stdout = (effectiveContext?.stdout ??
    process.stdout) as NodeJS.WriteStream
  setInkInstanceForStdout(stdout, instance)
  if (stdout !== process.stdout) {
    setInkInstanceForStdout(process.stdout as NodeJS.WriteStream, instance)
  }

  return instance
}
