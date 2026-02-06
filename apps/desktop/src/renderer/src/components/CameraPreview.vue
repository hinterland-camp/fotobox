<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps<{
  cameraDeviceId: string
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const stream = ref<MediaStream | null>(null)
const error = ref<string | null>(null)

async function startCamera(): Promise<void> {
  error.value = null

  // Stop any existing stream
  stopCamera()

  const constraints: MediaStreamConstraints = {
    video: props.cameraDeviceId
      ? { deviceId: { exact: props.cameraDeviceId } }
      : true,
    audio: false
  }

  try {
    const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
    stream.value = mediaStream

    if (videoRef.value) {
      videoRef.value.srcObject = mediaStream
    }
  } catch (err) {
    if (err instanceof DOMException) {
      if (err.name === 'NotAllowedError') {
        error.value = 'Camera access was denied. Please allow camera permissions and try again.'
      } else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
        error.value = 'No camera found. Please connect a camera and check your settings.'
      } else {
        error.value = `Camera error: ${err.message}`
      }
    } else {
      error.value = 'An unexpected error occurred while accessing the camera.'
    }
  }
}

function stopCamera(): void {
  if (stream.value) {
    for (const track of stream.value.getTracks()) {
      track.stop()
    }
    stream.value = null
  }
}

watch(() => props.cameraDeviceId, () => {
  startCamera()
})

onMounted(() => {
  startCamera()
})

onUnmounted(() => {
  stopCamera()
})

defineExpose({ videoRef, stream })
</script>

<template>
  <div class="relative flex h-full w-full items-center justify-center bg-black">
    <!-- Live camera feed -->
    <video
      v-show="!error"
      ref="videoRef"
      autoplay
      playsinline
      muted
      class="h-full w-full object-cover"
    />

    <!-- Error state -->
    <div v-if="error" class="flex flex-col items-center justify-center text-center">
      <div class="text-6xl text-zinc-600">&#x1f4f7;</div>
      <p class="mt-4 max-w-md text-lg text-zinc-400">{{ error }}</p>
    </div>
  </div>
</template>
