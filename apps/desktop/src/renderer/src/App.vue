<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import CameraPreview from './components/CameraPreview.vue'
import CountdownOverlay from './components/CountdownOverlay.vue'
import PasswordDialog from './components/PasswordDialog.vue'
import ResultScreen from './components/ResultScreen.vue'
import PhotoGallery from './components/PhotoGallery.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import { coverCrop, EMPTY_FRAME, type FrameConfig } from '../../common/frames'
import { layoutFor, loadImage, renderQrCode, renderSheet } from './lib/sheets'

type Screen = 'photobooth' | 'result' | 'settings'

const currentScreen = ref<Screen>('photobooth')
const showPasswordDialog = ref(false)
const showGallery = ref(false)
const settingsLoaded = ref(false)
const cameraDeviceId = ref('')
const countdownSeconds = ref(3)
const autoReturnSeconds = ref(30)
const printerName = ref('')
const countdownActive = ref(false)
const cameraPreviewRef = ref<InstanceType<typeof CameraPreview> | null>(null)

// Every shot is rendered twice: the sheet that goes on paper carries the
// guest's download QR, the lighter artwork is what they take home and post.
const printFrame = ref<FrameConfig>(EMPTY_FRAME)
const shareFrame = ref<FrameConfig>(EMPTY_FRAME)
let printFrameImage: HTMLImageElement | null = null
let shareFrameImage: HTMLImageElement | null = null

async function loadFrames(): Promise<void> {
  const frames = await window.api.frames.getAll()
  printFrame.value = frames.print
  shareFrame.value = frames.share

  // Decoded once at start-up: these are multi-megabyte PNGs, and decoding one
  // between the shutter and the result screen is a visible stall.
  const [printUrl, shareUrl] = await Promise.all([
    window.api.frames.getDataUrl('print'),
    window.api.frames.getDataUrl('share')
  ])
  printFrameImage = printUrl ? await loadImage(printUrl) : null
  shareFrameImage = shareUrl ? await loadImage(shareUrl) : null
}

async function loadPhotoboothSettings(): Promise<void> {
  try {
    const settings = (await window.api.settings.getAll()) as Record<string, unknown>
    cameraDeviceId.value = (settings.cameraDeviceId as string) || ''
    countdownSeconds.value = (settings.countdownSeconds as number) || 3
    autoReturnSeconds.value = (settings.autoReturnSeconds as number) || 30
    printerName.value = (settings.printerName as string) || ''
    serverUrl.value = (settings.serverUrl as string) || ''
    await loadFrames()
  } finally {
    // Mount the camera only once the configured device id is known, so the
    // preview never starts on the default camera and then has to switch.
    settingsLoaded.value = true
  }
}

/**
 * The size every shot is taken at. The print sheet leads, because paper is the
 * unforgiving one; the share artwork cuts its own window from the same frame.
 * Falling back to the camera's own size keeps a booth with no artwork working.
 */
const captureSize = computed(() => {
  for (const frame of [printFrame.value, shareFrame.value]) {
    if (frame.path && frame.photo.width > 0 && frame.photo.height > 0) {
      return { width: frame.photo.width, height: frame.photo.height }
    }
  }
  return null
})

// Guests see a plain camera, never the artwork — the frame is a reveal on the
// result screen. All the preview borrows from the layout is its shape, so the
// crop nobody can see coming is at least the crop they are lining up for.
//
// Sized with min() rather than aspect-ratio: clamping one axis of an
// aspect-ratio box leaves the other where it was, which stretches the preview
// on a screen narrower than the shot. This is `contain`, on any screen.
const previewShapeStyle = computed(() => {
  const size = captureSize.value
  if (!size) return {}
  const { width, height } = size
  return {
    width: `min(100vw, calc(100vh * ${width} / ${height}))`,
    height: `min(100vh, calc(100vw * ${height} / ${width}))`
  }
})

function handlePhotoboothClick(): void {
  if (showPasswordDialog.value || showGallery.value) return
  // Tapping again during the countdown cancels it — guests change their mind
  countdownActive.value = !countdownActive.value
}

/**
 * Shoots at exactly the size the artwork's photo window expects, centre-cropped
 * from the camera rather than squashed. Laying the shot into the sheet is then
 * a straight copy, with no late re-fitting to soften it.
 */
