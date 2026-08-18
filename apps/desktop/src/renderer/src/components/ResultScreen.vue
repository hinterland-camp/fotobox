<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import QRCode from 'qrcode'

interface UploadResult {
  id: string
  downloadUrl: string
}

type UploadStatus = 'idle' | 'uploading' | 'success' | 'failed'
type PrintState = 'idle' | 'printing' | 'printed' | 'failed'

const props = defineProps<{
  photoDataUrl: string
  autoReturnSeconds: number
  printerConfigured: boolean
  printState: PrintState
  printCount: number
  uploadStatus: UploadStatus
  uploadResult: UploadResult | null
  serverUrl: string
}>()

const qrCodeDataUrl = ref<string | null>(null)

async function generateQrCode(downloadUrl: string): Promise<void> {
  const fullUrl = props.serverUrl.replace(/\/$/, '') + downloadUrl
  qrCodeDataUrl.value = await QRCode.toDataURL(fullUrl, {
    width: 400,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' }
  })
}

const printLabel = computed(() => {
  if (props.printState === 'printing') return 'Printing...'
  if (props.printState === 'printed') return 'Print another'
  return 'Print'
})

watch(
  () => props.uploadResult,
  (result) => {
    if (result) {
      generateQrCode(result.downloadUrl)
    }
  },
  { immediate: true }
)

const emit = defineEmits<{
  newPhoto: []
  print: []
}>()

const remainingSeconds = ref(props.autoReturnSeconds)
let autoReturnTimer: ReturnType<typeof setInterval> | null = null

function resetAutoReturn(): void {
  remainingSeconds.value = props.autoReturnSeconds
}

function startAutoReturn(): void {
  stopAutoReturn()
  remainingSeconds.value = props.autoReturnSeconds
  autoReturnTimer = setInterval(() => {
    remainingSeconds.value--
    if (remainingSeconds.value <= 0) {
      stopAutoReturn()
      emit('newPhoto')
    }
  }, 1000)
}

function stopAutoReturn(): void {
  if (autoReturnTimer) {
    clearInterval(autoReturnTimer)
    autoReturnTimer = null
  }
}

function handleInteraction(): void {
  resetAutoReturn()
}

function handleNewPhoto(): void {
  stopAutoReturn()
  emit('newPhoto')
}

function handlePrint(): void {
  handleInteraction()
  emit('print')
}

onMounted(() => {
  startAutoReturn()
})

onUnmounted(() => {
  stopAutoReturn()
})

watch(
  () => props.autoReturnSeconds,
  () => {
    startAutoReturn()
  }
)

// Never walk away mid-print: hold the timer while the printer runs, then give
// the guest the full window again to decide whether they want a second copy.
watch(
  () => props.printState,
  (state) => {
    if (state === 'printing') {
      stopAutoReturn()
    } else if (state === 'printed' || state === 'failed') {
      startAutoReturn()
    }
  }
)
</script>

