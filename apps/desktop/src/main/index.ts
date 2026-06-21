import { app } from 'electron'

import { createMainWindow } from './window'
import { registerIpc } from './ipc'

await app.whenReady()
registerIpc()
await createMainWindow()

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
