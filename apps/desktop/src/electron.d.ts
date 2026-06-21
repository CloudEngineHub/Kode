declare module 'electron' {
  export type IpcMainInvokeEvent = unknown

  export const app: {
    whenReady: () => Promise<void>
    on: (event: string, listener: (...args: unknown[]) => void) => void
    quit: () => void
  }

  export class BrowserWindow {
    constructor(options?: Record<string, unknown>)
    loadURL: (url: string) => Promise<void>
    loadFile: (filePath: string) => Promise<void>
    on: (event: string, listener: (...args: unknown[]) => void) => void
    webContents: {
      openDevTools: () => void
    }
  }

  export const ipcMain: {
    handle: (
      channel: string,
      handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
    ) => void
  }

  export const ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  }

  export const contextBridge: {
    exposeInMainWorld: (key: string, api: unknown) => void
  }
}