<template>
  <div
    class="flex h-screen w-screen flex-col bg-black"
    @click="handleInteraction"
  >
    <!-- Photo display -->
    <div class="flex min-h-0 flex-1 items-center justify-center px-8 pt-8 pb-4">
      <img
        :src="photoDataUrl"
        alt="Your photo"
        class="max-h-full max-w-full rounded-2xl object-contain shadow-[0_8px_40px_rgba(0,0,0,0.6)]"
      />
    </div>

    <!-- Bottom controls -->
    <div class="flex flex-col gap-3 px-6 pb-6">
      <!-- Take-it-home invitation: the QR is the point of this screen -->
      <div
        v-if="uploadStatus === 'success' && qrCodeDataUrl"
        class="flex items-center gap-6 rounded-3xl bg-white/[0.09] px-6 py-5 ring-1 ring-white/15 backdrop-blur-md"
      >
        <!-- QR code with a soft pulsing halo -->
        <div class="relative flex-shrink-0">
          <div
            class="animate-qr-halo absolute -inset-2 rounded-3xl bg-white/40 blur-md"
          />
          <div class="relative rounded-2xl bg-white p-2.5 shadow-2xl">
            <img
              :src="qrCodeDataUrl"
              alt="Scan to download your photo"
              class="h-40 w-40"
            />
          </div>
        </div>

        <div class="min-w-0 flex-1">
          <p class="text-3xl font-bold leading-tight tracking-tight text-white">
            Take your photo home
          </p>
          <p class="mt-1.5 text-lg leading-snug text-white/70">
            Scan the code with your phone camera to download it.
          </p>

          <div class="mt-3 flex items-center gap-2 text-sm font-medium text-white/45">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              class="h-5 w-5"
            >
              <path
                d="M10.5 18.75a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z"
              />
              <path
                fill-rule="evenodd"
                d="M8.625.75A3.375 3.375 0 0 0 5.25 4.125v15.75A3.375 3.375 0 0 0 8.625 23.25h6.75a3.375 3.375 0 0 0 3.375-3.375V4.125A3.375 3.375 0 0 0 15.375.75h-6.75ZM7.5 4.125c0-.621.504-1.125 1.125-1.125h6.75c.621 0 1.125.504 1.125 1.125v15.75c0 .621-.504 1.125-1.125 1.125h-6.75A1.125 1.125 0 0 1 7.5 19.875V4.125Z"
                clip-rule="evenodd"
              />
            </svg>
            Just point your camera — no app needed
          </div>
        </div>

        <!-- Nudge arrow pointing back at the code -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          class="animate-nudge-left h-8 w-8 flex-shrink-0 text-white/25"
        >
          <path
            fill-rule="evenodd"
            d="M20.25 12a.75.75 0 0 1-.75.75H6.31l5.47 5.47a.75.75 0 1 1-1.06 1.06l-6.75-6.75a.75.75 0 0 1 0-1.06l6.75-6.75a.75.75 0 1 1 1.06 1.06L6.31 11.25H19.5a.75.75 0 0 1 .75.75Z"
            clip-rule="evenodd"
          />
        </svg>
      </div>

      <!-- Upload still in flight -->
      <div
        v-else-if="uploadStatus === 'uploading'"
        class="flex items-center gap-4 rounded-3xl bg-white/[0.06] px-6 py-5 backdrop-blur-md"
      >
        <div
          class="h-6 w-6 flex-shrink-0 animate-spin rounded-full border-2 border-white/10 border-t-white/50"
        />
        <div>
          <p class="text-xl font-semibold text-white/80">Getting your photo ready...</p>
          <p class="text-sm text-white/40">A QR code to download it appears in a moment</p>
        </div>
      </div>

      <!-- Offline / not uploaded -->
      <div
        v-else-if="uploadStatus === 'failed'"
        class="flex items-center gap-4 rounded-3xl bg-white/[0.06] px-6 py-5 backdrop-blur-md"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          class="h-6 w-6 flex-shrink-0 text-white/25"
        >
          <path
            fill-rule="evenodd"
            d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 9a.75.75 0 0 0-1.5 0v2.25H9a.75.75 0 0 0 0 1.5h2.25V15a.75.75 0 0 0 1.5 0v-2.25H15a.75.75 0 0 0 0-1.5h-2.25V9Z"
            clip-rule="evenodd"
          />
        </svg>
        <div>
          <p class="text-xl font-semibold text-white/80">Saved locally</p>
          <p class="text-sm text-white/40">Your photo will upload once the booth is back online</p>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="flex gap-3">
        <!-- New Photo (primary) -->
        <button
          class="flex flex-1 items-center justify-center gap-2.5 rounded-2xl bg-white py-5 text-base font-bold text-black shadow-lg transition-transform active:scale-[0.97]"
          @click.stop="handleNewPhoto"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            class="h-5 w-5"
          >
            <path d="M12 9a3.75 3.75 0 1 0 0 7.5A3.75 3.75 0 0 0 12 9Z" />
            <path
              fill-rule="evenodd"
              d="M9.344 3.071a49.52 49.52 0 0 1 5.312 0c.967.052 1.83.585 2.332 1.39l.821 1.317c.24.383.645.643 1.11.71.386.054.77.113 1.152.177 1.432.239 2.429 1.493 2.429 2.909V18a3 3 0 0 1-3 3H4.5a3 3 0 0 1-3-3V9.574c0-1.416.997-2.67 2.429-2.909.382-.064.766-.123 1.151-.178a1.56 1.56 0 0 0 1.11-.71l.822-1.315a2.942 2.942 0 0 1 2.332-1.39ZM12 17.25a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z"
              clip-rule="evenodd"
            />
          </svg>
          New Photo
        </button>

        <!-- Print (secondary, conditional) -->
        <button
          v-if="printerConfigured"
          class="relative flex flex-1 items-center justify-center gap-2.5 rounded-2xl bg-white/10 py-5 text-base font-bold text-white backdrop-blur-md transition-transform active:scale-[0.97] disabled:opacity-60"
          :disabled="printState === 'printing'"
          @click.stop="handlePrint"
        >
          <!-- Copies already printed -->
          <span
            v-if="printCount > 0"
            class="absolute right-3 top-3 rounded-full bg-white/15 px-2 py-0.5 text-xs font-bold text-white/70"
          >
            {{ printCount }}×
          </span>

          <div
            v-if="printState === 'printing'"
            class="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white"
          />
          <svg
            v-else
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            class="h-5 w-5"
          >
            <path
              fill-rule="evenodd"
              d="M7.875 1.5C6.839 1.5 6 2.34 6 3.375v2.99c-.426.053-.851.11-1.274.174-1.454.218-2.476 1.483-2.476 2.917v6.294a3 3 0 0 0 3 3h.27l-.092 1.086a1.875 1.875 0 0 0 1.865 2.063h9.414a1.875 1.875 0 0 0 1.865-2.063l-.092-1.086h.27a3 3 0 0 0 3-3V9.456c0-1.434-1.022-2.7-2.476-2.917A48.716 48.716 0 0 0 18 6.366V3.375c0-1.036-.84-1.875-1.875-1.875h-8.25ZM16.5 6.205v-2.83A.375.375 0 0 0 16.125 3h-8.25a.375.375 0 0 0-.375.375v2.83a49.353 49.353 0 0 1 9 0Zm-.217 8.265c.178.018.317.16.333.337l.526 5.784a.375.375 0 0 1-.374.413H7.232a.375.375 0 0 1-.374-.413l.526-5.784a.351.351 0 0 1 .333-.337 41.741 41.741 0 0 1 8.566 0Zm.967-3.97a.75.75 0 0 1 .75-.75h.008a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75.75H18a.75.75 0 0 1-.75-.75V10.5Z"
              clip-rule="evenodd"
            />
          </svg>
          {{ printLabel }}
        </button>

      </div>

      <!-- Auto-return progress bar -->
      <div class="h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          class="h-full rounded-full bg-white/20 transition-[width] duration-1000 ease-linear"
          :style="{ width: `${(remainingSeconds / autoReturnSeconds) * 100}%` }"
        />
      </div>
    </div>
  </div>
</template>
