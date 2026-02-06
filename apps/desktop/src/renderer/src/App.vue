<script setup lang="ts">
import type { Photo, UploadResponse } from '@fotobox/shared'

// Types available for use in the desktop renderer
const _typeCheck: Photo | UploadResponse | null = null
void _typeCheck
</script>

<template>
  <div class="flex h-screen w-screen flex-col items-center justify-center bg-black">
    <!-- Camera preview area (placeholder) -->
    <div class="flex aspect-video w-full max-w-4xl items-center justify-center bg-zinc-900">
      <div class="text-center">
        <div class="text-6xl text-zinc-600">📷</div>
        <p class="mt-4 text-xl text-zinc-500">Camera preview will appear here</p>
      </div>
    </div>

    <!-- Tap prompt -->
    <p class="mt-8 animate-pulse text-lg text-zinc-400">Tap anywhere to take a photo</p>
  </div>
</template>
