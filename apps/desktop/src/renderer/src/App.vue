<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import PasswordDialog from './components/PasswordDialog.vue'
import SettingsPanel from './components/SettingsPanel.vue'

type Screen = 'photobooth' | 'settings'

const currentScreen = ref<Screen>('photobooth')
const showPasswordDialog = ref(false)

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && currentScreen.value === 'photobooth' && !showPasswordDialog.value) {
    showPasswordDialog.value = true
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
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
  currentScreen.value = 'photobooth'
}
</script>

<template>
  <!-- Photobooth Screen -->
  <div v-if="currentScreen === 'photobooth'" class="flex h-screen w-screen flex-col items-center justify-center bg-black">
    <!-- Camera preview area (placeholder) -->
    <div class="flex aspect-video w-full max-w-4xl items-center justify-center bg-zinc-900">
      <div class="text-center">
        <div class="text-6xl text-zinc-600">&#x1f4f7;</div>
        <p class="mt-4 text-xl text-zinc-500">Camera preview will appear here</p>
      </div>
    </div>

    <!-- Tap prompt -->
    <p class="mt-8 animate-pulse text-lg text-zinc-400">Tap anywhere to take a photo</p>
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
