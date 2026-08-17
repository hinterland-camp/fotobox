<script setup lang="ts">
import { ref, onMounted } from 'vue'
import CameraPreview from './CameraPreview.vue'

const emit = defineEmits<{
  returnToPhotobooth: []
}>()

// Settings state
const cameraDeviceId = ref('')
const framePath = ref('')
const framePreviewUrl = ref('')
const printerName = ref('')
const serverUrl = ref('')
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
  serverUrl.value = (settings.serverUrl as string) || ''
  password.value = (settings.password as string) || ''
  countdownSeconds.value = (settings.countdownSeconds as number) || 3

  if (framePath.value) {
    framePreviewUrl.value = `file://${framePath.value}`
  }
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
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    // Use the file path from the electron file object
    const path = (file as File & { path?: string }).path
    if (path) {
      framePath.value = path
      framePreviewUrl.value = `file://${path}`
      await saveSetting('framePath', path)
    }
  }
  input.click()
}

async function onClearFrame(): Promise<void> {
  framePath.value = ''
  framePreviewUrl.value = ''
  await saveSetting('framePath', '')
}

async function onPrinterChange(e: Event): Promise<void> {
  const value = (e.target as HTMLSelectElement).value
  printerName.value = value
  await saveSetting('printerName', value)
}

async function onServerUrlChange(e: Event): Promise<void> {
  const value = (e.target as HTMLInputElement).value
  serverUrl.value = value
  await saveSetting('serverUrl', value)
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
            class="mt-4 h-56 overflow-hidden rounded-xl border border-zinc-800"
          >
            <CameraPreview :camera-device-id="cameraDeviceId" />
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
          <div v-if="framePreviewUrl" class="mt-4">
            <img
              :src="framePreviewUrl"
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
      </div>
    </div>
  </div>
</template>
