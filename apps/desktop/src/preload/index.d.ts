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

interface UploadResult {
  id: string
  downloadUrl: string
}

interface PhotosAPI {
  save(buffer: ArrayBuffer): Promise<string>
  print(filePath: string): Promise<boolean>
  share(filePath: string): Promise<boolean>
  upload(filePath: string): Promise<UploadResult | null>
}

interface QueueItem {
  filePath: string
  addedAt: string
}

interface UploadQueueAPI {
  getAll(): Promise<QueueItem[]>
  add(filePath: string): Promise<void>
  remove(filePath: string): Promise<void>
  retryOne(filePath: string): Promise<UploadResult | null>
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
  uploadQueue: UploadQueueAPI
  printers: PrintersAPI
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: FotoboxAPI
  }
}
