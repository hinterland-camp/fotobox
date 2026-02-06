<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps<{
  photoDataUrl: string
  autoReturnSeconds: number
  printerConfigured: boolean
}>()

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

      <!-- QR code placeholder -->
      <div
        class="flex h-[150px] w-[150px] flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm text-white/50"
      >
        QR Code
      </div>
    </div>

    <!-- Auto-return indicator -->
    <p class="mt-4 text-sm text-white/40">
      Returning in {{ remainingSeconds }}s
    </p>
  </div>
</template>
