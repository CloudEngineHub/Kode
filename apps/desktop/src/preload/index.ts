import { contextBridge, ipcRenderer } from 'electron'

type KodeApi = {
  ping: () => Promise<unknown>
}

const api: KodeApi = {
  ping: () => ipcRenderer.invoke('kode:ping'),
}

contextBridge.exposeInMainWorld('kode', api)
