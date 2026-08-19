<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { api } from '../api/client';
import type { AssetCondition } from '../types';

const props = defineProps<{ symbol: string }>();

const condition = ref<AssetCondition | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    condition.value = await api.condition(props.symbol);
  } catch (err) {
    condition.value = null;
    error.value = err instanceof Error ? err.message : 'gagal memuat kondisi aset';
  } finally {
    loading.value = false;
  }
}

watch(() => props.symbol, () => void load(), { immediate: true });

/** Colour only where a direction is genuinely implied, not for every number. */
const directionClass = (value: string | null): string =>
  value === 'naik' ? 'text-bullish' : value === 'turun' ? 'text-bearish' : 'text-slate-300';

const tiles = computed(() => {
  const c = condition.value;
  if (!c) return [];
  return [
    {
      label: 'Tren',
      value: c.trend.structure.value ?? '—',
      cls: directionClass(c.trend.structure.value),
      reading: c.trend.sma20.reading,
    },
    {
      label: 'Momentum',
      value: c.momentum.rsi14.value !== null ? `RSI ${c.momentum.rsi14.value}` : '—',
      cls: 'text-slate-300',
      reading: c.momentum.rsi14.reading,
    },
    {
      label: 'Volatilitas',
      value: c.volatility.annualisedPct.value !== null ? `${c.volatility.annualisedPct.value}%` : '—',
      cls: 'text-slate-300',
      reading: c.volatility.annualisedPct.reading,
    },
    {
      label: 'Posisi rentang',
      value: c.range.positionPct.value !== null ? `${c.range.positionPct.value}%` : '—',
      cls: 'text-slate-300',
      reading: c.range.drawdownPct.reading,
    },
    {
      label: 'Volume',
      value: c.volume.trend.value ?? '—',
      cls: directionClass(c.volume.trend.value),
      reading: c.volume.trend.reading,
    },
  ];
});

const asOf = computed(() =>
  condition.value?.asOf
    ? new Date(condition.value.asOf * 1000).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—',
);
</script>

<template>
  <section class="panel shrink-0">
    <div class="panel-header">
      <h2 class="panel-title">Kondisi · {{ symbol }}</h2>
      <span v-if="condition" class="text-[11px] text-slate-500">
        {{ condition.basis.candles }} candle harian · per {{ asOf }}
      </span>
    </div>

    <p v-if="loading" class="px-4 py-5 text-center text-xs text-slate-500">Menghitung…</p>
    <p v-else-if="error" class="px-4 py-5 text-center text-xs text-bearish">{{ error }}</p>

    <template v-else-if="condition">
      <div class="grid grid-cols-2 gap-px bg-ink-600/50 sm:grid-cols-3 lg:grid-cols-5">
        <div v-for="tile in tiles" :key="tile.label" class="bg-ink-800 px-4 py-3">
          <p class="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            {{ tile.label }}
          </p>
          <p class="tabular mt-1 text-sm font-semibold capitalize" :class="tile.cls">
            {{ tile.value }}
          </p>
          <p class="mt-0.5 text-[11px] leading-snug text-slate-500">{{ tile.reading }}</p>
        </div>
      </div>

      <!-- Where the price sits between the period low and high. -->
      <div v-if="condition.range.positionPct.value !== null" class="px-4 py-3">
        <div class="relative h-1 rounded-full bg-ink-600">
          <div
            class="absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
            :style="{ left: `${condition.range.positionPct.value}%` }"
          />
        </div>
        <div class="tabular mt-1.5 flex justify-between text-[10px] text-slate-600">
          <span>{{ condition.range.low?.toLocaleString('en-US') }}</span>
          <span class="text-slate-500">{{ condition.range.positionPct.reading }}</span>
          <span>{{ condition.range.high?.toLocaleString('en-US') }}</span>
        </div>
      </div>

      <p
        v-if="!condition.basis.sufficient"
        class="border-t border-ink-600/70 px-4 py-2 text-[11px] text-bearish"
      >
        Hanya {{ condition.basis.candles }} candle tersedia — sebagian indikator belum bermakna.
      </p>
      <p v-else class="border-t border-ink-600/70 px-4 py-2 text-[10px] leading-relaxed text-slate-600">
        Ringkasan terukur dari data harga, bukan rekomendasi beli atau jual. Tidak memuat sentimen
        berita, dan tidak memperkirakan harga ke depan.
      </p>
    </template>
  </section>
</template>
