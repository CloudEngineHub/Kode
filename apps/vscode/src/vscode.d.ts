declare module 'vscode' {
  export type Thenable<T> = PromiseLike<T>

  export type Disposable = { dispose(): void }

  export type ExtensionContext = {
    subscriptions: Disposable[]
  }

  export const commands: {
    registerCommand: (
      command: string,
      callback: (...args: unknown[]) => unknown,
    ) => Disposable
  }

  export const window: {
    showInformationMessage: (message: string) => Thenable<string | undefined>
  }
}
