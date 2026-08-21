import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  net,
  powerSaveBlocker,
  session,
  shell,
  systemPreferences
} from 'electron'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { basename, dirname, join } from 'path'
import { electronApp, is } from '@electron-toolkit/utils'
import { setupUpdater } from './updater'
import {
  EMPTY_FRAME,
  fullFrameConfig,
  normaliseFrameConfig,
  type FrameConfig,
  type FrameVariant
} from '../common/frames'

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
let lastPrintError: string | null = null

export function setAllowQuit(value: boolean): void {
  allowQuit = value
}

// --- Settings ---

interface Settings {
  password: string
  cameraDeviceId: string
  /** The sheet that goes to the printer — carries the guest's download QR. */
  printFrame: FrameConfig
  /** The lighter artwork the guest downloads and posts. */
  shareFrame: FrameConfig
  printerName: string
  printSize: string
  printFit: string
  printRotation: string
  printScale: number
  serverUrl: string
  serverToken: string
  countdownSeconds: number
  savePath: string
  autoReturnSeconds: number
}

const defaultSettings: Settings = {
  password: 'admin',
  cameraDeviceId: '',
  printFrame: EMPTY_FRAME,
  shareFrame: EMPTY_FRAME,
  printerName: '',
  printSize: '4x6',
  printFit: 'contain',
  printRotation: 'auto',
  printScale: 100,
  serverUrl: '',
  serverToken: '',
  countdownSeconds: 6,
  savePath: join(app.getPath('home'), 'Pictures', 'Fotobox'),
  autoReturnSeconds: 30
}

// Page boxes exactly as the QW410 driver defines them (from DNP-QW410.ppd,
// PaperDimension in points / 72). They are larger than the nominal print: the
// driver expects overbleed and trims it, so "4x6" is really 4.22 x 6.12 in.
// Sending the nominal size leaves the sheet part white and shifts the image.
const PRINT_SIZES: Record<string, { widthIn: number; heightIn: number }> = {
  // 4x6 media roll
  '4x6': { widthIn: 303.84 / 72, heightIn: 440.64 / 72 },
  '4x4.5': { widthIn: 303.84 / 72, heightIn: 332.64 / 72 },
  '4x4': { widthIn: 303.84 / 72, heightIn: 296.64 / 72 },
  '4x3': { widthIn: 303.84 / 72, heightIn: 224.64 / 72 },
  // 4.5x8 media roll
  '4.5x8': { widthIn: 337.92 / 72, heightIn: 584.64 / 72 },
  '4.5x6': { widthIn: 337.92 / 72, heightIn: 440.64 / 72 },
  '4.5x4.5': { widthIn: 337.92 / 72, heightIn: 332.64 / 72 },
  '4.5x4': { widthIn: 337.92 / 72, heightIn: 296.64 / 72 },
  '4.5x3': { widthIn: 337.92 / 72, heightIn: 224.64 / 72 }
}

const MICRONS_PER_INCH = 25400

function getSettingsPath(): string {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, 'settings.json')
}

/** Reads the artwork's own pixel size, which every rect in its layout uses. */
function frameConfigForFile(path: string): FrameConfig {
  if (!path || !existsSync(path)) return EMPTY_FRAME
  const size = nativeImage.createFromPath(path).getSize()
  if (size.width <= 0 || size.height <= 0) return EMPTY_FRAME
  return fullFrameConfig(path, size.width, size.height)
}

/**
 * Booths upgraded from the single full-bleed overlay keep their artwork: it
 * becomes both sheets, photo filling the frame, exactly as it printed before.
 * The operator then points each variant at its own PNG.
 */
