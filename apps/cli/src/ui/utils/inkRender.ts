import type { ReactElement } from 'react'
import type { RenderOptions } from 'ink'
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
  if (!screenReaderEnv) {
    disableLineWrapping()
  }

  const stdio = ensureTuiStdioPatched()
  const stdin = ensureInkStdinSupportsRef(
    (renderContext?.stdin ?? process.stdin) as NodeJS.ReadStream,
  )
  const effectiveContext = renderContext
    ? { ...renderContext, ...stdio, stdin }
    : { ...stdio, stdin }
  const instance = render(element, effectiveContext)

  const stdout = (effectiveContext?.stdout ??
    process.stdout) as NodeJS.WriteStream
  setInkInstanceForStdout(stdout, instance)
  if (stdout !== process.stdout) {
    setInkInstanceForStdout(process.stdout as NodeJS.WriteStream, instance)
  }

  return instance
}
