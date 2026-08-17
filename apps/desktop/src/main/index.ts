import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  net,
  powerSaveBlocker,
  session,
  ShareMenu,
  shell,
  systemPreferences
} from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { electronApp, is } from '@electron-toolkit/utils'

// --- Upload Queue ---

interface QueueItem {
  filePath: string
  addedAt: string
}

function getUploadQueuePath(): string {
  return join(app.getPath('userData'), 'upload-queue.json')
}

function loadUploadQueue(): QueueItem[] {
  const queuePath = getUploadQueuePath()
  if (!existsSync(queuePath)) return []
  try {
    const raw = readFileSync(queuePath, 'utf-8')
    return JSON.parse(raw) as QueueItem[]
  } catch {
    return []
  }
}

function saveUploadQueue(queue: QueueItem[]): void {
  writeFileSync(getUploadQueuePath(), JSON.stringify(queue, null, 2), 'utf-8')
}

function addToUploadQueue(filePath: string): void {
  const queue = loadUploadQueue()
  // Avoid duplicates
  if (queue.some((item) => item.filePath === filePath)) return
  queue.push({ filePath, addedAt: new Date().toISOString() })
  saveUploadQueue(queue)
}

function removeFromUploadQueue(filePath: string): void {
  const queue = loadUploadQueue().filter((item) => item.filePath !== filePath)
  saveUploadQueue(queue)
}

let allowQuit = false
let powerSaveBlockerId: number | null = null
let cameraAccessRefused = false

export function setAllowQuit(value: boolean): void {
  allowQuit = value
}

// --- Settings ---

interface Settings {
  password: string
  cameraDeviceId: string
  framePath: string
  printerName: string
  serverUrl: string
  countdownSeconds: number
  savePath: string
  autoReturnSeconds: number
}

const defaultSettings: Settings = {
  password: 'admin',
  cameraDeviceId: '',
  framePath: '',
  printerName: '',
  serverUrl: '',
  countdownSeconds: 6,
  savePath: join(app.getPath('home'), 'Pictures', 'Fotobox'),
  autoReturnSeconds: 30
}

function getSettingsPath(): string {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, 'settings.json')
}

function loadSettings(): Settings {
  const settingsPath = getSettingsPath()
  if (!existsSync(settingsPath)) {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2), 'utf-8')
    return { ...defaultSettings }
  }
  const raw = readFileSync(settingsPath, 'utf-8')
  return { ...defaultSettings, ...JSON.parse(raw) }
}