function migrateFrameSettings(stored: Record<string, unknown>): {
  printFrame: FrameConfig
  shareFrame: FrameConfig
} {
  const legacyPath = typeof stored.framePath === 'string' ? stored.framePath : ''
  const adopt = (value: unknown): FrameConfig => {
    if (value && typeof value === 'object') return normaliseFrameConfig(value as FrameConfig)
    return frameConfigForFile(legacyPath)
  }
  return { printFrame: adopt(stored.printFrame), shareFrame: adopt(stored.shareFrame) }
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
  const stored = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>
  const settings = { ...defaultSettings, ...stored, ...migrateFrameSettings(stored) }

  // Written back the first time, because working out a legacy layout means
  // decoding the artwork — and settings are read on nearly every IPC call.
  if (!stored.printFrame || !stored.shareFrame) {
    saveSettings(settings)
  }
  return settings
}

function saveSettings(settings: Settings): void {
  const settingsPath = getSettingsPath()
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

/** Print renders live beside the guest's copy so the gallery never lists them. */
const PRINT_SUBDIR = 'print'

function photoBaseDir(): string {
  const settings = loadSettings()
  return settings.savePath || join(app.getPath('home'), 'Pictures', 'Fotobox')
}

function newestPngIn(dir: string): { path: string; takenAt: number } | null {
  if (!existsSync(dir)) return null
  let newest: { path: string; takenAt: number } | null = null
  for (const name of readdirSync(dir)) {
    if (!name.toLowerCase().endsWith('.png')) continue
    const filePath = join(dir, name)
    const takenAt = statSync(filePath).mtimeMs
    if (!newest || takenAt > newest.takenAt) newest = { path: filePath, takenAt }
  }
  return newest
}

/**
 * What a test print should put on paper. Print renders win over the guest's
 * copy: they are the sheet the printer would actually receive, so testing
 * against anything else would tune the printer for the wrong artwork.
 */
function newestPhotoPath(): string | null {
  const baseDir = photoBaseDir()
  if (!existsSync(baseDir)) return null

  let newestPrint: { path: string; takenAt: number } | null = null
  let newestShare: { path: string; takenAt: number } | null = null
  for (const day of readdirSync(baseDir)) {
    const dayDir = join(baseDir, day)
    if (!statSync(dayDir).isDirectory()) continue
    for (const [found, keep] of [
      [newestPngIn(join(dayDir, PRINT_SUBDIR)), 'print'],
      [newestPngIn(dayDir), 'share']
    ] as const) {
      if (!found) continue
      if (keep === 'print') {
        if (!newestPrint || found.takenAt > newestPrint.takenAt) newestPrint = found
      } else if (!newestShare || found.takenAt > newestShare.takenAt) newestShare = found
    }
  }
  return (newestPrint ?? newestShare)?.path ?? null
}

interface PreparedPage {
  window: BrowserWindow
  cleanUp: () => void
  sheet: { widthIn: number; heightIn: number }
  /** Null unless the operator overrode the driver's own paper */
  requestedSize: { widthIn: number; heightIn: number } | undefined
}

/**
 * Lays the photo out on the sheet and holds it in an off-screen window, ready
 * for whoever asked — the printer, or a PDF the operator wants to look at
 * before burning a sheet of media. Both go through this, so a preview cannot
 * quietly disagree with what comes out of the printer.
 */
async function preparePrintPage(
  filePath: string
): Promise<{ ok: true; page: PreparedPage } | { ok: false; message: string }> {
  const settings = loadSettings()
  if (!existsSync(filePath)) {
    return { ok: false, message: 'The photo file is missing.' }
  }

  const printWindow = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: { sandbox: true }
  })

  // 'contain' scales the whole photo onto the sheet; 'cover' fills the sheet
  // and crops whatever falls outside it.
  const fit = settings.printFit === 'cover' ? 'cover' : 'contain'

  const photo = nativeImage.createFromPath(filePath).getSize()
  const size = PRINT_SIZES[settings.printSize]
  // With the printer's own paper we cannot know its shape; dye-sub media feeds
  // portrait, so assume that.
  const pagePortrait = size ? size.heightIn > size.widthIn : true

  // Rotate the photo ourselves rather than ask the driver for a landscape
  // page: that flag is routinely ignored, which left a landscape photo filling
  // half a portrait sheet with white bands around it.
  const rotation =
    settings.printRotation === 'auto'
      ? photo.width > photo.height && pagePortrait
        ? 90
        : 0
      : Number(settings.printRotation) || 0

  // A quarter turn swaps which page edge the photo's width runs along
  const quarterTurned = rotation === 90 || rotation === 270

  // Operator-tunable zoom for driver quirks that shift or overscan the page;
  // 100 fills the fitted box exactly, smaller shrinks toward the centre.
  const scalePct = Math.min(100, Math.max(50, Number(settings.printScale) || 100))

  // Lay the page out in inches, not viewport units: vh/vw resolve against the
  // window when printing, which sized the photo off the sheet entirely.
  const sheet = size ?? PRINT_SIZES['4x6']
  const boxWidthIn = quarterTurned ? sheet.heightIn : sheet.widthIn
  const boxHeightIn = quarterTurned ? sheet.widthIn : sheet.heightIn

  const html = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; }
  html, body { width: ${sheet.widthIn}in; height: ${sheet.heightIn}in; overflow: hidden; }
  .stage { position: relative; width: ${sheet.widthIn}in; height: ${sheet.heightIn}in; }
  img {
    position: absolute; top: 50%; left: 50%;
    width: ${boxWidthIn}in; height: ${boxHeightIn}in;
    object-fit: ${fit};
    transform: translate(-50%, -50%) rotate(${rotation}deg) scale(${scalePct / 100});
  }
  @page { size: ${sheet.widthIn}in ${sheet.heightIn}in; margin: 0; }