function capturePhoto(): HTMLCanvasElement | null {
  const video = cameraPreviewRef.value?.videoRef
  if (!video || video.readyState < video.HAVE_CURRENT_DATA) return null
  if (video.videoWidth === 0 || video.videoHeight === 0) return null

  const target = captureSize.value ?? { width: video.videoWidth, height: video.videoHeight }

  const canvas = document.createElement('canvas')
  canvas.width = target.width
  canvas.height = target.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.imageSmoothingQuality = 'high'
  const crop = coverCrop(video.videoWidth, video.videoHeight, {
    x: 0,
    y: 0,
    width: target.width,
    height: target.height
  })
  ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, target.width, target.height)
  return canvas
}

interface UploadResult {
  id: string
  downloadUrl: string
}

type UploadStatus = 'idle' | 'uploading' | 'success' | 'failed'

const sharePhotoDataUrl = ref<string | null>(null)
const savedPhotoPath = ref<string | null>(null)
const uploadResult = ref<UploadResult | null>(null)
const uploadStatus = ref<UploadStatus>('idle')
const serverUrl = ref('')
type PrintState = 'idle' | 'printing' | 'printed' | 'failed'

const printState = ref<PrintState>('idle')
const printCount = ref(0)
const printToast = ref<string | null>(null)
let printToastTimer: ReturnType<typeof setTimeout> | null = null
let retryIntervalId: ReturnType<typeof setInterval> | null = null

let rawCapture: HTMLCanvasElement | null = null
let uploadInFlight: Promise<void> | null = null
// The sheet is rendered on demand and cached against the code it was given, so
// a second copy is instant but a first print that beat the upload is redone
// once the guest's own link exists.
let printSheet: { path: string; qrUrl: string | null } | null = null

async function savePhoto(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  return window.api.photos.save(buffer)
}

function fullDownloadUrl(result: UploadResult): string {
  return serverUrl.value.replace(/\/$/, '') + result.downloadUrl
}

async function uploadPhoto(filePath: string): Promise<void> {
  if (!serverUrl.value) {
    uploadStatus.value = 'idle'
    return
  }

  uploadStatus.value = 'uploading'
  try {
    const result = await window.api.photos.upload(filePath)
    if (result) {
      uploadResult.value = result
      uploadStatus.value = 'success'
    } else {
      await window.api.uploadQueue.add(filePath)
      uploadStatus.value = 'failed'
    }
  } catch {
    await window.api.uploadQueue.add(filePath)
    uploadStatus.value = 'failed'
  }
}

async function retryQueuedUploads(): Promise<void> {
  const queue = await window.api.uploadQueue.getAll()
  if (queue.length === 0) return

  for (const item of queue) {
    const result = await window.api.uploadQueue.retryOne(item.filePath)
    if (result) {
      // Successfully uploaded — item already removed from queue in main process
    }
    // If failed, item stays in queue for next retry cycle
  }
}

async function handleCountdownComplete(): Promise<void> {
  const capture = capturePhoto()
  if (capture) {
    rawCapture = capture

    // The guest's copy is what gets saved and uploaded; the printed sheet is
    // only rendered if someone actually asks for paper.
    const share = await renderSheet(
      layoutFor(shareFrame.value, capture),
      capture,
      shareFrameImage,
      null
    )
    sharePhotoDataUrl.value = share.dataUrl

    const filePath = await savePhoto(share.blob)
    savedPhotoPath.value = filePath

    // Upload silently in the background (no await — non-blocking)
    uploadInFlight = uploadPhoto(filePath)

    // Transition to result screen
    currentScreen.value = 'result'
  }
  countdownActive.value = false
}

// Long enough to cover a slow event Wi-Fi, short enough that a guest waiting
// at the printer does not think the booth has hung.
const PRINT_UPLOAD_WAIT_MS = 8000

/**
 * The link the printed QR should point at, or null when the photo has not
 * reached the server yet — in which case the artwork keeps the designer's own
 * code rather than getting a dead one stamped over it.
 */
async function downloadUrlForPrint(): Promise<string | null> {
  if (uploadResult.value) return fullDownloadUrl(uploadResult.value)
  if (uploadInFlight && uploadStatus.value === 'uploading') {
    await Promise.race([
      uploadInFlight,
      new Promise((resolve) => setTimeout(resolve, PRINT_UPLOAD_WAIT_MS))
    ])
  }
  return uploadResult.value ? fullDownloadUrl(uploadResult.value) : null
}

