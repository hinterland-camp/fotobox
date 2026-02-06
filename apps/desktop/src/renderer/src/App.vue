<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import CameraPreview from './components/CameraPreview.vue'
import PasswordDialog from './components/PasswordDialog.vue'
import SettingsPanel from './components/SettingsPanel.vue'

type Screen = 'photobooth' | 'settings'

const currentScreen = ref<Screen>('photobooth')
const showPasswordDialog = ref(false)
const cameraDeviceId = ref('')
const framePath = ref('')

async function loadPhotoboothSettings(): Promise<void> {
  const settings = (await window.api.settings.getAll()) as Record<string, unknown>
  cameraDeviceId.value = (settings.cameraDeviceId as string) || ''
  framePath.value = (settings.framePath as string) || ''
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
})

function handlePasswordCancel(): void {
  showPasswordDialog.value = false
}

async function handlePasswordSuccess(): Promise<void> {
  showPasswordDialog.value = false
  await window.api.kiosk.exitToSettings()
  currentScreen.value = 'settings'
}

async function returnToPhotobooth(): Promise<void> {
  await window.api.kiosk.enterKiosk()
  await loadPhotoboothSettings()
  currentScreen.value = 'photobooth'
}
</script>

<template>
  <!-- Photobooth Screen -->
  <div v-if="currentScreen === 'photobooth'" class="relative h-screen w-screen bg-black">
    <!-- Live camera preview -->
    <CameraPreview :camera-device-id="cameraDeviceId" />

    <!-- Frame overlay -->
    <img
      v-if="framePath"
      :src="`file://${framePath}`"
      alt=""
      class="pointer-events-none absolute inset-0 h-full w-full object-cover"
    />

    <!-- Tap prompt -->
    <p class="absolute bottom-8 left-1/2 -translate-x-1/2 animate-pulse text-lg text-white drop-shadow-lg">
      Tap anywhere to take a photo
    </p>
  </div>

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
</template>
