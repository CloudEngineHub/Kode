import { ipcMain } from 'electron'

export function registerIpc(): void {
  ipcMain.handle('kode:ping', () => ({ ok: true }))
}