</style></head><body>
<div class="stage"><img src="file://${filePath.replace(/\\/g, '/')}" /></div>
</body></html>`

  // Written to a file rather than loaded from a data: URL: a data: URL is an
  // opaque origin, so the file:// image is blocked and the printer gets a
  // blank sheet.
  const pagePath = join(app.getPath('temp'), `fotobox-print-${process.pid}.html`)
  writeFileSync(pagePath, html, 'utf-8')

  const cleanUp = (): void => {
    printWindow.close()
    try {
      unlinkSync(pagePath)
    } catch {
      // Losing a temp file is not worth failing the print over
    }
  }

  try {
    await printWindow.loadFile(pagePath)

    // naturalWidth, not complete: a blocked or broken image also reports
    // complete, which is exactly how blank sheets got printed.
    const rendered = (await printWindow.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const img = document.querySelector('img');
        const done = () => resolve(img.naturalWidth > 0);
        if (img.complete) return done();
        img.onload = done;
        img.onerror = done;
        setTimeout(done, 5000);
      })
    `)) as boolean

    if (!rendered) {
      cleanUp()
      return { ok: false, message: 'The photo could not be rendered, so nothing was sent to the printer.' }
    }
  } catch (err) {
    cleanUp()
    return { ok: false, message: `Preparing the page failed: ${(err as Error).message}` }
  }

  return { ok: true, page: { window: printWindow, cleanUp, sheet, requestedSize: size } }
}

