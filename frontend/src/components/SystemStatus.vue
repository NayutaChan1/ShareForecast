<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

import { api } from '../api/client';
import type { HealthReport } from '../types';

/** The pipeline moves on a minutes scale, so polling faster buys nothing. */
const POLL_MS = 60_000;

const health = ref<HealthReport | null>(null);
const unreachable = ref(false);
const open = ref(false);
let timer: number | null = null;

async function load(): Promise<void> {
  try {
    health.value = await api.health();
    unreachable.value = false;
  } catch {
    // Distinct from `degraded`: the gateway itself did not answer.
    unreachable.value = true;
  }
}

onMounted(() => {
  void load();
  timer = window.setInterval(() => void load(), POLL_MS);
});
onUnmounted(() => {
  if (timer !== null) window.clearInterval(timer);
});

const state = computed(() => {
  if (unreachable.value) return { label: 'Tidak terjangkau', cls: 'text-bearish', dot: 'bg-bearish' };
  if (!health.value) return { label: 'Memeriksa…', cls: 'text-slate-500', dot: 'bg-slate-600' };
  if (health.value.status === 'degraded') {
    return { label: 'Perlu dicek', cls: 'text-bearish', dot: 'bg-bearish animate-pulse' };
  }
  return { label: 'Sehat', cls: 'text-bullish', dot: 'bg-bullish' };
});

/** How long since the last article landed — the number that exposes a stalled scraper. */
const age = computed(() => {
  const minutes = health.value?.freshness.articleAgeMinutes;
  if (minutes === null || minutes === undefined) return null;
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}j`;
  return `${Math.floor(minutes / 1440)}h`;
});

const deps = computed(() => {
  const d = health.value?.dependencies;
  if (!d) return [];
  return [
    { name: 'PostgreSQL', ok: d.postgres },
    { name: 'Redis', ok: d.redis },
    { name: 'RabbitMQ', ok: d.rabbitmq },
  ];
});
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] transition-colors hover:bg-ink-700"
      :class="state.cls"
      :title="`Status sistem: ${state.label}`"
      @click="open = !open"
    >
      <span class="h-1.5 w-1.5 rounded-full" :class="state.dot" />
      <span>{{ state.label }}</span>
      <span v-if="age" class="text-slate-500">· {{ age }}</span>
    </button>

    <!-- Detail on demand; the header stays quiet until something is wrong. -->
    <div
      v-if="open"
      class="panel absolute right-0 top-full z-50 mt-2 w-72 px-4 py-3 shadow-xl"
      @click.stop
    >
      <p v-if="unreachable" class="text-[11px] text-bearish">
        API gateway tidak menjawab. Stack mungkin sedang mati.
      </p>

      <template v-else-if="health">
        <div class="space-y-1.5">
          <div
            v-for="dep in deps"
            :key="dep.name"
            class="flex items-center justify-between text-[11px]"
          >
            <span class="text-slate-400">{{ dep.name }}</span>
            <span :class="dep.ok ? 'text-bullish' : 'text-bearish'">
              {{ dep.ok ? 'terhubung' : 'terputus' }}
            </span>
          </div>
        </div>

        <div class="mt-3 space-y-1.5 border-t border-ink-600/70 pt-3">
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-slate-400">Pass scraper terakhir</span>
            <span :class="health.freshness.stale ? 'text-bearish' : 'text-slate-300'">
              {{ health.freshness.scrapeAgeMinutes === null ? 'belum ada' : health.freshness.scrapeAgeMinutes + 'm' }}
              <span class="text-slate-600">/ ambang {{ health.freshness.staleAfterMinutes }}m</span>
            </span>
          </div>
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-slate-400">Artikel terakhir</span>
            <span class="text-slate-300">{{ age ?? 'belum ada' }}</span>
          </div>
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-slate-400">Menunggu diskor</span>
            <span class="text-slate-300">{{ health.freshness.pendingAnalysis ?? '—' }}</span>
          </div>
        </div>

        <ul v-if="health.issues.length" class="mt-3 space-y-1 border-t border-ink-600/70 pt-3">
          <li
            v-for="issue in health.issues"
            :key="issue"
            class="text-[11px] leading-relaxed text-bearish"
          >
            {{ issue }}
          </li>
        </ul>
        <p v-else class="mt-3 border-t border-ink-600/70 pt-3 text-[10px] text-slate-600">
          Scraper berjalan tiap {{ health.freshness.expectedIntervalMinutes }} menit. Status dinilai
          dari <em>pass</em> yang selesai, bukan dari artikel baru — siklus berita yang sepi bukan
          gangguan.
        </p>
      </template>
    </div>
  </div>
</template>
