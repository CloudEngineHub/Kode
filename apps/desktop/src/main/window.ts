import { BrowserWindow } from 'electron'

let mainWindow: BrowserWindow | null = null

export async function createMainWindow(): Promise<BrowserWindow> {
  if (mainWindow) return mainWindow

  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    backgroundColor: '#0b1020',
    webPreferences: {
      preload: 'dist/preload/index.js',
    },
  })

  mainWindow = win
  await win.loadURL('about:blank')
  return win
}