async function printPhotoFile(filePath: string): Promise<{ ok: boolean; message: string }> {
  const settings = loadSettings()
  if (!settings.printerName) {
    lastPrintError = 'No printer selected.'
    return { ok: false, message: lastPrintError }
  }

  const prepared = await preparePrintPage(filePath)
  if (!prepared.ok) {
    lastPrintError = prepared.message
    return { ok: false, message: lastPrintError }
  }
  const { window: printWindow, cleanUp, requestedSize: size } = prepared.page

  const base: Electron.WebContentsPrintOptions = {
    silent: true,
    deviceName: settings.printerName,
    printBackground: true,
    margins: { marginType: 'none' }
  }

  // The QW410 prints whatever roll is loaded, and drivers are fussy about a
  // custom page size, so the driver's own paper comes first. An explicit size
  // is only tried when the operator has overridden it, and a plain attempt
  // remains as a last resort — a photo on default paper beats no photo.
  const attempts: Array<{ label: string; options: Electron.WebContentsPrintOptions }> = []
  if (size) {
    attempts.push({
      label: `${settings.printSize} media`,
      options: {
        ...base,
        pageSize: {
          width: Math.round(size.widthIn * MICRONS_PER_INCH),
          height: Math.round(size.heightIn * MICRONS_PER_INCH)
        }
      }
    })
  }
  attempts.push({ label: "the printer's paper", options: base })
  attempts.push({
    label: 'driver defaults',
    options: { silent: true, deviceName: settings.printerName }
  })

  const failures: string[] = []
  for (const attempt of attempts) {
    const { ok, reason } = await new Promise<{ ok: boolean; reason: string }>((resolve) => {
      printWindow.webContents.print(attempt.options, (success, failureReason) =>
        resolve({ ok: success, reason: failureReason ?? '' })
      )
    })

    if (ok) {
      cleanUp()
      lastPrintError = null
      const message =
        failures.length > 0
          ? `Printed using ${attempt.label} after ${failures.join('; ')}`
          : `Sent to ${settings.printerName} using ${attempt.label}.`
      console.warn(`[print] ${message}`)
      return { ok: true, message }
    }

    failures.push(`${attempt.label}: ${reason || 'no reason given'}`)
    console.error(`[print] ${attempt.label} failed: ${reason}`)
  }

  cleanUp()
  lastPrintError = failures.join(' | ')
  return { ok: false, message: lastPrintError }
}

/**
 * Writes the sheet the printer would receive to a PDF instead. Same page, same
 * paper size — so an operator can check the layout of a new artwork without
 * feeding media through the printer to find out.
 */
