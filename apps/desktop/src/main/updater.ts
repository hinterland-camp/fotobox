import { app, BrowserWindow, ipcMain } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

export type UpdateStatus =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  version: string | null
  releaseNotes: string | null
  percent: number
  error: string | null
}

// Checked once at launch and then twice a day — the booth runs for hours at a
// time, so a long-lived session should still notice a release.
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000

let state: UpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  version: null,
  releaseNotes: null,
  percent: 0,
  error: null,
}

function setState(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('updates:state', state)
  }
}

function toNotes(notes: unknown): string | null {
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    return notes.map((n) => (n as { note?: string }).note ?? '').join('\n\n').trim() || null
  }
  return null
}

interface UpdaterOptions {
  // The kiosk blocks quitting, so installing has to lift that guard first
  allowQuit: () => void
}

export function setupUpdater({ allowQuit }: UpdaterOptions): void {
  ipcMain.handle('updates:getState', (): UpdateState => state)

  // An unpackaged app has no update feed to talk to
  if (!app.isPackaged) {
    state = { ...state, status: 'unsupported' }
    ipcMain.handle('updates:check', () => state)
    ipcMain.handle('updates:download', () => state)
    ipcMain.handle('updates:install', () => undefined)
    return
  }

  // The operator decides when to pull a release — a booth mid-event should
  // never start downloading or restart on its own.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => setState({ status: 'checking', error: null }))

  autoUpdater.on('update-available', (info) =>
    setState({
      status: 'available',
      version: info.version,
      releaseNotes: toNotes(info.releaseNotes),
      percent: 0,
    })
  )

  autoUpdater.on('update-not-available', () =>
    setState({ status: 'idle', version: null, percent: 0 })
  )

  autoUpdater.on('download-progress', (progress) =>
    setState({ status: 'downloading', percent: Math.round(progress.percent) })
  )

  autoUpdater.on('update-downloaded', (info) =>
    setState({ status: 'ready', version: info.version, percent: 100 })
  )

  autoUpdater.on('error', (err) =>
    setState({ status: 'error', error: err?.message ?? 'Update failed' })
  )

  ipcMain.handle('updates:check', async (): Promise<UpdateState> => {
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      setState({ status: 'error', error: (err as Error).message })
    }
    return state
  })

  ipcMain.handle('updates:download', async (): Promise<UpdateState> => {
    if (state.status !== 'available') return state
    try {
      setState({ status: 'downloading', percent: 0 })
      await autoUpdater.downloadUpdate()
    } catch (err) {
      setState({ status: 'error', error: (err as Error).message })
    }
    return state
  })

  ipcMain.handle('updates:install', (): void => {
    if (state.status !== 'ready') return
    allowQuit()
    // isSilent false so the NSIS installer can prompt for elevation
    autoUpdater.quitAndInstall(false, true)
  })

  autoUpdater.checkForUpdates().catch(() => {
    // A booth without connectivity is normal — the queue retries later
  })
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, CHECK_INTERVAL_MS)
}
