<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  EMPTY_FRAME,
  type FrameConfig,
  type FrameVariant,
  type Rect
} from '../../../common/frames'

const props = defineProps<{
  variant: FrameVariant
  title: string
  hint: string
}>()

const emit = defineEmits<{ changed: [FrameConfig] }>()

const config = ref<FrameConfig>(EMPTY_FRAME)
const dataUrl = ref('')

async function load(): Promise<void> {
  const frames = await window.api.frames.getAll()
  config.value = frames[props.variant]
  dataUrl.value = (await window.api.frames.getDataUrl(props.variant)) || ''
}

onMounted(load)

async function onSelect(): Promise<void> {
  // A native dialog rather than an <input type="file">: Electron 32 removed
  // File.path, so the browser picker could not tell us where the file lives.
  const picked = await window.api.frames.select(props.variant)
  if (!picked) return
  config.value = picked.config
  dataUrl.value = picked.dataUrl
  emit('changed', picked.config)
}

async function onClear(): Promise<void> {
  await window.api.frames.clear(props.variant)
  config.value = EMPTY_FRAME
  dataUrl.value = ''
  emit('changed', EMPTY_FRAME)
}

async function saveLayout(photo: Rect, qr: Rect | null): Promise<void> {
  config.value = await window.api.frames.setLayout(props.variant, { photo, qr })
  emit('changed', config.value)
}

function fieldValue(event: Event): number | null {
  const value = Math.round(Number((event.target as HTMLInputElement).value))
  return Number.isFinite(value) ? value : null
}

function onPhotoField(field: keyof Rect, event: Event): void {
  const value = fieldValue(event)
  if (value === null) return
  saveLayout({ ...config.value.photo, [field]: value }, config.value.qr)
}

function onFillFrame(): void {
  saveLayout({ x: 0, y: 0, width: config.value.width, height: config.value.height }, config.value.qr)
}

// A code the artwork already carries is usually a small square in a corner;
// this is only the starting guess the operator then nudges into place.
const SUGGESTED_QR_FRACTION = 0.125

function onQrToggle(event: Event): void {
  const wanted = (event.target as HTMLInputElement).checked
  if (!wanted) {
    saveLayout(config.value.photo, null)
    return
  }
  const size = Math.round(
    Math.min(config.value.width, config.value.height) * SUGGESTED_QR_FRACTION
  )
  saveLayout(
    config.value.photo,
    config.value.qr ?? {
      x: size,
      y: config.value.height - size * 2,
      width: size,
      height: size
    }
  )
}

function onQrField(field: 'x' | 'y' | 'size', event: Event): void {
  const value = fieldValue(event)
  if (value === null || !config.value.qr) return
  const qr = config.value.qr
  const next: Rect =
    field === 'size'
      ? { ...qr, width: value, height: value }
      : { ...qr, [field]: value }
  saveLayout(config.value.photo, next)
}

const hasArtwork = computed(() => Boolean(config.value.path && config.value.width > 0))

function boxStyle(rect: Rect): Record<string, string> {
  const frame = config.value
  const pct = (part: number, whole: number): string => `${(part / whole) * 100}%`
  return {
    left: pct(rect.x, frame.width),
    top: pct(rect.y, frame.height),
    width: pct(rect.width, frame.width),
    height: pct(rect.height, frame.height)
  }
}
</script>

<template>
  <section class="rounded-2xl bg-zinc-900/60 p-6">
    <h2 class="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500">
      {{ title }}
    </h2>
    <p class="mb-4 text-sm text-zinc-500">{{ hint }}</p>

    <div class="flex gap-3">
      <button
        class="h-14 rounded-xl bg-zinc-700/60 px-6 text-base font-medium text-white transition-colors active:bg-zinc-600"
        @click="onSelect"
      >
        {{ hasArtwork ? 'Change artwork' : 'Select PNG' }}
      </button>
      <button
        v-if="hasArtwork"
        class="h-14 rounded-xl bg-zinc-700/60 px-6 text-base font-medium text-red-400 transition-colors active:bg-zinc-600"
        @click="onClear"
      >
        Remove
      </button>
    </div>

    <template v-if="hasArtwork">
      <p class="mt-3 truncate text-sm text-zinc-600">
        {{ config.path }} — {{ config.width }} × {{ config.height }} px
      </p>

      <!-- Blue is where the camera shows through, amber is the stamped code -->
      <div class="mt-4 inline-block">
        <div class="relative inline-block">
          <img
            :src="dataUrl"
            alt="Artwork preview"
            class="block max-h-72 rounded-xl border border-zinc-800 bg-white"
          />
          <div
            class="pointer-events-none absolute border-2 border-blue-400/90 bg-blue-400/15"
            :style="boxStyle(config.photo)"
          />
          <div
            v-if="config.qr"
            class="pointer-events-none absolute border-2 border-amber-400/90 bg-amber-400/20"
            :style="boxStyle(config.qr)"
          />
        </div>
      </div>

      <div class="mt-4">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm font-medium text-blue-300">Photo window</span>
          <button
            class="rounded-lg bg-zinc-700/60 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors active:bg-zinc-600"
            @click="onFillFrame"
          >
            Fill the frame
          </button>
        </div>
        <div class="grid grid-cols-4 gap-2">
          <label v-for="field in (['x', 'y', 'width', 'height'] as const)" :key="field" class="block">
            <span class="mb-1 block text-xs uppercase tracking-wide text-zinc-600">{{ field }}</span>
            <input
              type="number"
              min="0"
              class="h-12 w-full rounded-xl border border-zinc-700/50 bg-zinc-800 px-3 text-base text-white outline-none transition-colors focus:border-blue-500"
              :value="config.photo[field]"
              @change="onPhotoField(field, $event)"
            />
          </label>
        </div>
      </div>

      <div class="mt-5 border-t border-zinc-800 pt-4">
        <label class="flex items-center gap-3">
          <input
            type="checkbox"
            class="h-5 w-5 rounded border-zinc-600 bg-zinc-800"
            :checked="!!config.qr"
            @change="onQrToggle"
          />
          <span class="text-sm font-medium text-amber-300">
            Stamp the guest's download code over this artwork
          </span>
        </label>
        <p class="mt-1.5 text-sm text-zinc-500">
          Cover the placeholder code the designer drew. Until the photo reaches the
          server the artwork keeps its own code, so nobody ever scans a dead link.
        </p>
        <div v-if="config.qr" class="mt-3 grid grid-cols-3 gap-2">
          <label v-for="field in (['x', 'y', 'size'] as const)" :key="field" class="block">
            <span class="mb-1 block text-xs uppercase tracking-wide text-zinc-600">{{ field }}</span>
            <input
              type="number"
              min="0"
              class="h-12 w-full rounded-xl border border-zinc-700/50 bg-zinc-800 px-3 text-base text-white outline-none transition-colors focus:border-amber-500"
              :value="field === 'size' ? config.qr.width : config.qr[field]"
              @change="onQrField(field, $event)"
            />
          </label>
        </div>
      </div>
    </template>
  </section>
</template>
