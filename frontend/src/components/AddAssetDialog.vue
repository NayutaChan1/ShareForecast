<script setup lang="ts">
import { computed, ref } from 'vue';

import { api } from '../api/client';
import type { NewAsset } from '../types';

const emit = defineEmits<{ close: []; created: [symbol: string, taggedArticles: number] }>();

const symbol = ref('');
const name = ref('');
const type = ref<'crypto' | 'stock'>('crypto');
const keywordText = ref('');

const submitting = ref(false);
const error = ref<string | null>(null);

// Comma-separated in the box, an array on the wire.
const keywords = computed(() =>
  keywordText.value
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean),
);

const canSubmit = computed(
  () => symbol.value.trim() && name.value.trim() && keywords.value.length > 0 && !submitting.value,
);

const placeholder = computed(() =>
  type.value === 'crypto'
    ? { symbol: 'ADAUSDT', name: 'Cardano', keywords: 'cardano' }
    : { symbol: 'TLKM.JK', name: 'Telkom Indonesia', keywords: 'telkom, telkomsel' },
);

async function submit(): Promise<void> {
  if (!canSubmit.value) return;
  submitting.value = true;
  error.value = null;

  const payload: NewAsset = {
    symbol: symbol.value.trim(),
    name: name.value.trim(),
    type: type.value,
    keywords: keywords.value,
  };

  try {
    const created = await api.createAsset(payload);
    emit('created', created.symbol, created.taggedArticles);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'failed to add asset';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="panel w-full max-w-md" @keydown.esc="emit('close')">
      <div class="panel-header">
        <h2 class="panel-title">Tambah Aset</h2>
        <button
          type="button"
          class="text-slate-500 transition-colors hover:text-slate-200"
          aria-label="Tutup"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <form class="space-y-4 px-4 py-4" @submit.prevent="submit">
        <div class="flex rounded-lg bg-ink-700 p-0.5">
          <button
            v-for="option in (['crypto', 'stock'] as const)"
            :key="option"
            type="button"
            class="flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors"
            :class="type === option ? 'bg-ink-500 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
            @click="type = option"
          >
            {{ option }}
          </button>
        </div>

        <label class="block">
          <span class="mb-1 block text-[11px] font-medium text-slate-400">Simbol</span>
          <input
            v-model="symbol"
            type="text"
            required
            autofocus
            :placeholder="placeholder.symbol"
            class="w-full rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-sm uppercase text-slate-100 placeholder:normal-case placeholder:text-slate-600 focus:border-accent focus:outline-none"
          />
          <span class="mt-1 block text-[10px] text-slate-500">
            {{
              type === 'crypto'
                ? 'Pasangan trading Binance, mis. ADAUSDT'
                : 'Ticker Yahoo. Saham Indonesia wajib akhiran .JK'
            }}
          </span>
        </label>

        <label class="block">
          <span class="mb-1 block text-[11px] font-medium text-slate-400">Nama</span>
          <input
            v-model="name"
            type="text"
            required
            :placeholder="placeholder.name"
            class="w-full rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-accent focus:outline-none"
          />
        </label>

        <label class="block">
          <span class="mb-1 block text-[11px] font-medium text-slate-400">
            Kata kunci berita
          </span>
          <input
            v-model="keywordText"
            type="text"
            required
            :placeholder="placeholder.keywords"
            class="w-full rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-accent focus:outline-none"
          />
          <span class="mt-1 block text-[10px] text-slate-500">
            Pisahkan dengan koma. Hindari kata pendek yang ambigu.
          </span>
        </label>

        <div v-if="keywords.length" class="flex flex-wrap gap-1">
          <span
            v-for="keyword in keywords"
            :key="keyword"
            class="rounded bg-ink-600/80 px-1.5 py-0.5 text-[10px] text-slate-400"
          >
            {{ keyword }}
          </span>
        </div>

        <p v-if="error" class="rounded-lg bg-bearish/10 px-3 py-2 text-[11px] leading-relaxed text-bearish">
          {{ error }}
        </p>

        <div class="flex justify-end gap-2 pt-1">
          <button
            type="button"
            class="rounded-lg px-3 py-2 text-xs text-slate-400 transition-colors hover:text-slate-200"
            @click="emit('close')"
          >
            Batal
          </button>
          <button
            type="submit"
            :disabled="!canSubmit"
            class="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-ink-900 transition-opacity disabled:opacity-40"
          >
            <span
              v-if="submitting"
              class="h-3 w-3 animate-spin rounded-full border-2 border-ink-900 border-t-transparent"
            />
            {{ submitting ? 'Memverifikasi…' : 'Tambah' }}
          </button>
        </div>

        <p class="text-[10px] leading-relaxed text-slate-600">
          Simbol diverifikasi ke {{ type === 'crypto' ? 'Binance' : 'Yahoo Finance' }} sebelum
          disimpan, jadi proses ini bisa memakan beberapa detik.
        </p>
      </form>
    </div>
  </div>
</template>
