<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps<{
  cameraDeviceId: string
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const stream = ref<MediaStream | null>(null)
const error = ref<string | null>(null)

// Incremented on every start so a slow getUserMedia from a superseded call
// cannot overwrite the stream (or the error) of a newer one.
let startToken = 0

async function requestStream(deviceId: string): Promise<MediaStream> {
  // Prefer the configured device, but never leave the booth on a black screen:
  // a stored device id can go stale (camera unplugged, ids rotated after a
  // reboot), so fall back to a soft constraint and finally to any camera.
  // Ask for as much detail as the camera will give. Without this browsers
  // hand back 640x480, which caps the download page and the print alike; the
  // capture is the only original, so quality lost here is lost everywhere.
  const quality: MediaTrackConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 }
  }

  const attempts: MediaStreamConstraints[] = deviceId
    ? [
        { video: { ...quality, deviceId: { exact: deviceId } }, audio: false },
        { video: { ...quality, deviceId }, audio: false },
        { video: { ...quality }, audio: false },
        { video: true, audio: false }
      ]
    : [{ video: { ...quality }, audio: false }, { video: true, audio: false }]

  let lastError: unknown
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

async function startCamera(): Promise<void> {
  const token = ++startToken
  error.value = null

  // Stop any existing stream
  stopCamera()

  // macOS returns a stream of black frames rather than an error when access is
  // blocked, so check TCC up front and say so instead of showing a black box.
  const accessStatus = await window.api.camera.getAccessStatus().catch(() => 'granted')
  if (token !== startToken) return
  if (accessStatus === 'denied' || accessStatus === 'restricted') {
    error.value =
      'Camera access is blocked for this app. Enable it in System Settings → Privacy & Security → Camera, then restart.'
    return
  }

  try {
    const mediaStream = await requestStream(props.cameraDeviceId)

    // A newer startCamera() took over while getUserMedia was pending
    if (token !== startToken) {
      for (const track of mediaStream.getTracks()) {
        track.stop()
      }
      return
    }

    stream.value = mediaStream

    if (videoRef.value) {
      videoRef.value.srcObject = mediaStream
      await videoRef.value.play().catch(() => {
        // Autoplay rejection is non-fatal — the muted feed resumes on its own
      })
    }
  } catch (err) {
    if (token !== startToken) return

    if (err instanceof DOMException) {
      if (err.name === 'NotAllowedError') {
        error.value = 'Camera access was denied. Please allow camera permissions and try again.'
      } else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
        error.value = 'No camera found. Please connect a camera and check your settings.'
      } else if (err.name === 'NotReadableError') {
        error.value = 'The camera is already in use by another application.'
      } else {
        error.value = `Camera error: ${err.name} — ${err.message}`
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
  if (videoRef.value) {
    videoRef.value.srcObject = null
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
    <!-- Live camera feed. Mirrored so guests see themselves as in a mirror;
         this is CSS only, so the capture keeps its real orientation. -->
    <video
      v-show="stream"
      ref="videoRef"
      autoplay
      playsinline
      muted
      class="h-full w-full -scale-x-100 object-cover"
    />

    <!-- Error state -->
    <div v-if="error && !stream" class="flex flex-col items-center justify-center text-center">
      <div class="text-6xl text-zinc-600">&#x1f4f7;</div>
      <p class="mt-4 max-w-md text-lg text-zinc-400">{{ error }}</p>
    </div>
  </div>
</template>
