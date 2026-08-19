<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { api } from '../api/client';
import type { SignalValidation, ValidationStatus } from '../types';

const props = defineProps<{ symbol: string | null }>();

const result = ref<SignalValidation | null>(null);
const loading = ref(false);
const expanded = ref(false);
const horizon = ref(7);

async function load(): Promise<void> {
  loading.value = true;
  try {
    result.value = await api.validation(props.symbol ?? undefined, horizon.value);
  } catch {
    result.value = null;
  } finally {
    loading.value = false;
  }
}

watch([() => props.symbol, horizon], () => void load(), { immediate: true });

const STATUS: Record<ValidationStatus, { label: string; cls: string }> = {
  insufficient: { label: 'Data belum cukup', cls: 'bg-flat/15 text-slate-400' },
  no_signal: { label: 'Tidak ada sinyal', cls: 'bg-bearish/15 text-bearish' },
  weak_signal: { label: 'Sinyal lemah', cls: 'bg-accent/15 text-accent' },
  signal: { label: 'Sinyal terdeteksi', cls: 'bg-bullish/15 text-bullish' },
};

const status = computed(() => (result.value ? STATUS[result.value.verdict.status] : null));

/** Progress toward the smallest bucket reaching the reporting floor. */
const progressPct = computed(() => {
  const c = result.value?.coverage;
  if (!c) return 0;
  return Math.min(100, (c.smallestBucket / c.minSamplesPerBucket) * 100);
});

const fmt = (value: number | null): string =>
  value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
</script>

<template>
  <section class="panel">
    <button
      type="button"
      class="panel-header w-full text-left transition-colors hover:bg-ink-700/30"
      @click="expanded = !expanded"
    >
      <h2 class="panel-title">Uji Sinyal</h2>
      <span class="flex items-center gap-2">
        <span v-if="status" class="chip" :class="status.cls">{{ status.label }}</span>
        <span class="text-[11px] text-slate-600">{{ expanded ? '▾' : '▸' }}</span>
      </span>
    </button>

    <div v-if="expanded" class="space-y-3 px-4 py-3">
      <p v-if="loading" class="text-center text-xs text-slate-500">Menghitung…</p>

      <template v-else-if="result">
        <p class="text-[11px] leading-relaxed text-slate-400">{{ result.verdict.detail }}</p>

        <div class="flex items-center gap-2">
          <span class="text-[10px] uppercase tracking-widest text-slate-500">Horizon</span>
          <div class="flex rounded-lg bg-ink-700 p-0.5">
            <button
              v-for="h in [1, 3, 7, 14]"
              :key="h"
              type="button"
              class="rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors"
              :class="horizon === h ? 'bg-ink-500 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
              @click="horizon = h"
            >
              {{ h }}h
            </button>
          </div>
        </div>

        <!-- Return following each sentiment bucket. -->
        <table class="tabular w-full text-[11px]">
          <thead>
            <tr class="text-slate-500">
              <th class="pb-1 text-left font-medium">Bucket</th>
              <th class="pb-1 text-right font-medium">n</th>
              <th class="pb-1 text-right font-medium">Return</th>
              <th class="pb-1 text-right font-medium">±</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="bucket in result.buckets" :key="bucket.label" class="text-slate-300">
              <td class="py-0.5 capitalize">{{ bucket.label }}</td>
              <td class="py-0.5 text-right" :class="bucket.samples < result.coverage.minSamplesPerBucket ? 'text-slate-600' : ''">
                {{ bucket.samples }}
              </td>
              <td class="py-0.5 text-right">{{ fmt(bucket.meanReturnPct) }}</td>
              <td class="py-0.5 text-right text-slate-500">
                {{ bucket.stdErrorPct === null ? '—' : bucket.stdErrorPct.toFixed(2) }}
              </td>
            </tr>
          </tbody>
        </table>

        <!-- How close the smallest bucket is to being reportable. -->
        <div v-if="result.verdict.status === 'insufficient'">
          <div class="h-1 overflow-hidden rounded-full bg-ink-600">
            <div class="h-full rounded-full bg-accent transition-all" :style="{ width: `${progressPct}%` }" />
          </div>
          <p class="mt-1 text-[10px] text-slate-600">
            Bucket terkecil {{ result.coverage.smallestBucket }} /
            {{ result.coverage.minSamplesPerBucket }} observasi ·
            {{ result.coverage.daysWithSentiment }} hari data terkumpul
          </p>
        </div>

        <p class="text-[10px] leading-relaxed text-slate-600">
          Membandingkan return harga <em>setelah</em> tiap bucket sentimen. Kolom ± adalah galat
          baku — selisih yang lebih kecil dari itu tidak dapat dibedakan dari nol.
        </p>
      </template>

      <p v-else class="text-center text-xs text-slate-500">Tidak tersedia.</p>
    </div>
  </section>
</template>
