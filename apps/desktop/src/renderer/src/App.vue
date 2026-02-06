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
const cameraDeviceId = ref('')
const framePath = ref('')
const countdownSeconds = ref(3)
const autoReturnSeconds = ref(30)
const printerName = ref('')
const countdownActive = ref(false)
const capturedPhotoDataUrl = ref<string | null>(null)
const cameraPreviewRef = ref<InstanceType<typeof CameraPreview> | null>(null)

async function loadPhotoboothSettings(): Promise<void> {
  const settings = (await window.api.settings.getAll()) as Record<string, unknown>
  cameraDeviceId.value = (settings.cameraDeviceId as string) || ''
  framePath.value = (settings.framePath as string) || ''
  countdownSeconds.value = (settings.countdownSeconds as number) || 3
  autoReturnSeconds.value = (settings.autoReturnSeconds as number) || 30
  printerName.value = (settings.printerName as string) || ''
}

function handlePhotoboothClick(): void {
  if (countdownActive.value || showPasswordDialog.value) return
  countdownActive.value = true
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
  if (framePath.value) {
    const frame = await loadImage(`file://${framePath.value}`)
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

const compositedPhoto = ref<CompositedPhoto | null>(null)
const savedPhotoPath = ref<string | null>(null)
const printToast = ref<string | null>(null)
let printToastTimer: ReturnType<typeof setTimeout> | null = null

async function savePhoto(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  return window.api.photos.save(buffer)
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
  if (!savedPhotoPath.value) return
  const success = await window.api.photos.print(savedPhotoPath.value)
  if (!success) {
    showPrintToast('Printing failed. Please check your printer.')
  }
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && currentScreen.value === 'photobooth' && !showPasswordDialog.value) {
    showPasswordDialog.value = true
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  loadPhotoboothSettings()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  if (printToastTimer) clearTimeout(printToastTimer)
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
  currentScreen.value = 'photobooth'
}

async function returnToPhotobooth(): Promise<void> {
  await window.api.kiosk.enterKiosk()
  await loadPhotoboothSettings()
  handleNewPhoto()
}
</script>

<template>
  <!-- Photobooth Screen -->
  <div
    v-if="currentScreen === 'photobooth'"
    class="relative h-screen w-screen bg-black"
    @click="handlePhotoboothClick"
  >
    <!-- Live camera preview -->
    <CameraPreview ref="cameraPreviewRef" :camera-device-id="cameraDeviceId" />

    <!-- Frame overlay -->
    <img
      v-if="framePath"
      :src="`file://${framePath}`"
      alt=""
      class="pointer-events-none absolute inset-0 h-full w-full object-cover"
    />

    <!-- Tap prompt -->
    <p
      v-if="!countdownActive"
      class="absolute bottom-8 left-1/2 -translate-x-1/2 animate-pulse text-lg text-white drop-shadow-lg"
    >
      Tap anywhere to take a photo
    </p>

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
    :photo-data-url="compositedPhoto.dataUrl"
    :auto-return-seconds="autoReturnSeconds"
    :printer-configured="!!printerName"
    @new-photo="handleNewPhoto"
    @print="handlePrint"
    @share="() => {}"
  />

  <!-- Settings Screen -->
  <SettingsPanel
    v-else-if="currentScreen === 'settings'"
    @return-to-photobooth="returnToPhotobooth"
  />

  <!-- Password Dialog -->
  <PasswordDialog
    :visible="showPasswordDialog"
    @cancel="handlePasswordCancel"
    @success="handlePasswordSuccess"
  />

  <!-- Print toast notification -->
  <Teleport to="body">
    <div
      v-if="printToast"
      class="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-red-600 px-6 py-3 text-white shadow-lg"
    >
      {{ printToast }}
    </div>
  </Teleport>
</template>