/** Renders and saves the sheet, reusing the last one when nothing has changed. */
async function preparePrintSheet(): Promise<{ path: string; qrUrl: string | null } | null> {
  const capture = rawCapture
  const sourcePath = savedPhotoPath.value
  if (!capture || !sourcePath) return null

  const layout = layoutFor(printFrame.value, capture)
  const qrUrl = layout.qr ? await downloadUrlForPrint() : null
  if (printSheet && printSheet.qrUrl === qrUrl) return printSheet

  const qr = layout.qr && qrUrl ? await renderQrCode(qrUrl, layout.qr.width) : null
  const sheet = await renderSheet(layout, capture, printFrameImage, qr)
  const path = await window.api.photos.savePrint(await sheet.blob.arrayBuffer(), sourcePath)

  printSheet = { path, qrUrl }
  return printSheet
}

function showPrintToast(message: string): void {
  printToast.value = message
  if (printToastTimer) clearTimeout(printToastTimer)
  printToastTimer = setTimeout(() => {
    printToast.value = null
  }, 3000)
}

async function handlePrint(): Promise<void> {
  if (!savedPhotoPath.value || printState.value === 'printing') return

  printState.value = 'printing'

  let sheet: { path: string; qrUrl: string | null } | null = null
  try {
    sheet = await preparePrintSheet()
  } catch (err) {
    console.error('[print] preparing the sheet failed', err)
  }

  if (!sheet) {
    printState.value = 'failed'
    showPrintToast('Printing failed. The sheet could not be prepared.')
    return
  }

  const success = await window.api.photos.print(sheet.path)

  if (success) {
    printCount.value++
    printState.value = 'printed'
    if (printFrame.value.qr && !sheet.qrUrl) {
      showPrintToast('Printed — but your photo had not uploaded, so the code is the general one.')
    }
  } else {
    printState.value = 'failed'
    showPrintToast('Printing failed. Please check your printer.')
  }
}

function handleAdminClick(): void {
  if (countdownActive.value) return
  showPasswordDialog.value = true
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && currentScreen.value === 'photobooth' && !showPasswordDialog.value) {
    showPasswordDialog.value = true
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  loadPhotoboothSettings()

  // Background retry for queued uploads every 30 seconds
  retryIntervalId = setInterval(retryQueuedUploads, 30_000)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  if (printToastTimer) clearTimeout(printToastTimer)
  if (retryIntervalId) clearInterval(retryIntervalId)
})

function handlePasswordCancel(): void {
  showPasswordDialog.value = false
}

async function handlePasswordSuccess(): Promise<void> {
  showPasswordDialog.value = false
  await window.api.kiosk.exitToSettings()
  currentScreen.value = 'settings'
}

function handleNewPhoto(): void {
  rawCapture = null
  uploadInFlight = null
  printSheet = null
  sharePhotoDataUrl.value = null
  savedPhotoPath.value = null
  uploadResult.value = null
  uploadStatus.value = 'idle'
  printState.value = 'idle'
  printCount.value = 0
  currentScreen.value = 'photobooth'
}

async function returnToPhotobooth(): Promise<void> {
  await window.api.kiosk.enterKiosk()
  await loadPhotoboothSettings()
  handleNewPhoto()
}
</script>

