<script setup lang="ts">
import type { Photo } from '@fotobox/shared'

const route = useRoute()
const photoId = route.params.id as string

interface Branding {
  logo: string
  tagline: string
  links: { label: string; url: string }[]
}

const { data: photo, error: photoError } = await useFetch<Photo>(`/api/photos/${photoId}`)
const { data: branding } = await useFetch<Branding>('/api/branding')

const photoUrl = `/api/photos/${photoId}/download`

if (photo.value) {
  useHead({
    title: `Photo — Fotobox`,
  })

  useSeoMeta({
    ogTitle: 'Photo — Fotobox',
    ogDescription: branding.value?.tagline || 'Download your photo from the photo booth',
    ogImage: photoUrl,
    ogType: 'website',
  })
}
</script>

<template>
  <!-- 404 state -->
  <div
    v-if="photoError?.statusCode === 404 || (!photo && !photoError)"
    class="flex min-h-screen items-center justify-center bg-gray-950 px-4 text-white"
  >
    <div class="text-center">
      <p class="text-6xl">📷</p>
      <h1 class="mt-4 text-2xl font-bold">Photo not found</h1>
      <p class="mt-2 text-gray-400">
        This photo may have been removed or the link is incorrect.
      </p>
    </div>
  </div>

  <!-- Photo page -->
  <div
    v-else-if="photo"
    class="flex min-h-screen flex-col items-center bg-gray-950 px-4 py-8 text-white"
  >
    <div class="w-full max-w-lg">
      <!-- Photo card -->
      <div class="overflow-hidden rounded-2xl bg-gray-900 shadow-2xl">
        <img
          :src="photoUrl"
          alt="Photo booth photo"
          class="w-full"
          loading="eager"
        />
      </div>

      <!-- Download button -->
      <a
        :href="photoUrl"
        download
        class="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-4 text-lg font-semibold text-gray-950 transition hover:bg-gray-200 active:scale-[0.98]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Download Photo
      </a>

      <!-- Branding section -->
      <div v-if="branding" class="mt-8 text-center">
        <img
          v-if="branding.logo"
          :src="branding.logo"
          alt="Logo"
          class="mx-auto h-10 object-contain"
        />
        <p v-if="branding.tagline" class="mt-3 text-sm text-gray-400">
          {{ branding.tagline }}
        </p>
        <div
          v-if="branding.links.length > 0"
          class="mt-3 flex flex-wrap justify-center gap-4"
        >
          <a
            v-for="link in branding.links"
            :key="link.url"
            :href="link.url"
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm text-gray-400 underline underline-offset-2 transition hover:text-white"
          >
            {{ link.label }}
          </a>
        </div>
      </div>
    </div>
  </div>
</template>
