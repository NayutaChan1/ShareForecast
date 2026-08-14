<script setup lang="ts">
import { computed } from 'vue';

import { changeClass, formatPercent, formatPrice } from '../lib/format';
import type { Asset, Quote } from '../types';

const props = defineProps<{
  assets: Asset[];
  quotes: Record<string, Quote>;
  selected: string;
}>();

const emit = defineEmits<{ select: [symbol: string] }>();

const groups = computed(() => [
  { label: 'Crypto', items: props.assets.filter((a) => a.type === 'crypto') },
  { label: 'Stocks', items: props.assets.filter((a) => a.type === 'stock') },
]);
</script>

<template>
  <aside class="panel flex h-full flex-col overflow-hidden">
    <div class="panel-header">
      <h2 class="panel-title">Watchlist</h2>
      <span class="text-[11px] text-slate-500">{{ assets.length }} assets</span>
    </div>

    <div class="flex-1 overflow-y-auto">
      <div v-for="group in groups" :key="group.label">
        <p
          v-if="group.items.length"
          class="sticky top-0 z-10 bg-ink-800/95 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500 backdrop-blur"
        >
          {{ group.label }}
        </p>

        <button
          v-for="asset in group.items"
          :key="asset.symbol"
          type="button"
          class="flex w-full items-center justify-between border-l-2 px-4 py-2.5 text-left transition-colors"
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
        </button>
      </div>
    </div>
  </aside>
</template>
