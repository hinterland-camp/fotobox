import { ElectronAPI } from '@electron-toolkit/preload'

interface KioskAPI {
  validatePassword(password: string): Promise<boolean>
  exitToSettings(): Promise<void>
  enterKiosk(): Promise<void>
}

interface SettingsAPI {
  getAll(): Promise<Record<string, unknown>>
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
}

interface PhotosAPI {
  save(buffer: ArrayBuffer): Promise<string>
  print(filePath: string): Promise<boolean>
  share(filePath: string): Promise<boolean>
}

interface PrinterInfo {
  name: string
  displayName: string
}

interface PrintersAPI {
  getAll(): Promise<PrinterInfo[]>
}

interface FotoboxAPI {
  kiosk: KioskAPI
  settings: SettingsAPI
  photos: PhotosAPI
  printers: PrintersAPI
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: FotoboxAPI
  }
}
