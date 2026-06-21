import React from 'react'
import type { RenderOptions } from 'ink'
import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import { renderWithTuiStdio } from '#ui-ink/utils/inkRender'

type RenderInstance = {
  unmount: () => void
  pause?: () => void
  resume?: () => void
  suspendStdin?: () => void
  resumeStdin?: () => void
}

type RenderFn = (
  element: React.ReactElement,
  options?: RenderOptions,
) => RenderInstance

export async function renderRepl(
  props: any,
  renderContext: RenderOptions | undefined,
  deps?: { render?: RenderFn; REPL?: React.ComponentType<any> },
): Promise<void> {
  const render = deps?.render ?? (await import('ink')).render
  const REPL = deps?.REPL ?? (await import('#ui-ink/screens/REPL')).REPL
  const debugKeystrokeLogging = Boolean(process.env.KODE_DEBUG_KEYSTROKES)
  renderWithTuiStdio(
    render,
    <KeypressProvider debugKeystrokeLogging={debugKeystrokeLogging}>
      <REPL {...props} />
    </KeypressProvider>,
    renderContext,
  )
}

export function renderResumeConversationSelector(
  props: any,
  renderContext: RenderOptions | undefined,
): void {
  const context: { unmount?: () => void } = {}
  ;(async () => {
    const { render } = await import('ink')
    const { ResumeConversation } =
      await import('#ui-ink/screens/ResumeConversation')
    const debugKeystrokeLogging = Boolean(process.env.KODE_DEBUG_KEYSTROKES)
    const instance = renderWithTuiStdio(
      render,
      <KeypressProvider debugKeystrokeLogging={debugKeystrokeLogging}>
        <ResumeConversation {...props} context={context} />
      </KeypressProvider>,
      renderContext,
    )
    context.unmount = instance.unmount
  })()
}

export async function renderDoctorScreen(): Promise<void> {
  await new Promise<void>(resolve => {
    ;(async () => {
      const { render } = await import('ink')
      const { Doctor } = await import('#ui-ink/screens/Doctor')
      const debugKeystrokeLogging = Boolean(process.env.KODE_DEBUG_KEYSTROKES)
      const instance = renderWithTuiStdio(
        render,
        <KeypressProvider debugKeystrokeLogging={debugKeystrokeLogging}>
          <Doctor
            onDone={() => {
              instance.unmount?.()
              resolve()
            }}
            doctorMode={true}
          />
        </KeypressProvider>,
        { exitOnCtrlC: false },
      )
    })()
  })
}

export function renderLogListScreen(
  props: { type: 'messages' | 'errors'; logNumber?: number },
  renderContext: RenderOptions | undefined,
): void {
  const context: { unmount?: () => void } = {}
  ;(async () => {
    const { render } = await import('ink')
    const { LogList } = await import('#ui-ink/screens/LogList')
    const debugKeystrokeLogging = Boolean(process.env.KODE_DEBUG_KEYSTROKES)
    const instance = renderWithTuiStdio(
      render,
      <KeypressProvider debugKeystrokeLogging={debugKeystrokeLogging}>
        <LogList
          context={context}
          type={props.type}
          logNumber={props.logNumber}
        />
      </KeypressProvider>,
      renderContext,
    )
    context.unmount = instance.unmount
  })()
}