async function printPhotoFileToPdf(
  filePath: string,
  outPath: string
): Promise<{ ok: boolean; message: string }> {
  const prepared = await preparePrintPage(filePath)
  if (!prepared.ok) return { ok: false, message: prepared.message }

  const { window: printWindow, cleanUp, sheet } = prepared.page
  try {
    // printToPDF takes inches, unlike webContents.print, which takes microns
    const pdf = await printWindow.webContents.printToPDF({
      pageSize: { width: sheet.widthIn, height: sheet.heightIn },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      printBackground: true
    })
    writeFileSync(outPath, pdf)
    return {
      ok: true,
      message: `Saved a ${sheet.widthIn.toFixed(2)} × ${sheet.heightIn.toFixed(2)} in preview to ${outPath}`
    }
  } catch (err) {
    return { ok: false, message: `Could not write the PDF: ${(err as Error).message}` }
  } finally {
    cleanUp()
  }
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

  // --- Frame overlay IPC handlers ---

  // The renderer runs on http:// in dev and file:// when packaged, and a
  // file:// image would either be blocked or taint the capture canvas. Handing
  // over a data URL sidesteps both.
  function frameToDataUrl(framePath: string): string | null {
    if (!framePath || !existsSync(framePath)) return null
    return `data:image/png;base64,${readFileSync(framePath).toString('base64')}`
  }

  const frameSettingKey = (variant: FrameVariant): 'printFrame' | 'shareFrame' =>
    variant === 'print' ? 'printFrame' : 'shareFrame'

  function readFrame(variant: FrameVariant): FrameConfig {
    return normaliseFrameConfig(loadSettings()[frameSettingKey(variant)])
  }

  function writeFrame(variant: FrameVariant, config: FrameConfig): FrameConfig {
    const settings = loadSettings()
    const normalised = normaliseFrameConfig(config)
    settings[frameSettingKey(variant)] = normalised
    saveSettings(settings)
    return normalised
  }

  ipcMain.handle('frames:getAll', (): Record<FrameVariant, FrameConfig> => {
    const settings = loadSettings()
    return {
      print: normaliseFrameConfig(settings.printFrame),
      share: normaliseFrameConfig(settings.shareFrame)
    }
  })

  ipcMain.handle('frames:getDataUrl', (_event, variant: FrameVariant): string | null =>
    frameToDataUrl(readFrame(variant).path)
  )

  ipcMain.handle(
    'frames:select',
    async (
      _event,
      variant: FrameVariant
    ): Promise<{ config: FrameConfig; dataUrl: string } | null> => {
      const win = BrowserWindow.getAllWindows()[0]
      const options = {
        title: variant === 'print' ? 'Select print artwork' : 'Select share artwork',
        filters: [{ name: 'PNG image', extensions: ['png'] }],
        properties: ['openFile' as const]
      }
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)

      const source = result.canceled ? undefined : result.filePaths[0]
      if (!source) return null

      // Keep our own copy: the frame must survive the original being moved or
      // the USB stick it came from being pulled out at the event.
      const stored = join(app.getPath('userData'), `frame-${variant}.png`)
      copyFileSync(source, stored)

      const previous = readFrame(variant)
      const fresh = frameConfigForFile(stored)
      if (!fresh.path) return null

      // Re-exporting the same artwork at the same size is the common case, so
      // hold on to a layout the operator has already dialled in rather than
      // making them measure the photo window again.
      const sameCanvas = previous.width === fresh.width && previous.height === fresh.height
      const config = writeFrame(
        variant,
        sameCanvas ? { ...previous, path: stored } : fresh
      )

      const dataUrl = frameToDataUrl(stored)
      return dataUrl ? { config, dataUrl } : null
    }
  )

  ipcMain.handle(
    'frames:setLayout',
    (_event, variant: FrameVariant, layout: Pick<FrameConfig, 'photo' | 'qr'>): FrameConfig =>
      writeFrame(variant, { ...readFrame(variant), photo: layout.photo, qr: layout.qr })
  )

  ipcMain.handle('frames:clear', (_event, variant: FrameVariant): void => {
    writeFrame(variant, EMPTY_FRAME)
  })

  // --- Photos IPC handler ---

  ipcMain.handle('photos:save', async (_event, buffer: ArrayBuffer): Promise<string> => {
    const baseDir = photoBaseDir()

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

  // The sheet is a second render of the same shot, so it is named after the
  // guest's copy and tucked into a subfolder — the gallery and the upload
  // queue only ever walk the day folder itself.
  ipcMain.handle(
    'photos:savePrint',
    async (_event, buffer: ArrayBuffer, sourcePath: string): Promise<string> => {
      const printDir = join(dirname(sourcePath), PRINT_SUBDIR)
      if (!existsSync(printDir)) {
        mkdirSync(printDir, { recursive: true })
      }
      const filePath = join(printDir, `${basename(sourcePath, '.png')}-print.png`)
      writeFileSync(filePath, Buffer.from(buffer))
      return filePath
    }
  )

  // --- Print IPC handler ---

  ipcMain.handle('photos:print', async (_event, filePath: string): Promise<boolean> => {
    const result = await printPhotoFile(filePath)
    return result.ok
  })

  ipcMain.handle('photos:getLastPrintError', (): string | null => lastPrintError)

  // Lets the operator iterate on printer settings without shooting photos
  ipcMain.handle('photos:testPrint', async (): Promise<{ ok: boolean; message: string }> => {
    const newest = newestPhotoPath()
    if (!newest) {
      return { ok: false, message: 'No photos yet — take one first, then test.' }
    }
    return printPhotoFile(newest)
  })

  // ...and to check a layout without spending a sheet of media on it
  ipcMain.handle(
    'photos:savePrintPreview',
    async (): Promise<{ ok: boolean; message: string; path?: string }> => {
      const newest = newestPhotoPath()
      if (!newest) {
        return { ok: false, message: 'No photos yet — take one first, then preview.' }
      }
      const outPath = join(dirname(newest), `${basename(newest, '.png')}.pdf`)
      const result = await printPhotoFileToPdf(newest, outPath)
      return result.ok ? { ...result, path: outPath } : result
    }
  )

  // --- Share IPC handler ---


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
        // The server rejects uploads without the shared token
        headers: settings.serverToken
          ? { Authorization: `Bearer ${settings.serverToken}` }
          : undefined,
        body: formData
      })

      if (!response.ok) {
        console.error(`[upload] ${url} responded ${response.status} ${response.statusText}`)
        return null
      }

      const result = (await response.json()) as { id: string; downloadUrl: string }
      return result
    }
  )

  ipcMain.handle(
    'photos:testConnection',
    async (): Promise<{ ok: boolean; message: string }> => {
      const settings = loadSettings()
      if (!settings.serverUrl) {
        return { ok: false, message: 'No server URL configured.' }
      }

      const url = `${settings.serverUrl.replace(/\/$/, '')}/api/photos`
      try {
        // Deliberately empty body: the server checks the token before it looks
        // for a file, so a 400 means the URL and token are both good without
        // leaving a stray photo behind.
        const response = await net.fetch(url, {
          method: 'POST',
          headers: settings.serverToken
            ? { Authorization: `Bearer ${settings.serverToken}` }
            : undefined,
          body: new FormData()
        })

        switch (response.status) {
          case 400:
            return { ok: true, message: 'Connected. Server URL and upload token are correct.' }
          case 401:
            return {
              ok: false,
              message: 'Server rejected the upload token (401). It must match NUXT_UPLOAD_TOKEN on the server.'
            }
          case 503:
            return {
              ok: false,
              message: 'Server has no upload token configured (503). Set NUXT_UPLOAD_TOKEN there.'
            }
          case 404:
            return {
              ok: false,
              message: 'No upload endpoint at this address (404). Check the server URL.'
            }
          default:
            return response.ok
              ? { ok: true, message: 'Connected.' }
              : { ok: false, message: `Server responded ${response.status} ${response.statusText}.` }
        }
      } catch (err) {
        return { ok: false, message: `Cannot reach the server: ${(err as Error).message}` }
      }
    }
  )

  interface GalleryPhoto {
    path: string
    thumbnail: string
  }

  ipcMain.handle('photos:list', (_event, limit = 60): GalleryPhoto[] => {
    const baseDir = photoBaseDir()
    if (!existsSync(baseDir)) return []

    const files: Array<{ path: string; takenAt: number }> = []
    for (const day of readdirSync(baseDir)) {
      const dayDir = join(baseDir, day)
      if (!statSync(dayDir).isDirectory()) continue
      for (const name of readdirSync(dayDir)) {
        if (!name.toLowerCase().endsWith('.png')) continue
        const filePath = join(dayDir, name)
        files.push({ path: filePath, takenAt: statSync(filePath).mtimeMs })
      }
    }

    files.sort((a, b) => b.takenAt - a.takenAt)

    // Thumbnails rather than full images: a long event fills this folder, and
    // the grid would otherwise ship tens of megabytes over IPC.
    return files.slice(0, limit).flatMap((file) => {
      const image = nativeImage.createFromPath(file.path)
      if (image.isEmpty()) return []
      return [{ path: file.path, thumbnail: image.resize({ width: 360 }).toDataURL() }]
    })
  })

  ipcMain.handle('photos:getDataUrl', (_event, filePath: string): string | null => {
    if (!existsSync(filePath)) return null
    return `data:image/png;base64,${readFileSync(filePath).toString('base64')}`
  })

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
        const response = await net.fetch(url, {
          method: 'POST',
          headers: settings.serverToken
            ? { Authorization: `Bearer ${settings.serverToken}` }
            : undefined,
          body: formData
        })
        if (!response.ok) {
          console.error(`[upload retry] ${url} responded ${response.status}`)
          return null
        }
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

  setupUpdater({ allowQuit: () => setAllowQuit(true) })

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
