<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import QRCode from 'qrcode'

interface UploadResult {
  id: string
  downloadUrl: string
}

type UploadStatus = 'idle' | 'uploading' | 'success' | 'failed'

const props = defineProps<{
  photoDataUrl: string
  autoReturnSeconds: number
  printerConfigured: boolean
  uploadStatus: UploadStatus
  uploadResult: UploadResult | null
  serverUrl: string
}>()

const qrCodeDataUrl = ref<string | null>(null)

async function generateQrCode(downloadUrl: string): Promise<void> {
  const fullUrl = props.serverUrl.replace(/\/$/, '') + downloadUrl
  qrCodeDataUrl.value = await QRCode.toDataURL(fullUrl, {
    width: 150,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' }
  })
}

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
  share: []
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

function handleShare(): void {
  handleInteraction()
  emit('share')
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
</script>

<template>
  <div
    class="flex h-screen w-screen flex-col items-center justify-center bg-black p-8"
    @click="handleInteraction"
  >
    <!-- Photo display -->
    <div class="relative flex max-h-[70vh] flex-1 items-center justify-center">
      <img
        :src="photoDataUrl"
        alt="Your photo"
        class="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
      />
    </div>

    <!-- Bottom area: actions + QR placeholder -->
    <div class="mt-6 flex w-full max-w-2xl items-center justify-between">
      <!-- Action buttons -->
      <div class="flex gap-4">
        <button
          class="rounded-xl bg-white px-8 py-4 text-lg font-bold text-black shadow-lg transition-transform active:scale-95"
          @click.stop="handleNewPhoto"
        >
          New Photo
        </button>

        <button
          v-if="printerConfigured"
          class="rounded-xl bg-white/20 px-8 py-4 text-lg font-bold text-white shadow-lg backdrop-blur-sm transition-transform active:scale-95"
          @click.stop="handlePrint"
        >
          Print
        </button>

        <button
          class="rounded-xl bg-white/20 px-8 py-4 text-lg font-bold text-white shadow-lg backdrop-blur-sm transition-transform active:scale-95"
          @click.stop="handleShare"
        >
          Share
        </button>
      </div>

      <!-- QR code -->
      <div
        class="flex h-[150px] w-[150px] flex-shrink-0 items-center justify-center rounded-lg text-sm text-white/50"
        :class="qrCodeDataUrl ? 'bg-white' : 'bg-white/10'"
      >
        <img
          v-if="uploadStatus === 'success' && qrCodeDataUrl"
          :src="qrCodeDataUrl"
          alt="QR Code"
          class="h-full w-full rounded-lg"
        />
        <span v-else-if="uploadStatus === 'uploading'">Uploading...</span>
        <span v-else-if="uploadStatus === 'failed' || uploadStatus === 'idle'">Offline</span>
      </div>
    </div>

    <!-- Auto-return indicator -->
    <p class="mt-4 text-sm text-white/40">
      Returning in {{ remainingSeconds }}s
    </p>
  </div>
</template>