<template>
  <Transition name="fade" mode="out-in">
    <!-- Photobooth Screen -->
    <div
      v-if="currentScreen === 'photobooth'"
      key="photobooth"
      class="kiosk-cursor-hidden relative h-screen w-screen bg-black"
      @click="handlePhotoboothClick"
    >
      <!-- Live camera, cropped to the shape the shot will be taken at. No
           artwork here on purpose: the framed photo is the reveal afterwards. -->
      <div
        v-if="settingsLoaded && captureSize"
        class="absolute inset-0 flex items-center justify-center"
      >
        <div class="overflow-hidden" :style="previewShapeStyle">
          <CameraPreview ref="cameraPreviewRef" :camera-device-id="cameraDeviceId" />
        </div>
      </div>

      <!-- No artwork configured: the whole camera frame is the photo -->
      <CameraPreview
        v-else-if="settingsLoaded"
        ref="cameraPreviewRef"
        :camera-device-id="cameraDeviceId"
      />

      <!-- Bottom gradient for text readability -->
      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/60 to-transparent"
      />

      <!-- Cancel hint while the countdown runs -->
      <div
        v-if="countdownActive"
        class="pointer-events-none absolute inset-x-0 bottom-10 z-50 flex justify-center"
      >
        <p class="text-lg font-medium tracking-wide text-white/70 drop-shadow-lg">
          Tap to cancel
        </p>
      </div>

      <!-- Tap prompt -->
      <div
        v-else
        class="absolute inset-x-0 bottom-10 flex justify-center"
      >
        <div class="animate-float flex flex-col items-center gap-3">
          <div
            class="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 backdrop-blur-md"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              class="h-7 w-7 text-white"
            >
              <path d="M12 9a3.75 3.75 0 1 0 0 7.5A3.75 3.75 0 0 0 12 9Z" />
              <path
                fill-rule="evenodd"
                d="M9.344 3.071a49.52 49.52 0 0 1 5.312 0c.967.052 1.83.585 2.332 1.39l.821 1.317c.24.383.645.643 1.11.71.386.054.77.113 1.152.177 1.432.239 2.429 1.493 2.429 2.909V18a3 3 0 0 1-3 3H4.5a3 3 0 0 1-3-3V9.574c0-1.416.997-2.67 2.429-2.909.382-.064.766-.123 1.151-.178a1.56 1.56 0 0 0 1.11-.71l.822-1.315a2.942 2.942 0 0 1 2.332-1.39ZM12 17.25a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
          <p class="text-lg font-medium tracking-wide text-white/90 drop-shadow-lg">
            Tap to take a photo
          </p>
        </div>
      </div>

      <!-- Gallery of photos taken so far -->
      <button
        v-if="!countdownActive"
        class="absolute bottom-3 right-3 z-10 flex items-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm font-semibold text-white/80 backdrop-blur-md transition-transform active:scale-[0.97]"
        @click.stop="showGallery = true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          class="h-5 w-5"
        >
          <path
            d="M3.75 3.75h6v6h-6v-6ZM14.25 3.75h6v6h-6v-6ZM3.75 14.25h6v6h-6v-6ZM14.25 14.25h6v6h-6v-6Z"
          />
        </svg>
        Photos
      </button>

      <!-- Admin button (barely visible gear icon in bottom-left) -->
      <button
        class="absolute bottom-3 left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full text-white/[0.07] transition-opacity duration-500 active:text-white/25"
        @click.stop="handleAdminClick"
        aria-label="Admin settings"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          class="h-5 w-5"
        >
          <path
            fill-rule="evenodd"
            d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z"
            clip-rule="evenodd"
          />
        </svg>
      </button>

      <!-- Countdown overlay -->
      <CountdownOverlay
        :active="countdownActive"
        :duration="countdownSeconds"
        @complete="handleCountdownComplete"
      />
    </div>

    <!-- Result Screen -->
    <ResultScreen
      v-else-if="currentScreen === 'result' && sharePhotoDataUrl"
      key="result"
      class="kiosk-cursor-hidden"
      :photo-data-url="sharePhotoDataUrl"
      :auto-return-seconds="autoReturnSeconds"
      :printer-configured="!!printerName"
      :print-state="printState"
      :print-count="printCount"
      :upload-status="uploadStatus"
      :upload-result="uploadResult"
      :server-url="serverUrl"
      @new-photo="handleNewPhoto"
      @print="handlePrint"
    />

    <!-- Settings Screen -->
    <SettingsPanel
      v-else-if="currentScreen === 'settings'"
      key="settings"
      @return-to-photobooth="returnToPhotobooth"
    />
  </Transition>

  <!-- Photo gallery -->
  <PhotoGallery :visible="showGallery" @close="showGallery = false" />

  <!-- Password Dialog -->
  <PasswordDialog
    :visible="showPasswordDialog"
    @cancel="handlePasswordCancel"
    @success="handlePasswordSuccess"
  />

  <!-- Print toast notification -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="printToast"
        class="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-red-500/90 px-6 py-4 text-base font-medium text-white shadow-2xl backdrop-blur-md"
      >
        {{ printToast }}
      </div>
    </Transition>
  </Teleport>
</template>
