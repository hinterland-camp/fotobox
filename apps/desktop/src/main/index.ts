import { app, BrowserWindow, globalShortcut, shell } from 'electron'
import { join } from 'path'
import { electronApp, is } from '@electron-toolkit/utils'

let allowQuit = false

export function setAllowQuit(value: boolean): void {
  allowQuit = value
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
