<script setup lang="ts">
import type { Photo, UploadResponse } from '@fotobox/shared'

// Types available for use in the web app
const _typeCheck: Photo | UploadResponse | null = null
void _typeCheck
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-gray-950 text-white">
    <div class="text-center">
      <h1 class="text-4xl font-bold tracking-tight">Fotobox</h1>
      <p class="mt-4 text-lg text-gray-400">Photo booth web app</p>
    </div>
  </div>
</template>
