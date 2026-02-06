import { app, BrowserWindow, globalShortcut, ipcMain, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { electronApp, is } from '@electron-toolkit/utils'

let allowQuit = false

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
  countdownSeconds: 3,
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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.fotobox.desktop')

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
    ;(settings as unknown as Record<string, Settings[keyof Settings]>)[key] = value
    saveSettings(settings)
  })

  // --- Photos IPC handler ---

  ipcMain.handle('photos:save', async (_event, buffer: ArrayBuffer): Promise<string> => {
    const settings = loadSettings()
    const saveDir = settings.savePath || join(app.getPath('home'), 'Pictures', 'Fotobox')

    if (!existsSync(saveDir)) {
      mkdirSync(saveDir, { recursive: true })
    }

    const now = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const filename = `fotobox-${timestamp}.png`
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
  }
})

app.on('window-all-closed', () => {
  // Do nothing — kiosk mode should not quit on window close
})
