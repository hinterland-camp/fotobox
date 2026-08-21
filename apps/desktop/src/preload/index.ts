import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { FrameConfig, FrameVariant } from '../common/frames'

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
    savePrint: (buffer: ArrayBuffer, sourcePath: string): Promise<string> =>
      ipcRenderer.invoke('photos:savePrint', buffer, sourcePath),
    print: (filePath: string): Promise<boolean> => ipcRenderer.invoke('photos:print', filePath),
    upload: (
      filePath: string
    ): Promise<{ id: string; downloadUrl: string } | null> =>
      ipcRenderer.invoke('photos:upload', filePath),
    testConnection: (): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke('photos:testConnection'),
    list: (limit?: number): Promise<Array<{ path: string; thumbnail: string }>> =>
      ipcRenderer.invoke('photos:list', limit),
    getDataUrl: (filePath: string): Promise<string | null> =>
      ipcRenderer.invoke('photos:getDataUrl', filePath),
    testPrint: (): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke('photos:testPrint'),
    savePrintPreview: (): Promise<{ ok: boolean; message: string; path?: string }> =>
      ipcRenderer.invoke('photos:savePrintPreview'),
    getLastPrintError: (): Promise<string | null> =>
      ipcRenderer.invoke('photos:getLastPrintError')
  },
  uploadQueue: {
    getAll: (): Promise<Array<{ filePath: string; addedAt: string }>> =>
      ipcRenderer.invoke('uploadQueue:getAll'),
    add: (filePath: string): Promise<void> => ipcRenderer.invoke('uploadQueue:add', filePath),
    remove: (filePath: string): Promise<void> =>
      ipcRenderer.invoke('uploadQueue:remove', filePath),
    retryOne: (
      filePath: string
    ): Promise<{ id: string; downloadUrl: string } | null> =>
      ipcRenderer.invoke('uploadQueue:retryOne', filePath)
  },
  printers: {
    getAll: (): Promise<Array<{ name: string; displayName: string }>> =>
      ipcRenderer.invoke('printers:getAll')
  },
  camera: {
    getAccessStatus: (): Promise<string> => ipcRenderer.invoke('camera:getAccessStatus')
  },
  frames: {
    getAll: (): Promise<Record<FrameVariant, FrameConfig>> => ipcRenderer.invoke('frames:getAll'),
    getDataUrl: (variant: FrameVariant): Promise<string | null> =>
      ipcRenderer.invoke('frames:getDataUrl', variant),
    select: (
      variant: FrameVariant
    ): Promise<{ config: FrameConfig; dataUrl: string } | null> =>
      ipcRenderer.invoke('frames:select', variant),
    setLayout: (
      variant: FrameVariant,
      layout: Pick<FrameConfig, 'photo' | 'qr'>
    ): Promise<FrameConfig> => ipcRenderer.invoke('frames:setLayout', variant, layout),
    clear: (variant: FrameVariant): Promise<void> => ipcRenderer.invoke('frames:clear', variant)
  },
  updates: {
    getState: (): Promise<unknown> => ipcRenderer.invoke('updates:getState'),
    check: (): Promise<unknown> => ipcRenderer.invoke('updates:check'),
    download: (): Promise<unknown> => ipcRenderer.invoke('updates:download'),
    install: (): Promise<void> => ipcRenderer.invoke('updates:install'),
    onState: (callback: (state: unknown) => void): (() => void) => {
      const listener = (_event: unknown, state: unknown): void => callback(state)
      ipcRenderer.on('updates:state', listener)
      return () => ipcRenderer.removeListener('updates:state', listener)
    }
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
