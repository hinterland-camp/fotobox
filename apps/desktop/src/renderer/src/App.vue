<script setup lang="ts">
import type { Photo, UploadResponse } from '@fotobox/shared'

// Types available for use in the desktop renderer
const _typeCheck: Photo | UploadResponse | null = null
void _typeCheck
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-zinc-900">
    <div class="text-center">
      <h1 class="text-4xl font-bold text-white">Fotobox</h1>
      <p class="mt-4 text-lg text-zinc-400">Desktop photo booth app</p>
    </div>
  </div>
</template>
