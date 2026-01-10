import React from 'react'
import type { RenderOptions } from 'ink'
import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'

type RenderFn = (
  element: React.ReactElement,
  options?: RenderOptions,
) => { unmount: () => void }

export async function renderRepl(
  props: any,
  renderContext: RenderOptions | undefined,
  deps?: { render?: RenderFn; REPL?: React.ComponentType<any> },
): Promise<void> {
  const render = deps?.render ?? (await import('ink')).render
  const REPL = deps?.REPL ?? (await import('#ui-ink/screens/REPL')).REPL
  render(
    <KeypressProvider>
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
    const { unmount } = render(
      <KeypressProvider>
        <ResumeConversation {...props} context={context} />
      </KeypressProvider>,
      renderContext,
    )
    context.unmount = unmount
  })()
}

export async function renderDoctorScreen(): Promise<void> {
  await new Promise<void>(resolve => {
    ;(async () => {
      const { render } = await import('ink')
      const { Doctor } = await import('#ui-ink/screens/Doctor')
      render(
        <KeypressProvider>
          <Doctor onDone={() => resolve()} doctorMode={true} />
        </KeypressProvider>,
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
    const { unmount } = render(
      <KeypressProvider>
        <LogList
          context={context}
          type={props.type}
          logNumber={props.logNumber}
        />
      </KeypressProvider>,
      renderContext,
    )
    context.unmount = unmount
  })()
}
