<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import CameraPreview from './components/CameraPreview.vue'
import CountdownOverlay from './components/CountdownOverlay.vue'
import PasswordDialog from './components/PasswordDialog.vue'
import ResultScreen from './components/ResultScreen.vue'
import SettingsPanel from './components/SettingsPanel.vue'

interface CompositedPhoto {
  dataUrl: string
  blob: Blob
}

type Screen = 'photobooth' | 'result' | 'settings'

const currentScreen = ref<Screen>('photobooth')
const showPasswordDialog = ref(false)
const settingsLoaded = ref(false)
const cameraDeviceId = ref('')
const frameDataUrl = ref('')
const countdownSeconds = ref(3)
const autoReturnSeconds = ref(30)
const printerName = ref('')
const countdownActive = ref(false)
const capturedPhotoDataUrl = ref<string | null>(null)
const cameraPreviewRef = ref<InstanceType<typeof CameraPreview> | null>(null)

async function loadPhotoboothSettings(): Promise<void> {
  try {
    const settings = (await window.api.settings.getAll()) as Record<string, unknown>
    cameraDeviceId.value = (settings.cameraDeviceId as string) || ''
    frameDataUrl.value = (await window.api.frame.getDataUrl()) || ''
    countdownSeconds.value = (settings.countdownSeconds as number) || 3
    autoReturnSeconds.value = (settings.autoReturnSeconds as number) || 30
    printerName.value = (settings.printerName as string) || ''
    serverUrl.value = (settings.serverUrl as string) || ''
  } finally {
    // Mount the camera only once the configured device id is known, so the
    // preview never starts on the default camera and then has to switch.
    settingsLoaded.value = true
  }
}

function handlePhotoboothClick(): void {
  if (showPasswordDialog.value) return
  // Tapping again during the countdown cancels it — guests change their mind
  countdownActive.value = !countdownActive.value
}

function capturePhoto(): string | null {
  const video = cameraPreviewRef.value?.videoRef
  if (!video || video.readyState < video.HAVE_CURRENT_DATA) return null

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 100)}`))
    img.src = src
  })
}

async function compositePhoto(photoDataUrl: string): Promise<CompositedPhoto> {
  const photo = await loadImage(photoDataUrl)

  const canvas = document.createElement('canvas')
  canvas.width = photo.naturalWidth
  canvas.height = photo.naturalHeight
  const ctx = canvas.getContext('2d')!

  // Draw the captured photo
  ctx.drawImage(photo, 0, 0)

  // Draw the frame overlay on top if configured
  if (frameDataUrl.value) {
    const frame = await loadImage(frameDataUrl.value)
    ctx.drawImage(frame, 0, 0, canvas.width, canvas.height)
  }

  const dataUrl = canvas.toDataURL('image/png')
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to create blob'))),
      'image/png'
    )
  })

  return { dataUrl, blob }
}

interface UploadResult {
  id: string
  downloadUrl: string
}

type UploadStatus = 'idle' | 'uploading' | 'success' | 'failed'

const compositedPhoto = ref<CompositedPhoto | null>(null)
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

async function savePhoto(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  return window.api.photos.save(buffer)
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
  const dataUrl = capturePhoto()
  if (dataUrl) {
    capturedPhotoDataUrl.value = dataUrl
    const result = await compositePhoto(dataUrl)
    compositedPhoto.value = result

    // Save locally immediately after compositing
    const filePath = await savePhoto(result.blob)
    savedPhotoPath.value = filePath

    // Upload silently in the background (no await — non-blocking)
    uploadPhoto(filePath)

    // Transition to result screen
    currentScreen.value = 'result'
  }
  countdownActive.value = false
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
  const success = await window.api.photos.print(savedPhotoPath.value)

  if (success) {
    printCount.value++
    printState.value = 'printed'
  } else {
    printState.value = 'failed'
    showPrintToast('Printing failed. Please check your printer.')
  }
}

async function handleShare(): Promise<void> {
  if (!savedPhotoPath.value) return
  await window.api.photos.share(savedPhotoPath.value)
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
  capturedPhotoDataUrl.value = null
  compositedPhoto.value = null
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
      <!-- Live camera preview -->
      <CameraPreview
        v-if="settingsLoaded"
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
      v-else-if="currentScreen === 'result' && compositedPhoto"
      key="result"
      class="kiosk-cursor-hidden"
      :photo-data-url="compositedPhoto.dataUrl"
      :auto-return-seconds="autoReturnSeconds"
      :printer-configured="!!printerName"
      :print-state="printState"
      :print-count="printCount"
      :upload-status="uploadStatus"
      :upload-result="uploadResult"
      :server-url="serverUrl"
      @new-photo="handleNewPhoto"
      @print="handlePrint"
      @share="handleShare"
    />

    <!-- Settings Screen -->
    <SettingsPanel
      v-else-if="currentScreen === 'settings'"
      key="settings"
      @return-to-photobooth="returnToPhotobooth"
    />
  </Transition>

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
