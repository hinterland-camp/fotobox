import { ElectronAPI } from '@electron-toolkit/preload'
import type { FrameConfig, FrameVariant } from '../common/frames'

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
  savePrint(buffer: ArrayBuffer, sourcePath: string): Promise<string>
  print(filePath: string): Promise<boolean>
  upload(filePath: string): Promise<UploadResult | null>
  testConnection(): Promise<{ ok: boolean; message: string }>
  list(limit?: number): Promise<GalleryPhoto[]>
  getDataUrl(filePath: string): Promise<string | null>
  testPrint(): Promise<{ ok: boolean; message: string }>
  savePrintPreview(): Promise<{ ok: boolean; message: string; path?: string }>
  getLastPrintError(): Promise<string | null>
}

interface GalleryPhoto {
  path: string
  thumbnail: string
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

interface CameraAPI {
  getAccessStatus(): Promise<string>
}

interface FramesAPI {
  getAll(): Promise<Record<FrameVariant, FrameConfig>>
  getDataUrl(variant: FrameVariant): Promise<string | null>
  select(variant: FrameVariant): Promise<{ config: FrameConfig; dataUrl: string } | null>
  setLayout(variant: FrameVariant, layout: Pick<FrameConfig, 'photo' | 'qr'>): Promise<FrameConfig>
  clear(variant: FrameVariant): Promise<void>
}

type UpdateStatus =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'

interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  version: string | null
  releaseNotes: string | null
  percent: number
  error: string | null
}

interface UpdatesAPI {
  getState(): Promise<UpdateState>
  check(): Promise<UpdateState>
  download(): Promise<UpdateState>
  install(): Promise<void>
  onState(callback: (state: UpdateState) => void): () => void
}

interface FotoboxAPI {
  kiosk: KioskAPI
  settings: SettingsAPI
  photos: PhotosAPI
  uploadQueue: UploadQueueAPI
  printers: PrintersAPI
  camera: CameraAPI
  frames: FramesAPI
  updates: UpdatesAPI
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: FotoboxAPI
  }
}
