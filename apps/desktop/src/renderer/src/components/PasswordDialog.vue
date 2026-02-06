<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  cancel: []
  success: []
}>()

const password = ref('')
const error = ref('')
const loading = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.visible,
  async (val) => {
    if (val) {
      password.value = ''
      error.value = ''
      await nextTick()
      inputRef.value?.focus()
    }
  }
)

async function handleSubmit(): Promise<void> {
  if (!password.value) return
  loading.value = true
  error.value = ''

  const valid = await window.api.kiosk.validatePassword(password.value)
  loading.value = false

  if (valid) {
    emit('success')
  } else {
    error.value = 'Incorrect password'
    password.value = ''
    await nextTick()
    inputRef.value?.focus()
  }
}

function handleCancel(): void {
  emit('cancel')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      @keydown.escape="handleCancel"
    >
      <div class="w-full max-w-sm rounded-2xl bg-zinc-900 p-8 shadow-2xl">
        <h2 class="mb-6 text-center text-xl font-semibold text-white">Exit Kiosk Mode</h2>

        <form @submit.prevent="handleSubmit">
          <label class="mb-2 block text-sm text-zinc-400" for="kiosk-password">Password</label>
          <input
            id="kiosk-password"
            ref="inputRef"
            v-model="password"
            type="password"
            class="mb-2 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-500 outline-none focus:border-blue-500"
            placeholder="Enter password"
            autocomplete="off"
          />

          <p v-if="error" class="mb-4 text-sm text-red-400">{{ error }}</p>
          <div v-else class="mb-4" />

          <div class="flex gap-3">
            <button
              type="button"
              class="flex-1 rounded-lg bg-zinc-700 px-4 py-3 text-white transition hover:bg-zinc-600"
              @click="handleCancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-white transition hover:bg-blue-500 disabled:opacity-50"
              :disabled="loading || !password"
            >
              {{ loading ? 'Checking...' : 'Submit' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
