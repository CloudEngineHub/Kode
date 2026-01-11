import type { ReactElement } from 'react'
import type { RenderOptions } from 'ink'
import { ensureTuiStdioPatched } from '#cli-utils/stdio'
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

export function renderWithTuiStdio(
  render: InkRenderFn,
  element: ReactElement,
  renderContext?: RenderOptions,
): InkRenderInstance {
  const stdio = ensureTuiStdioPatched()
  const effectiveContext = renderContext
    ? { ...renderContext, ...stdio }
    : { ...stdio }
  const instance = render(element, effectiveContext)

  const stdout = (effectiveContext?.stdout ??
    process.stdout) as NodeJS.WriteStream
  setInkInstanceForStdout(stdout, instance)
  if (stdout !== process.stdout) {
    setInkInstanceForStdout(process.stdout as NodeJS.WriteStream, instance)
  }

  return instance
}
