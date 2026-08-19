<script setup lang="ts">
import { computed, ref } from 'vue';

import { changeClass, formatPercent, formatPrice } from '../lib/format';
import type { Asset, Quote } from '../types';

const props = defineProps<{
  assets: Asset[];
  quotes: Record<string, Quote>;
  selected: string;
}>();

const emit = defineEmits<{
  select: [symbol: string];
  add: [];
  remove: [symbol: string];
  editKeywords: [asset: Asset];
}>();

// Which row is awaiting delete confirmation. Deleting an asset drops its
// stored candles too, so it asks before doing it.
const confirming = ref<string | null>(null);

const groups = computed(() => [
  { label: 'Crypto', items: props.assets.filter((a) => a.type === 'crypto') },
  { label: 'Stocks', items: props.assets.filter((a) => a.type === 'stock') },
]);
</script>

<template>
  <aside class="panel flex h-full flex-col overflow-hidden">
    <div class="panel-header">
      <h2 class="panel-title">Watchlist</h2>
      <div class="flex items-center gap-2">
        <span class="text-[11px] text-slate-500">{{ assets.length }}</span>
        <button
          type="button"
          class="grid h-5 w-5 place-items-center rounded bg-ink-600 text-sm leading-none text-slate-300 transition-colors hover:bg-accent hover:text-ink-900"
          title="Tambah aset"
          aria-label="Tambah aset"
          @click="emit('add')"
        >
          +
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto">
      <div v-for="group in groups" :key="group.label">
        <p
          v-if="group.items.length"
          class="sticky top-0 z-10 bg-ink-800/95 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500 backdrop-blur"
        >
          {{ group.label }}
        </p>

        <div
          v-for="asset in group.items"
          :key="asset.symbol"
          class="group relative flex w-full cursor-pointer items-center justify-between border-l-2 px-4 py-2.5 text-left transition-colors"
          :class="
            asset.symbol === selected
              ? 'border-accent bg-ink-700/70'
              : 'border-transparent hover:bg-ink-700/40'
          "
          @click="emit('select', asset.symbol)"
        >
          <span class="min-w-0">
            <span class="block truncate text-sm font-semibold text-slate-100">
              {{ asset.symbol }}
            </span>
            <span class="block truncate text-[11px] text-slate-500">{{ asset.name }}</span>
          </span>

          <span v-if="quotes[asset.symbol]" class="tabular shrink-0 text-right">
            <span class="block text-sm text-slate-200">
              {{ formatPrice(quotes[asset.symbol].price) }}
            </span>
            <span
              class="block text-[11px] font-medium"
              :class="changeClass(quotes[asset.symbol].changePercent)"
            >
              {{ formatPercent(quotes[asset.symbol].changePercent) }}
            </span>
          </span>
          <span v-else class="shrink-0 text-[11px] text-slate-600">—</span>

          <!-- Row actions, revealed on hover. -->
          <span
            v-if="confirming !== asset.symbol"
            class="absolute right-1 top-1 hidden gap-1 group-hover:flex"
          >
            <button
              type="button"
              class="grid h-5 w-5 place-items-center rounded bg-ink-600 text-[10px] text-slate-400 transition-colors hover:bg-accent hover:text-ink-900"
              :title="`Kata kunci ${asset.symbol}`"
              :aria-label="`Kata kunci ${asset.symbol}`"
              @click.stop="emit('editKeywords', asset)"
            >
              ✎
            </button>
            <button
              type="button"
              class="grid h-5 w-5 place-items-center rounded bg-ink-600 text-[11px] text-slate-400 transition-colors hover:bg-bearish hover:text-white"
              :title="`Hapus ${asset.symbol}`"
              :aria-label="`Hapus ${asset.symbol}`"
              @click.stop="confirming = asset.symbol"
            >
              ✕
            </button>
          </span>

          <div
            v-else
            class="absolute inset-0 flex items-center justify-between gap-2 bg-ink-900/95 px-4"
            @click.stop
          >
            <span class="truncate text-[11px] text-slate-300">Hapus {{ asset.symbol }}?</span>
            <span class="flex shrink-0 gap-1">
              <button
                type="button"
                class="rounded bg-bearish px-2 py-0.5 text-[10px] font-semibold text-white"
                @click="emit('remove', asset.symbol); confirming = null"
              >
                Hapus
              </button>
              <button
                type="button"
                class="rounded bg-ink-600 px-2 py-0.5 text-[10px] text-slate-300"
                @click="confirming = null"
              >
                Batal
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>