function saveSettings(settings: Settings): void {
  const settingsPath = getSettingsPath()
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    show: false,
    fullscreen: true,
    kiosk: true,
    frame: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Prevent window close unless explicitly allowed
  mainWindow.on('close', (e) => {
    if (!allowQuit) {
      e.preventDefault()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('camp.hinterland.fotobox')

  // macOS hands back a black frame instead of an error when camera access has
  // not been granted through TCC, so ask for it before any window can call
  // getUserMedia. No-op on Windows, where the booth actually runs.
  if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('camera') !== 'granted') {
    // A refused request leaves the status at 'not-determined' (macOS attributes
    // it to the launching app), so remember the failure — otherwise the booth
    // silently shows black frames with nothing to explain them.
    cameraAccessRefused = !(await systemPreferences.askForMediaAccess('camera'))
  }

  // Auto-launch on boot (packaged builds only, so dev runs don't register autostart)
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true })
  }

  // Prevent the display from sleeping while the kiosk is running
  powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep')

  // Grant camera access without a prompt — the booth is unattended, so a
  // permission dialog the guest cannot answer would stall the whole flow.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media')

  // Block OS keyboard shortcuts that could exit kiosk mode
  const blockedShortcuts = [
    'Alt+F4',
    'CommandOrControl+Q',
    'CommandOrControl+W'
  ]

  for (const shortcut of blockedShortcuts) {
    globalShortcut.register(shortcut, () => {
      // Intentionally empty — block the shortcut
    })
  }

  // --- IPC handlers ---

  ipcMain.handle('kiosk:validatePassword', (_event, password: string): boolean => {
    const settings = loadSettings()
    return password === settings.password
  })

  ipcMain.handle('kiosk:exitToSettings', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.setKiosk(false)
      win.setFullScreen(false)
      win.setAlwaysOnTop(false)
    }
  })

  ipcMain.handle('kiosk:enterKiosk', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.setAlwaysOnTop(true)
      win.setFullScreen(true)
      win.setKiosk(true)
    }
  })

  // --- Settings IPC handlers ---

  ipcMain.handle('settings:getAll', (): Settings => {
    return loadSettings()
  })

  ipcMain.handle('settings:get', (_event, key: keyof Settings): Settings[keyof Settings] => {
    const settings = loadSettings()
    return settings[key]
  })

  ipcMain.handle('settings:set', (_event, key: keyof Settings, value: Settings[keyof Settings]) => {
    const settings = loadSettings()
      ; (settings as unknown as Record<string, Settings[keyof Settings]>)[key] = value
    saveSettings(settings)
  })

  // --- Photos IPC handler ---

  ipcMain.handle('photos:save', async (_event, buffer: ArrayBuffer): Promise<string> => {
    const settings = loadSettings()
    const baseDir = settings.savePath || join(app.getPath('home'), 'Pictures', 'Fotobox')

    const now = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`

    // One folder per event day, so a multi-day event stays sorted on disk
    const saveDir = join(baseDir, date)
    if (!existsSync(saveDir)) {
      mkdirSync(saveDir, { recursive: true })
    }

    const filename = `fotobox-${date}-${time}.png`
    const filePath = join(saveDir, filename)

    writeFileSync(filePath, Buffer.from(buffer))
    return filePath
  })

  // --- Print IPC handler ---

  ipcMain.handle('photos:print', async (_event, filePath: string): Promise<boolean> => {
    const settings = loadSettings()
    const printerName = settings.printerName
    if (!printerName) return false

    // Create a hidden window to render and print the photo
    const printWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: { sandbox: true }
    })

    const html = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; }
  body { display: flex; align-items: center; justify-content: center; }
  img { max-width: 100%; max-height: 100vh; }
  @media print { @page { margin: 0; } body { margin: 0; } img { max-width: 100%; max-height: 100%; } }
</style></head><body>
<img src="file://${filePath.replace(/\\/g, '/')}" />
</body></html>`

    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

    // Wait for the image to load
    await printWindow.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const img = document.querySelector('img');
        if (img.complete) resolve(); else img.onload = resolve;
      })
    `)

    return new Promise<boolean>((resolve) => {
      printWindow.webContents.print(
        { silent: true, deviceName: printerName },
        (success, failureReason) => {
          printWindow.close()
          if (!success) {
            console.error('Print failed:', failureReason)
          }
          resolve(success)
        }
      )
    })
  })

  // --- Share IPC handler ---

  ipcMain.handle('photos:share', async (_event, filePath: string): Promise<boolean> => {
    if (!existsSync(filePath)) return false

    if (process.platform === 'darwin') {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) return false
      const menu = new ShareMenu({ filePaths: [filePath] })
      menu.popup({ window: win })
      return true
    }

    // Fallback: Save As dialog for Windows/Linux
    const result = await dialog.showSaveDialog({
      defaultPath: filePath,
      filters: [{ name: 'Images', extensions: ['png'] }]
    })

    if (result.canceled || !result.filePath) return false

    copyFileSync(filePath, result.filePath)
    return true
  })

  // --- Upload IPC handler ---

  ipcMain.handle(
    'photos:upload',
    async (_event, filePath: string): Promise<{ id: string; downloadUrl: string } | null> => {
      const settings = loadSettings()
      const serverUrl = settings.serverUrl
      if (!serverUrl) return null

      if (!existsSync(filePath)) return null

      const fileData = readFileSync(filePath)
      const filename = basename(filePath)
      const mimeType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg'

      const formData = new FormData()
      formData.append('image', new Blob([fileData], { type: mimeType }), filename)

      const url = `${serverUrl.replace(/\/$/, '')}/api/photos`
      const response = await net.fetch(url, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) return null

      const result = (await response.json()) as { id: string; downloadUrl: string }
      return result
    }
  )

  // --- Upload Queue IPC handlers ---

  ipcMain.handle('uploadQueue:getAll', (): QueueItem[] => {
    return loadUploadQueue()
  })

  ipcMain.handle('uploadQueue:add', (_event, filePath: string) => {
    addToUploadQueue(filePath)
  })

  ipcMain.handle('uploadQueue:remove', (_event, filePath: string) => {
    removeFromUploadQueue(filePath)
  })

  ipcMain.handle(
    'uploadQueue:retryOne',
    async (_event, filePath: string): Promise<{ id: string; downloadUrl: string } | null> => {
      const settings = loadSettings()
      const serverUrl = settings.serverUrl
      if (!serverUrl) return null
      if (!existsSync(filePath)) {
        removeFromUploadQueue(filePath)
        return null
      }

      const fileData = readFileSync(filePath)
      const filename = basename(filePath)
      const mimeType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg'

      const formData = new FormData()
      formData.append('image', new Blob([fileData], { type: mimeType }), filename)

      const url = `${serverUrl.replace(/\/$/, '')}/api/photos`
      try {
        const response = await net.fetch(url, { method: 'POST', body: formData })
        if (!response.ok) return null
        const result = (await response.json()) as { id: string; downloadUrl: string }
        removeFromUploadQueue(filePath)
        return result
      } catch {
        return null
      }
    }
  )

  // --- Camera IPC handler ---

  ipcMain.handle('camera:getAccessStatus', (): string => {
    if (process.platform !== 'darwin') return 'granted'
    if (cameraAccessRefused) return 'denied'
    return systemPreferences.getMediaAccessStatus('camera')
  })

  // --- Printers IPC handler ---

  ipcMain.handle('printers:getAll', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return []
    const printers = await win.webContents.getPrintersAsync()
    return printers.map((p) => ({ name: p.name, displayName: p.displayName }))
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Prevent quitting unless explicitly allowed
app.on('before-quit', (e) => {
  if (!allowQuit) {
    e.preventDefault()
    return
  }
  if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
    powerSaveBlocker.stop(powerSaveBlockerId)
    powerSaveBlockerId = null
  }
})

app.on('window-all-closed', () => {
  // Do nothing — kiosk mode should not quit on window close
})
