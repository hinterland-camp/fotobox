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

interface FotoboxAPI {
  kiosk: KioskAPI
  settings: SettingsAPI
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: FotoboxAPI
  }
}
