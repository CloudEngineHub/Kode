import React from 'react'
import type { RenderOptions } from 'ink'
import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import { setInkInstanceForStdout } from '#ui-ink/utils/inkInstanceStore'
import { ensureTuiStdioPatched } from '#cli-utils/stdio'

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
  const stdio = ensureTuiStdioPatched()
  const effectiveContext = renderContext
    ? { ...renderContext, ...stdio }
    : { ...stdio }
  const instance = render(
    <KeypressProvider>
      <REPL {...props} />
    </KeypressProvider>,
    effectiveContext,
  )
  const stdout = (effectiveContext?.stdout ??
    process.stdout) as NodeJS.WriteStream
  setInkInstanceForStdout(stdout, instance)
  if (stdout !== process.stdout) {
    setInkInstanceForStdout(process.stdout as NodeJS.WriteStream, instance)
  }
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
    const stdio = ensureTuiStdioPatched()
    const effectiveContext = renderContext
      ? { ...renderContext, ...stdio }
      : { ...stdio }
    const instance = render(
      <KeypressProvider>
        <ResumeConversation {...props} context={context} />
      </KeypressProvider>,
      effectiveContext,
    )
    const stdout = (effectiveContext?.stdout ??
      process.stdout) as NodeJS.WriteStream
    setInkInstanceForStdout(stdout, instance as RenderInstance)
    if (stdout !== process.stdout) {
      setInkInstanceForStdout(
        process.stdout as NodeJS.WriteStream,
        instance as RenderInstance,
      )
    }
    context.unmount = instance.unmount
  })()
}

export async function renderDoctorScreen(): Promise<void> {
  await new Promise<void>(resolve => {
    ;(async () => {
      const { render } = await import('ink')
      const { Doctor } = await import('#ui-ink/screens/Doctor')
      const stdio = ensureTuiStdioPatched()
      const instance = render(
        <KeypressProvider>
          <Doctor
            onDone={() => {
              instance.unmount?.()
              resolve()
            }}
            doctorMode={true}
          />
        </KeypressProvider>,
        { ...stdio, exitOnCtrlC: false },
      )
      setInkInstanceForStdout(
        process.stdout as NodeJS.WriteStream,
        instance as RenderInstance,
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
    const stdio = ensureTuiStdioPatched()
    const effectiveContext = renderContext
      ? { ...renderContext, ...stdio }
      : { ...stdio }
    const instance = render(
      <KeypressProvider>
        <LogList
          context={context}
          type={props.type}
          logNumber={props.logNumber}
        />
      </KeypressProvider>,
      effectiveContext,
    )
    const stdout = (effectiveContext?.stdout ??
      process.stdout) as NodeJS.WriteStream
    setInkInstanceForStdout(stdout, instance as RenderInstance)
    if (stdout !== process.stdout) {
      setInkInstanceForStdout(
        process.stdout as NodeJS.WriteStream,
        instance as RenderInstance,
      )
    }
    context.unmount = instance.unmount
  })()
}
