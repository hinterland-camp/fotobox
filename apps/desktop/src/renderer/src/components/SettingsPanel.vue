<script setup lang="ts">
import { ref, onMounted } from 'vue'

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
  <div class="flex h-screen w-screen items-start justify-center overflow-y-auto bg-zinc-950 p-8">
    <div class="w-full max-w-2xl">
      <h1 class="mb-8 text-2xl font-bold text-white">Settings</h1>

      <div v-if="loading" class="text-zinc-400">Loading settings...</div>

      <div v-else class="space-y-6">
        <!-- Camera Selection -->
        <div>
          <label class="mb-2 block text-sm font-medium text-zinc-400" for="settings-camera">
            Camera
          </label>
          <select
            id="settings-camera"
            class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white outline-none focus:border-blue-500"
            :value="cameraDeviceId"
            @change="onCameraChange"
          >
            <option value="">No camera selected</option>
            <option v-for="cam in cameras" :key="cam.deviceId" :value="cam.deviceId">
              {{ cam.label }}
            </option>
          </select>
          <p v-if="cameras.length === 0" class="mt-1 text-sm text-zinc-500">
            No cameras detected
          </p>
        </div>

        <!-- Frame Upload -->
        <div>
          <label class="mb-2 block text-sm font-medium text-zinc-400">Frame Overlay (PNG)</label>
          <div class="flex items-center gap-3">
            <button
              class="rounded-lg bg-zinc-700 px-4 py-3 text-white transition hover:bg-zinc-600"
              @click="onFrameSelect"
            >
              {{ framePath ? 'Change Frame' : 'Select Frame' }}
            </button>
            <button
              v-if="framePath"
              class="rounded-lg bg-zinc-700 px-4 py-3 text-red-400 transition hover:bg-zinc-600"
              @click="onClearFrame"
            >
              Remove
            </button>
          </div>
          <p v-if="framePath" class="mt-2 truncate text-sm text-zinc-500">{{ framePath }}</p>
          <div v-if="framePreviewUrl" class="mt-3">
            <img
              :src="framePreviewUrl"
              alt="Frame preview"
              class="max-h-48 rounded-lg border border-zinc-700"
            />
          </div>
        </div>

        <!-- Printer Selection -->
        <div>
          <label class="mb-2 block text-sm font-medium text-zinc-400" for="settings-printer">
            Printer
          </label>
          <select
            id="settings-printer"
            class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white outline-none focus:border-blue-500"
            :value="printerName"
            @change="onPrinterChange"
          >
            <option value="">No printer selected</option>
            <option v-for="p in printers" :key="p.name" :value="p.name">
              {{ p.displayName || p.name }}
            </option>
          </select>
          <p v-if="printers.length === 0" class="mt-1 text-sm text-zinc-500">
            No printers detected
          </p>
        </div>

        <!-- Server URL -->
        <div>
          <label class="mb-2 block text-sm font-medium text-zinc-400" for="settings-server-url">
            Server URL
          </label>
          <input
            id="settings-server-url"
            type="text"
            class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-500 outline-none focus:border-blue-500"
            placeholder="https://your-server.com"
            :value="serverUrl"
            @change="onServerUrlChange"
          />
        </div>

        <!-- Password -->
        <div>
          <label class="mb-2 block text-sm font-medium text-zinc-400" for="settings-password">
            Kiosk Exit Password
          </label>
          <input
            id="settings-password"
            type="password"
            class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-500 outline-none focus:border-blue-500"
            placeholder="Enter new password"
            :value="password"
            @change="onPasswordChange"
          />
        </div>

        <!-- Countdown Duration -->
        <div>
          <label class="mb-2 block text-sm font-medium text-zinc-400" for="settings-countdown">
            Countdown Duration (seconds)
          </label>
          <input
            id="settings-countdown"
            type="number"
            min="1"
            max="10"
            class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white outline-none focus:border-blue-500"
            :value="countdownSeconds"
            @change="onCountdownChange"
          />
          <p class="mt-1 text-sm text-zinc-500">1–10 seconds</p>
        </div>

        <!-- Return to Photobooth -->
        <div class="pt-4">
          <button
            class="w-full rounded-lg bg-blue-600 px-6 py-3 text-white transition hover:bg-blue-500"
            @click="emit('returnToPhotobooth')"
          >
            Return to Photobooth
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
