<script setup lang="ts">
import { ref, watch } from 'vue'

interface GalleryPhoto {
  path: string
  thumbnail: string
}

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const photos = ref<GalleryPhoto[]>([])
const loading = ref(false)
const enlarged = ref<string | null>(null)

async function load(): Promise<void> {
  loading.value = true
  enlarged.value = null
  try {
    photos.value = await window.api.photos.list(60)
  } finally {
    loading.value = false
  }
}

async function openPhoto(photo: GalleryPhoto): Promise<void> {
  // Thumbnails are small enough for the grid; only fetch the full image when
  // a guest actually opens one.
  enlarged.value = (await window.api.photos.getDataUrl(photo.path)) ?? photo.thumbnail
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) load()
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="visible"
        class="fixed inset-0 z-[60] flex flex-col bg-black/95 backdrop-blur-sm"
        @click.stop
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-8 py-6">
          <h2 class="text-2xl font-bold tracking-tight text-white">
            Photos from today
          </h2>
          <button
            class="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white transition-transform active:scale-[0.95]"
            aria-label="Close gallery"
            @click="emit('close')"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              class="h-6 w-6"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Grid -->
        <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-8 pb-8">
          <div v-if="loading" class="flex justify-center py-20">
            <div
              class="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/70"
            />
          </div>

          <p v-else-if="photos.length === 0" class="py-20 text-center text-lg text-white/40">
            No photos yet — take the first one!
          </p>

          <div v-else class="grid grid-cols-4 gap-3">
            <button
              v-for="photo in photos"
              :key="photo.path"
              class="overflow-hidden rounded-xl bg-white/5 transition-transform active:scale-[0.97]"
              @click="openPhoto(photo)"
            >
              <img :src="photo.thumbnail" alt="" class="aspect-[4/3] w-full object-cover" />
            </button>
          </div>
        </div>

        <!-- Enlarged photo -->
        <div
          v-if="enlarged"
          class="absolute inset-0 z-10 flex items-center justify-center bg-black/95 p-10"
          @click="enlarged = null"
        >
          <img :src="enlarged" alt="" class="max-h-full max-w-full rounded-2xl object-contain" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
