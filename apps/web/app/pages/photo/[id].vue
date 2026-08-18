<script setup lang="ts">
import type { Branding, Photo } from '@fotobox/shared'

const route = useRoute()
const photoId = route.params.id as string

const { data: photo, error: photoError } = await useFetch<Photo>(`/api/photos/${photoId}`)
const { data: branding } = await useFetch<Branding>('/api/branding')

const photoUrl = `/api/photos/${photoId}/download`

const shareState = ref<'idle' | 'copied' | 'failed'>('idle')
const photoPageUrl = ref('')

onMounted(() => {
  photoPageUrl.value = window.location.href
})

// WhatsApp works by plain link everywhere, so it stays reachable even when the
// browser offers no share sheet.
const whatsappUrl = computed(
  () =>
    `https://wa.me/?text=${encodeURIComponent(
      'Mein Foto aus der hinterland Fotobox: ' + photoPageUrl.value
    )}`
)

const shareLabel = computed(() => {
  if (shareState.value === 'copied') return 'Link kopiert'
  if (shareState.value === 'failed') return 'Kopieren nicht möglich'
  return 'Foto teilen'
})

async function copyLink(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Clipboard access is refused when the document is not focused, so fall
    // back to a selection-based copy rather than leaving a dead button.
  }

  try {
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.select()
    const copied = document.execCommand('copy')
    field.remove()
    return copied
  } catch {
    return false
  }
}

function flashShareState(state: 'copied' | 'failed'): void {
  shareState.value = state
  setTimeout(() => (shareState.value = 'idle'), 2500)
}

// The native sheet is what puts Instagram, WhatsApp and the rest in reach —
// no web link can post an image to Instagram directly.
async function sharePhoto(): Promise<void> {
  const pageUrl = photoPageUrl.value || window.location.href

  try {
    const response = await fetch(photoUrl)
    const blob = await response.blob()
    const file = new File([blob], 'hinterland-foto.png', { type: blob.type || 'image/png' })

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: 'Mein Foto aus der hinterland Fotobox' })
      return
    }
  } catch {
    // Sharing the file failed or was dismissed — try the link instead
  }

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Mein hinterland Foto', url: pageUrl })
    } catch {
      // Dismissed by the guest; nothing more to do
    }
    return
  }

  flashShareState((await copyLink(pageUrl)) ? 'copied' : 'failed')
}

if (photo.value) {
  useHead({
    title: 'Dein Foto — hinterland',
  })

  useSeoMeta({
    ogTitle: 'Dein Foto — hinterland',
    ogDescription: 'Lade dein Foto aus der hinterland Fotobox herunter',
    ogImage: photoUrl,
    ogType: 'website',
  })
}
</script>

<template>
  <!-- 404 state -->
  <div
    v-if="photoError?.statusCode === 404 || (!photo && !photoError)"
    class="flex min-h-screen items-center justify-center bg-white px-6 text-ink"
  >
    <div class="max-w-sm text-center">
      <img src="/hinterland-logo.svg" alt="hinterland" class="mx-auto h-10 w-10" />
      <h1 class="mt-8 text-3xl font-bold leading-none tracking-tight">
        Foto nicht gefunden
      </h1>
      <p class="mt-3 font-serif text-lg leading-snug text-ink-muted">
        Dieses Foto wurde vielleicht entfernt oder der Link stimmt nicht.
      </p>
    </div>
  </div>

  <!-- Photo page -->
  <div v-else-if="photo" class="min-h-screen bg-white text-ink">
    <div class="mx-auto flex min-h-screen w-full max-w-lg flex-col px-5 py-8">
      <!-- Logo -->
      <img src="/hinterland-logo.svg" alt="hinterland" class="mx-auto h-9 w-9" />

      <h1
        class="mt-7 text-balance text-center text-4xl font-bold leading-none tracking-tight"
      >
        Dein Foto ist fertig
      </h1>
      <p
        class="mt-3 text-balance text-center font-serif text-lg leading-snug text-ink-muted"
      >
        Freiheit. Auszeit. Unweit.
      </p>

      <!-- Photo -->
      <img
        :src="photoUrl"
        alt="Dein Foto aus der Fotobox"
        class="mt-8 w-full rounded-xl shadow-[0_10px_38px_-10px_rgba(82,69,60,0.25)]"
        loading="eager"
      />

      <!-- Download -->
      <a
        :href="photoUrl"
        download
        class="mt-6 flex w-full items-center justify-center gap-2.5 rounded-full bg-ink px-6 py-4 text-base font-semibold text-white transition hover:bg-ink-muted active:scale-[0.99]"
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
        Foto herunterladen
      </a>

      <!-- Share -->
      <button
        class="mt-3 flex w-full items-center justify-center gap-2.5 rounded-full border border-line px-6 py-4 text-base font-semibold text-ink transition hover:bg-paper active:scale-[0.99]"
        @click="sharePhoto"
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
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        {{ shareLabel }}
      </button>

      <a
        :href="whatsappUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="mt-3 text-center text-sm font-medium text-ink-soft underline underline-offset-4 transition hover:text-ink"
      >
        Per WhatsApp senden
      </a>

      <!-- App call to action — an open section, not a card, so the buttons
           are not boxes sitting inside another box -->
      <section
        v-if="branding?.appCta"
        class="mt-12 border-t border-line pt-9 text-center"
      >
        <h2 class="text-2xl font-bold leading-tight tracking-tight">
          {{ branding.appCta.headline }}
        </h2>
        <p class="mx-auto mt-2 max-w-xs font-serif leading-snug text-ink-muted">
          Finde Zelt- und Stellplätze in Alleinlage für deine nächste Auszeit.
        </p>

        <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            v-if="branding.appCta.appStoreUrl"
            :href="branding.appCta.appStoreUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-full bg-teal px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-teal-dark active:scale-[0.99] sm:px-8"
          >
            App Store
          </a>
          <a
            v-if="branding.appCta.playStoreUrl"
            :href="branding.appCta.playStoreUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-full bg-teal px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-teal-dark active:scale-[0.99] sm:px-8"
          >
            Google Play
          </a>
          <a
            v-if="
              !branding.appCta.appStoreUrl &&
              !branding.appCta.playStoreUrl &&
              branding.appCta.fallbackUrl
            "
            :href="branding.appCta.fallbackUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-full bg-teal px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-teal-dark active:scale-[0.99]"
          >
            Zur App
          </a>
        </div>
      </section>
    </div>
  </div>
</template>
