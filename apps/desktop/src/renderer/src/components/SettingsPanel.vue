<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import CameraPreview from './CameraPreview.vue'

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

const update = ref<UpdateState | null>(null)
let stopUpdateListener: (() => void) | null = null

const updateMessage = computed(() => {
  const u = update.value
  if (!u) return ''
  switch (u.status) {
    case 'unsupported':
      return 'Updates are only available in the installed app.'
    case 'checking':
      return 'Looking for a new version...'
    case 'available':
      return `Version ${u.version} is available.`
    case 'downloading':
      return `Downloading version ${u.version}... ${u.percent}%`
    case 'ready':
      return `Version ${u.version} is ready to install.`
    case 'error':
      return u.error ?? 'Update failed.'
    default:
      return 'The app is up to date.'
  }
})

async function onCheckUpdate(): Promise<void> {
  update.value = (await window.api.updates.check()) as UpdateState
}

async function onDownloadUpdate(): Promise<void> {
  update.value = (await window.api.updates.download()) as UpdateState
}

async function onInstallUpdate(): Promise<void> {
  await window.api.updates.install()
}

const emit = defineEmits<{
  returnToPhotobooth: []
}>()

// Settings state
const cameraDeviceId = ref('')
const framePath = ref('')
const frameDataUrl = ref('')
const printerName = ref('')
const printSize = ref('4x6')
const printFit = ref('contain')
const printRotation = ref('auto')
const printScale = ref(100)
const serverUrl = ref('')
const serverToken = ref('')
const password = ref('')
const countdownSeconds = ref(3)

// Device lists
const cameras = ref<Array<{ deviceId: string; label: string }>>([])
const printers = ref<Array<{ name: string; displayName: string }>>([])

// Loading state
const loading = ref(true)

async function loadSettings(): Promise<void> {
  const settings = (await window.api.settings.getAll()) as Record<string, unknown>
  cameraDeviceId.value = (settings.cameraDeviceId as string) || ''
  framePath.value = (settings.framePath as string) || ''
  printerName.value = (settings.printerName as string) || ''
  printSize.value = (settings.printSize as string) || '4x6'
  printFit.value = (settings.printFit as string) || 'contain'
  printRotation.value = (settings.printRotation as string) || 'auto'
  printScale.value = (settings.printScale as number) || 100
  serverUrl.value = (settings.serverUrl as string) || ''
  serverToken.value = (settings.serverToken as string) || ''
  password.value = (settings.password as string) || ''
  countdownSeconds.value = (settings.countdownSeconds as number) || 3

  frameDataUrl.value = (await window.api.frame.getDataUrl()) || ''
}

