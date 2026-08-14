<script setup lang="ts">
import { formatRelativeTime, labelClass } from '../lib/format';
import type { NewsItem } from '../types';

defineProps<{
  items: NewsItem[];
  loading: boolean;
  /** Symbol the feed is filtered to, or null for everything. */
  filter: string | null;
}>();

const emit = defineEmits<{ clearFilter: [] }>();
</script>

<template>
  <section class="panel flex min-h-0 flex-col overflow-hidden">
    <div class="panel-header">
      <h2 class="panel-title">News · FinBERT</h2>
      <button
        v-if="filter"
        type="button"
        class="rounded-md bg-ink-600 px-2 py-0.5 text-[11px] text-slate-300 transition-colors hover:bg-ink-500"
        @click="emit('clearFilter')"
      >
        {{ filter }} ✕
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <p v-if="loading" class="px-4 py-6 text-center text-xs text-slate-500">Loading news…</p>

      <p v-else-if="!items.length" class="px-4 py-6 text-center text-xs text-slate-500">
        Nothing scored yet. The scraper polls every few minutes — new articles appear here
        automatically.
      </p>

      <a
        v-for="item in items"
        :key="item.id"
        :href="item.url"
        target="_blank"
        rel="noopener noreferrer"
        class="block border-b border-ink-600/50 px-4 py-3 transition-colors last:border-0 hover:bg-ink-700/40"
      >
        <div class="mb-1.5 flex items-center gap-2">
          <span class="chip" :class="labelClass(item.label)">
            {{ item.label }}
            <span class="tabular opacity-70">{{ (item.confidence * 100).toFixed(0) }}%</span>
          </span>
          <span class="truncate text-[11px] text-slate-500">{{ item.source }}</span>
          <span class="ml-auto shrink-0 text-[11px] text-slate-600">
            {{ formatRelativeTime(item.publishedAt) }}
          </span>
        </div>

        <p class="line-clamp-2 text-[13px] leading-snug text-slate-200">{{ item.title }}</p>

        <div v-if="item.symbols.length" class="mt-1.5 flex flex-wrap gap-1">
          <span
            v-for="symbol in item.symbols"
            :key="symbol"
            class="rounded bg-ink-600/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-400"
          >
            {{ symbol }}
          </span>
        </div>
      </a>
    </div>
  </section>
</template>
