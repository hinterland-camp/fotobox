import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  kiosk: {
    validatePassword: (password: string): Promise<boolean> =>
      ipcRenderer.invoke('kiosk:validatePassword', password),
    exitToSettings: (): Promise<void> => ipcRenderer.invoke('kiosk:exitToSettings'),
    enterKiosk: (): Promise<void> => ipcRenderer.invoke('kiosk:enterKiosk')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