async function loadCameras(): Promise<void> {
  try {
    // Request permission first so labels are available
    await navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
      stream.getTracks().forEach((t) => t.stop())
    })
    const devices = await navigator.mediaDevices.enumerateDevices()
    cameras.value = devices
      .filter((d) => d.kind === 'videoinput')
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${d.deviceId.slice(0, 8)}`
      }))
  } catch {
    cameras.value = []
  }
}

async function loadPrinters(): Promise<void> {
  try {
    printers.value = await window.api.printers.getAll()
  } catch {
    printers.value = []
  }
}

onMounted(async () => {
  await loadSettings()
  await Promise.all([loadCameras(), loadPrinters()])
  loading.value = false

  update.value = (await window.api.updates.getState()) as UpdateState
  stopUpdateListener = window.api.updates.onState((state) => {
    update.value = state as UpdateState
  })
})

onUnmounted(() => {
  stopUpdateListener?.()
})

async function saveSetting(key: string, value: unknown): Promise<void> {
  await window.api.settings.set(key, value)
}

async function onCameraChange(e: Event): Promise<void> {
  const value = (e.target as HTMLSelectElement).value
  cameraDeviceId.value = value
  await saveSetting('cameraDeviceId', value)
}

async function onFrameSelect(): Promise<void> {
  // A native dialog rather than an <input type="file">: Electron 32 removed
  // File.path, so the browser picker could not tell us where the file lives.
  const selected = await window.api.frame.select()
  if (!selected) return
  framePath.value = selected.path
  frameDataUrl.value = selected.dataUrl
}

async function onClearFrame(): Promise<void> {
  framePath.value = ''
  frameDataUrl.value = ''
  await window.api.frame.clear()
}

async function onPrinterChange(e: Event): Promise<void> {
  const value = (e.target as HTMLSelectElement).value
  printerName.value = value
  await saveSetting('printerName', value)
}

// Media the QW410 can be loaded with; the photo is printed edge to edge on it
const printSizes = [
  { value: 'printer', label: "Printer's own setting" },
  { value: '4x6', label: '4 × 6 in — 4x6 roll' },
  { value: '4x4.5', label: '4 × 4.5 in — 4x6 roll' },
  { value: '4x4', label: '4 × 4 in — 4x6 roll' },
  { value: '4x3', label: '4 × 3 in — 4x6 roll' },
  { value: '2x4', label: '2 × 4 in — 4x6 roll' },
  { value: '4.5x8', label: '4.5 × 8 in — 4.5x8 roll' },
  { value: '4.5x6', label: '4.5 × 6 in — 4.5x8 roll' },
  { value: '4.5x4.5', label: '4.5 × 4.5 in — 4.5x8 roll' },
  { value: '4.5x4', label: '4.5 × 4 in — 4.5x8 roll' },
  { value: '4.5x3', label: '4.5 × 3 in — 4.5x8 roll' },
  { value: '2x4.5', label: '2 × 4.5 in — 4.5x8 roll' }
]
async function onPrintSizeChange(e: Event): Promise<void> {
  const value = (e.target as HTMLSelectElement).value
  printSize.value = value
  await saveSetting('printSize', value)
}

const printFits = [
  { value: 'contain', label: 'Whole photo (scaled to fit)' },
  { value: 'cover', label: 'Fill the sheet (crops the edges)' }
]

async function onPrintFitChange(e: Event): Promise<void> {
  const value = (e.target as HTMLSelectElement).value
  printFit.value = value
  await saveSetting('printFit', value)
}

const printRotations = [
  { value: 'auto', label: 'Automatic (turn to fill the sheet)' },
  { value: '0', label: 'No rotation' },
  { value: '90', label: 'Rotate 90°' },
  { value: '180', label: 'Rotate 180°' },
  { value: '270', label: 'Rotate 270°' }
]

async function onPrintRotationChange(e: Event): Promise<void> {
  const value = (e.target as HTMLSelectElement).value
  printRotation.value = value
  await saveSetting('printRotation', value)
}

async function onPrintScaleChange(e: Event): Promise<void> {
  const value = Number((e.target as HTMLInputElement).value)
  if (value >= 50 && value <= 100) {
    printScale.value = value
    await saveSetting('printScale', value)
  }
}

const printTest = ref<{ ok: boolean; message: string } | null>(null)
const testingPrint = ref(false)

async function onTestPrint(): Promise<void> {
  testingPrint.value = true
  printTest.value = null
  try {
    printTest.value = await window.api.photos.testPrint()
  } finally {
    testingPrint.value = false
  }
}

async function onServerUrlChange(e: Event): Promise<void> {
  const value = (e.target as HTMLInputElement).value
  serverUrl.value = value
  await saveSetting('serverUrl', value)
}

const connectionTest = ref<{ ok: boolean; message: string } | null>(null)
const testingConnection = ref(false)

async function onTestConnection(): Promise<void> {
  testingConnection.value = true
  connectionTest.value = null
  try {
    connectionTest.value = await window.api.photos.testConnection()
  } finally {
    testingConnection.value = false
  }
}

async function onServerTokenChange(e: Event): Promise<void> {
  const value = (e.target as HTMLInputElement).value
  serverToken.value = value
  await saveSetting('serverToken', value)
}

async function onPasswordChange(e: Event): Promise<void> {
  const value = (e.target as HTMLInputElement).value
  password.value = value
  await saveSetting('password', value)
}

async function onCountdownChange(e: Event): Promise<void> {
  const value = Number((e.target as HTMLInputElement).value)
  if (value >= 1 && value <= 10) {
    countdownSeconds.value = value
    await saveSetting('countdownSeconds', value)
  }
}
</script>

<template>
  <div
    class="custom-scrollbar flex h-screen w-screen items-start justify-center overflow-y-auto bg-zinc-950 px-6 py-8"
  >
    <div class="w-full max-w-2xl pb-8">
      <!-- Header with Done button -->
      <div class="mb-8 flex items-center justify-between">
        <h1 class="text-3xl font-bold tracking-tight text-white">Settings</h1>
        <button
          class="rounded-xl bg-white px-6 py-3.5 text-base font-semibold text-black transition-transform active:scale-[0.97]"
          @click="emit('returnToPhotobooth')"
        >
          Done
        </button>
      </div>

      <!-- Loading state -->
      <div v-if="loading" class="flex items-center justify-center py-20">
        <div
          class="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400"
        />
        <span class="ml-3 text-zinc-500">Loading settings...</span>
      </div>

      <div v-else class="space-y-4">
        <!-- Camera Section -->
        <section class="rounded-2xl bg-zinc-900/60 p-6">
          <h2
            class="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500"
          >
            Camera
          </h2>
          <select
            id="settings-camera"
            class="h-14 w-full appearance-none rounded-xl border border-zinc-700/50 bg-zinc-800 px-4 text-base text-white outline-none transition-colors focus:border-blue-500"
            :value="cameraDeviceId"
            @change="onCameraChange"
          >
            <option value="">No camera selected</option>
            <option
              v-for="cam in cameras"
              :key="cam.deviceId"
              :value="cam.deviceId"
            >
              {{ cam.label }}
            </option>
          </select>
          <p v-if="cameras.length === 0" class="mt-2 text-sm text-zinc-600">
            No cameras detected
          </p>

          <!-- Live preview of the selected camera -->
          <div
            v-if="cameras.length > 0"
            class="relative mt-4 h-56 overflow-hidden rounded-xl border border-zinc-800"
          >
            <CameraPreview :camera-device-id="cameraDeviceId" />
            <!-- Same overlay the photobooth draws, so this is what guests get -->
            <img
              v-if="frameDataUrl"
              :src="frameDataUrl"
              alt=""
              class="pointer-events-none absolute inset-0 h-full w-full object-fill"
            />
          </div>
        </section>

        <!-- Frame Overlay Section -->
        <section class="rounded-2xl bg-zinc-900/60 p-6">
          <h2
            class="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500"
          >
            Frame Overlay
          </h2>
          <div class="flex gap-3">
            <button
              class="h-14 rounded-xl bg-zinc-700/60 px-6 text-base font-medium text-white transition-colors active:bg-zinc-600"
              @click="onFrameSelect"
            >
              {{ framePath ? 'Change Frame' : 'Select PNG' }}
            </button>
            <button
              v-if="framePath"
              class="h-14 rounded-xl bg-zinc-700/60 px-6 text-base font-medium text-red-400 transition-colors active:bg-zinc-600"
              @click="onClearFrame"
            >
              Remove
            </button>
          </div>
          <p v-if="framePath" class="mt-3 truncate text-sm text-zinc-600">
            {{ framePath }}
          </p>
          <div v-if="frameDataUrl" class="mt-4">
            <img
              :src="frameDataUrl"
              alt="Frame preview"
              class="max-h-48 rounded-xl border border-zinc-800"
            />
          </div>
        </section>

        <!-- Printer Section -->
        <section class="rounded-2xl bg-zinc-900/60 p-6">
          <h2
            class="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500"
          >
            Printer
          </h2>
          <select
            id="settings-printer"
            class="h-14 w-full appearance-none rounded-xl border border-zinc-700/50 bg-zinc-800 px-4 text-base text-white outline-none transition-colors focus:border-blue-500"
            :value="printerName"
            @change="onPrinterChange"
          >
            <option value="">No printer selected</option>
            <option v-for="p in printers" :key="p.name" :value="p.name">
              {{ p.displayName || p.name }}
            </option>
          </select>
          <p v-if="printers.length === 0" class="mt-2 text-sm text-zinc-600">
            No printers detected
          </p>

          <label class="mt-4 mb-2 block text-sm text-zinc-400" for="settings-print-size">
            Paper size
          </label>
          <select
            id="settings-print-size"
            class="h-14 w-full appearance-none rounded-xl border border-zinc-700/50 bg-zinc-800 px-4 text-base text-white outline-none transition-colors focus:border-blue-500"
            :value="printSize"
            @change="onPrintSizeChange"
          >
            <option v-for="size in printSizes" :key="size.value" :value="size.value">
              {{ size.label }}
            </option>
          </select>
          <p class="mt-2 text-sm text-zinc-600">
            Pick the size matching the roll loaded in the printer — the width
            must agree with the roll (4" or 4.5") or one side prints white.
          </p>

          <label class="mt-4 mb-2 block text-sm text-zinc-400" for="settings-print-fit">
            How the photo sits on the page
          </label>
          <select
            id="settings-print-fit"
            class="h-14 w-full appearance-none rounded-xl border border-zinc-700/50 bg-zinc-800 px-4 text-base text-white outline-none transition-colors focus:border-blue-500"
            :value="printFit"
            @change="onPrintFitChange"
          >
            <option v-for="fit in printFits" :key="fit.value" :value="fit.value">
              {{ fit.label }}
            </option>
          </select>
          <p class="mt-2 text-sm text-zinc-600">
            Scaling to fit keeps the whole photo but can leave white edges when
            its shape differs from the paper.
          </p>

          <label class="mt-4 mb-2 block text-sm text-zinc-400" for="settings-print-rotation">
            Rotation on paper
          </label>
          <select
            id="settings-print-rotation"
            class="h-14 w-full appearance-none rounded-xl border border-zinc-700/50 bg-zinc-800 px-4 text-base text-white outline-none transition-colors focus:border-blue-500"
            :value="printRotation"
            @change="onPrintRotationChange"
          >
            <option v-for="rot in printRotations" :key="rot.value" :value="rot.value">
              {{ rot.label }}
            </option>
          </select>
          <p class="mt-2 text-sm text-zinc-600">
            Automatic turns a landscape photo a quarter turn so it runs along
            the long edge of the paper instead of printing small.
          </p>

          <label class="mt-4 mb-2 block text-sm text-zinc-400" for="settings-print-scale">
            Print zoom
          </label>
          <div class="flex items-center gap-4">
            <input
              id="settings-print-scale"
              type="range"
              min="50"
              max="100"
              class="h-2 flex-1"
              :value="printScale"
              @input="onPrintScaleChange"
            />
            <span class="w-14 text-center text-xl font-bold text-white">{{ printScale }}%</span>
          </div>
          <p class="mt-2 text-sm text-zinc-600">
            Zoom out if the driver still crops the edges. 100% uses the full
            page.
          </p>

          <button
            class="mt-4 h-14 w-full rounded-xl bg-zinc-700/60 px-6 text-base font-medium text-white transition-colors active:bg-zinc-600 disabled:opacity-50"
            :disabled="testingPrint"
            @click="onTestPrint"
          >
            {{ testingPrint ? 'Printing...' : 'Test print (last photo)' }}
          </button>

          <p
            v-if="printTest"
            class="mt-3 text-sm"
            :class="printTest.ok ? 'text-green-400' : 'text-red-400'"
          >
            {{ printTest.message }}
          </p>
        </section>

        <!-- Server Section -->
        <section class="rounded-2xl bg-zinc-900/60 p-6">
          <h2
            class="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500"
          >
            Server
          </h2>
          <input
            id="settings-server-url"
            type="text"
            class="h-14 w-full rounded-xl border border-zinc-700/50 bg-zinc-800 px-4 text-base text-white placeholder-zinc-600 outline-none transition-colors focus:border-blue-500"
            placeholder="https://your-server.com"
            :value="serverUrl"
            @change="onServerUrlChange"
          />

          <label class="mt-4 mb-2 block text-sm text-zinc-400" for="settings-server-token">
            Upload Token
          </label>
          <input
            id="settings-server-token"
            type="password"
            class="h-14 w-full rounded-xl border border-zinc-700/50 bg-zinc-800 px-4 text-base text-white placeholder-zinc-600 outline-none transition-colors focus:border-blue-500"
            placeholder="Shared secret from the server"
            :value="serverToken"
            @change="onServerTokenChange"
          />
          <p class="mt-2 text-sm text-zinc-600">
            Must match NUXT_UPLOAD_TOKEN on the server, or uploads are rejected.
          </p>

          <button
            class="mt-4 h-14 w-full rounded-xl bg-zinc-700/60 px-6 text-base font-medium text-white transition-colors active:bg-zinc-600 disabled:opacity-50"
            :disabled="testingConnection"
            @click="onTestConnection"
          >
            {{ testingConnection ? 'Testing...' : 'Test connection' }}
          </button>

          <p
            v-if="connectionTest"
            class="mt-3 text-sm"
            :class="connectionTest.ok ? 'text-green-400' : 'text-red-400'"
          >
            {{ connectionTest.message }}
          </p>
        </section>

        <!-- Security Section -->
        <section class="rounded-2xl bg-zinc-900/60 p-6">
          <h2
            class="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500"
          >
            Security
          </h2>
          <label
            class="mb-2 block text-sm text-zinc-400"
            for="settings-password"
          >
            Kiosk Exit Password
          </label>
          <input
            id="settings-password"
            type="password"
            class="h-14 w-full rounded-xl border border-zinc-700/50 bg-zinc-800 px-4 text-base text-white placeholder-zinc-600 outline-none transition-colors focus:border-blue-500"
            placeholder="Enter new password"
            :value="password"
            @change="onPasswordChange"
          />
        </section>

        <!-- Countdown Section -->
        <section class="rounded-2xl bg-zinc-900/60 p-6">
          <h2
            class="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500"
          >
            Countdown
          </h2>
          <div class="flex items-center gap-4">
            <input
              id="settings-countdown"
              type="range"
              min="1"
              max="10"
              class="h-2 flex-1"
              :value="countdownSeconds"
              @input="onCountdownChange"
            />
            <span class="w-12 text-center text-2xl font-bold text-white">
              {{ countdownSeconds }}
            </span>
          </div>
          <p class="mt-2 text-sm text-zinc-600">
            Seconds before capture (1–10)
          </p>
        </section>

        <!-- Updates Section -->
        <section v-if="update" class="rounded-2xl bg-zinc-900/60 p-6">
          <h2
            class="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500"
          >
            App Update
          </h2>

          <div class="flex items-center justify-between gap-4">
            <div class="min-w-0">
              <p
                class="text-base"
                :class="update.status === 'error' ? 'text-red-400' : 'text-white'"
              >
                {{ updateMessage }}
              </p>
              <p class="mt-1 text-sm text-zinc-600">
                Installed version {{ update.currentVersion }}
              </p>
            </div>

            <button
              v-if="update.status === 'available'"
              class="h-14 flex-shrink-0 rounded-xl bg-blue-600 px-6 text-base font-semibold text-white transition-transform active:scale-[0.97]"
              @click="onDownloadUpdate"
            >
              Download
            </button>
            <button
              v-else-if="update.status === 'ready'"
              class="h-14 flex-shrink-0 rounded-xl bg-blue-600 px-6 text-base font-semibold text-white transition-transform active:scale-[0.97]"
              @click="onInstallUpdate"
            >
              Install &amp; Restart
            </button>
            <button
              v-else-if="update.status !== 'unsupported'"
              class="h-14 flex-shrink-0 rounded-xl bg-zinc-700/60 px-6 text-base font-medium text-white transition-colors active:bg-zinc-600 disabled:opacity-50"
              :disabled="update.status === 'checking' || update.status === 'downloading'"
              @click="onCheckUpdate"
            >
              Check
            </button>
          </div>

          <!-- Download progress -->
          <div
            v-if="update.status === 'downloading'"
            class="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-800"
          >
            <div
              class="h-full rounded-full bg-blue-500 transition-[width] duration-300"
              :style="{ width: `${update.percent}%` }"
            />
          </div>

          <!-- Release notes -->
          <p
            v-if="update.releaseNotes && update.status !== 'idle'"
            class="custom-scrollbar mt-4 max-h-32 overflow-y-auto whitespace-pre-line text-sm text-zinc-500"
          >
            {{ update.releaseNotes }}
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
