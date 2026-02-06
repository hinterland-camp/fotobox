<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import PasswordDialog from './components/PasswordDialog.vue'

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

  <!-- Settings Screen (placeholder) -->
  <div v-else-if="currentScreen === 'settings'" class="flex h-screen w-screen flex-col items-center justify-center bg-zinc-950">
    <div class="w-full max-w-2xl rounded-2xl bg-zinc-900 p-8">
      <h1 class="mb-6 text-2xl font-bold text-white">Settings</h1>
      <p class="text-zinc-400">Settings panel will be implemented in a future update.</p>

      <button
        class="mt-8 rounded-lg bg-blue-600 px-6 py-3 text-white transition hover:bg-blue-500"
        @click="returnToPhotobooth"
      >
        Return to Photobooth
      </button>
    </div>
  </div>

  <!-- Password Dialog -->
  <PasswordDialog
    :visible="showPasswordDialog"
    @cancel="handlePasswordCancel"
    @success="handlePasswordSuccess"
  />
</template>
