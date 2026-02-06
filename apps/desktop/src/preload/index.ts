import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  kiosk: {
    validatePassword: (password: string): Promise<boolean> =>
      ipcRenderer.invoke('kiosk:validatePassword', password),
    exitToSettings: (): Promise<void> => ipcRenderer.invoke('kiosk:exitToSettings'),
    enterKiosk: (): Promise<void> => ipcRenderer.invoke('kiosk:enterKiosk')
  },
  settings: {
    getAll: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('settings:getAll'),
    get: (key: string): Promise<unknown> => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown): Promise<void> =>
      ipcRenderer.invoke('settings:set', key, value)
  },
  photos: {
    save: (buffer: ArrayBuffer): Promise<string> => ipcRenderer.invoke('photos:save', buffer),
    print: (filePath: string): Promise<boolean> => ipcRenderer.invoke('photos:print', filePath),
    share: (filePath: string): Promise<boolean> => ipcRenderer.invoke('photos:share', filePath),
    upload: (
      filePath: string
    ): Promise<{ id: string; downloadUrl: string } | null> =>
      ipcRenderer.invoke('photos:upload', filePath)
  },
  printers: {
    getAll: (): Promise<Array<{ name: string; displayName: string }>> =>
      ipcRenderer.invoke('printers:getAll')
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
