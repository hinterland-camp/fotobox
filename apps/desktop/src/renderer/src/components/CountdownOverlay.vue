<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'

const props = defineProps<{
  active: boolean
  duration: number
}>()

const emit = defineEmits<{
  complete: []
}>()

const currentCount = ref(0)
const showFlash = ref(false)
const animKey = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
let flashTimer: ReturnType<typeof setTimeout> | null = null

function startCountdown(): void {
  stopCountdown()
  currentCount.value = props.duration
  animKey.value++
  timer = setInterval(() => {
    currentCount.value--
    animKey.value++
    if (currentCount.value <= 0) {
      stopCountdown()
      triggerFlash()
    }
  }, 1000)
}

function stopCountdown(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (flashTimer) {
    clearTimeout(flashTimer)
    flashTimer = null
  }
  showFlash.value = false
}

function triggerFlash(): void {
  showFlash.value = true
  flashTimer = setTimeout(() => {
    showFlash.value = false
    flashTimer = null
    // A cancel landing inside the flash must not still take the photo
    if (props.active) emit('complete')
  }, 300)
}

watch(() => props.active, (active) => {
  if (active) {
    startCountdown()
  } else {
    stopCountdown()
    currentCount.value = 0
  }
})

onUnmounted(() => {
  stopCountdown()
})
</script>

<template>
  <Teleport to="body">
    <!-- Background dim for contrast -->
    <div
      v-if="active && currentCount > 0"
      class="pointer-events-none fixed inset-0 z-40 bg-black/30"
    />

    <!-- Countdown number -->
    <div
      v-if="active && currentCount > 0"
      class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
    >
      <span
        :key="animKey"
        class="countdown-number text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.9)]"
      >
        {{ currentCount }}
      </span>
    </div>

    <!-- White flash -->
    <div
      v-if="showFlash"
      class="pointer-events-none fixed inset-0 z-50 bg-white"
    />
  </Teleport>
</template>

<style scoped>
.countdown-number {
  font-size: 200px;
  font-weight: 800;
  line-height: 1;
  animation: countdown-tick 0.8s ease-out;
}

@keyframes countdown-tick {
  0% {
    opacity: 0;
    transform: scale(2);
  }
  30% {
    opacity: 1;
    transform: scale(1);
  }
  80% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0.3;
    transform: scale(0.9);
  }
}
</style>
