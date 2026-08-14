<script setup lang="ts">
import { computed } from 'vue';

import type { SentimentSummary } from '../types';

const props = defineProps<{ summary: SentimentSummary | null }>();

const total = computed(() => props.summary?.total ?? 0);

const share = (count: number): number => (total.value ? (count / total.value) * 100 : 0);

const bars = computed(() => {
  const s = props.summary;
  return [
    { label: 'Bullish', count: s?.bullish ?? 0, color: 'bg-bullish', text: 'text-bullish' },
    { label: 'Neutral', count: s?.neutral ?? 0, color: 'bg-flat', text: 'text-slate-400' },
    { label: 'Bearish', count: s?.bearish ?? 0, color: 'bg-bearish', text: 'text-bearish' },
  ];
});

const score = computed(() => props.summary?.score ?? 0);

// Map the signed score in [-1, 1] onto the needle's 0..100% track.
const needleOffset = computed(() => `${((score.value + 1) / 2) * 100}%`);

const verdict = computed(() => {
  if (!total.value) return { text: 'No data', class: 'text-slate-500' };
  if (score.value > 0.15) return { text: 'Bullish', class: 'text-bullish' };
  if (score.value < -0.15) return { text: 'Bearish', class: 'text-bearish' };
  return { text: 'Neutral', class: 'text-slate-400' };
});
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <h2 class="panel-title">Sentiment · 24h</h2>
      <span class="text-[11px] text-slate-500">{{ total }} articles</span>
    </div>

    <div class="space-y-4 px-4 py-4">
      <div class="flex items-baseline justify-between">
        <span class="tabular text-2xl font-semibold" :class="verdict.class">
          {{ score >= 0 ? '+' : '' }}{{ score.toFixed(2) }}
        </span>
        <span class="text-xs font-semibold uppercase tracking-wider" :class="verdict.class">
          {{ verdict.text }}
        </span>
      </div>

      <!-- Bearish -> bullish track with a needle at the current mean score. -->
      <div class="relative">
        <div class="h-1.5 rounded-full bg-gradient-to-r from-bearish via-flat to-bullish opacity-70" />
        <div
          class="absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-100 shadow"
          :style="{ left: needleOffset }"
        />
        <div class="mt-1.5 flex justify-between text-[10px] text-slate-600">
          <span>-1.0</span>
          <span>0</span>
          <span>+1.0</span>
        </div>
      </div>

      <div class="space-y-2">
        <div v-for="bar in bars" :key="bar.label" class="flex items-center gap-3">
          <span class="w-14 shrink-0 text-[11px] text-slate-400">{{ bar.label }}</span>
          <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-600">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="bar.color"
              :style="{ width: `${share(bar.count)}%` }"
            />
          </div>
          <span class="tabular w-8 shrink-0 text-right text-[11px]" :class="bar.text">
            {{ bar.count }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
