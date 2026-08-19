<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { api } from '../api/client';
import type { Asset } from '../types';

const props = defineProps<{ asset: Asset }>();
const emit = defineEmits<{ close: []; saved: [symbol: string, taggedArticles: number] }>();

const keywords = ref<string[]>([]);
const draft = ref('');

const loading = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);

// Compared against the loaded list so Save is inert until something changes.
const original = ref<string>('');
const dirty = computed(() => JSON.stringify(keywords.value) !== original.value);
const canSave = computed(() => keywords.value.length > 0 && dirty.value && !saving.value);

function addDraft(): void {
  // One field, comma-separated, same as the create dialog.
  const added = draft.value
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
    .filter((k) => k.length >= 2 && !keywords.value.includes(k));

  keywords.value.push(...added);
  draft.value = '';
}

function remove(keyword: string): void {
  keywords.value = keywords.value.filter((k) => k !== keyword);
}

onMounted(async () => {
  try {
    const detail = await api.asset(props.asset.symbol);
    keywords.value = [...detail.keywords];
    original.value = JSON.stringify(detail.keywords);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'gagal memuat kata kunci';
  } finally {
    loading.value = false;
  }
});

async function save(): Promise<void> {
  if (!canSave.value) return;
  saving.value = true;
  error.value = null;
  try {
    const updated = await api.updateKeywords(props.asset.symbol, keywords.value);
    emit('saved', updated.symbol, updated.taggedArticles);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'gagal menyimpan';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="panel w-full max-w-md">
      <div class="panel-header">
        <h2 class="panel-title">Kata Kunci · {{ asset.symbol }}</h2>
        <button
          type="button"
          class="text-slate-500 transition-colors hover:text-slate-200"
          aria-label="Tutup"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="space-y-4 px-4 py-4">
        <p v-if="loading" class="py-4 text-center text-xs text-slate-500">Memuat…</p>

        <template v-else>
          <div>
            <span class="mb-2 block text-[11px] font-medium text-slate-400">
              Kata kunci aktif ({{ keywords.length }})
            </span>

            <div v-if="keywords.length" class="flex flex-wrap gap-1.5">
              <span
                v-for="keyword in keywords"
                :key="keyword"
                class="group inline-flex items-center gap-1 rounded-md bg-ink-600 px-2 py-1 text-[11px] text-slate-300"
              >
                {{ keyword }}
                <button
                  type="button"
                  class="text-slate-500 transition-colors hover:text-bearish"
                  :aria-label="`Hapus kata kunci ${keyword}`"
                  @click="remove(keyword)"
                >
                  ✕
                </button>
              </span>
            </div>

            <p v-else class="rounded-lg bg-bearish/10 px-3 py-2 text-[11px] text-bearish">
              Minimal satu kata kunci. Tanpa itu aset tidak akan pernah cocok dengan berita.
            </p>
          </div>

          <form class="space-y-1" @submit.prevent="addDraft">
            <label class="block text-[11px] font-medium text-slate-400">Tambah kata kunci</label>
            <div class="flex gap-2">
              <input
                v-model="draft"
                type="text"
                placeholder="bumi tbk, emiten bumi"
                class="min-w-0 flex-1 rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                :disabled="!draft.trim()"
                class="shrink-0 rounded-lg bg-ink-600 px-3 py-2 text-xs text-slate-200 transition-opacity disabled:opacity-40"
              >
                Tambah
              </button>
            </div>
            <span class="block text-[10px] text-slate-500">
              Pisahkan dengan koma. Hindari kata umum — <code>bumi</code> juga berarti "earth" dan
              akan cocok dengan berita non-pasar.
            </span>
          </form>

          <p v-if="error" class="rounded-lg bg-bearish/10 px-3 py-2 text-[11px] text-bearish">
            {{ error }}
          </p>

          <div class="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              class="rounded-lg px-3 py-2 text-xs text-slate-400 transition-colors hover:text-slate-200"
              @click="emit('close')"
            >
              Batal
            </button>
            <button
              type="button"
              :disabled="!canSave"
              class="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-ink-900 transition-opacity disabled:opacity-40"
              @click="save"
            >
              <span
                v-if="saving"
                class="h-3 w-3 animate-spin rounded-full border-2 border-ink-900 border-t-transparent"
              />
              {{ saving ? 'Menandai ulang…' : 'Simpan' }}
            </button>
          </div>

          <p class="text-[10px] leading-relaxed text-slate-600">
            Menyimpan akan menandai ulang seluruh arsip berita untuk aset ini — kata kunci yang
            dihapus juga melepas artikel yang hanya cocok karenanya.
          </p>
        </template>
      </div>
    </div>
  </div>
</template>
