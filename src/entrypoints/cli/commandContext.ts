import type { RenderOptions } from 'ink'

export type CliCommandRegistrationContext = {
  stdinContent: string
  renderContext: RenderOptions | undefined
  renderContextWithExitOnCtrlC: RenderOptions
}

export function omitKeys<T extends Record<string, any>>(
  input: T,
  ...keys: (keyof T | string)[]
): Partial<T> {
  const result = { ...input } as Partial<T>
  for (const key of keys) {
    delete (result as any)[key as any]
  }
  return result
}
