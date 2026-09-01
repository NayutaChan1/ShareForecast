<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import AddAssetDialog from './components/AddAssetDialog.vue';
import AssetSidebar from './components/AssetSidebar.vue';
import ConditionPanel from './components/ConditionPanel.vue';
import KeywordEditorDialog from './components/KeywordEditorDialog.vue';
import NewsFeed from './components/NewsFeed.vue';
import PriceChart from './components/PriceChart.vue';
import SentimentGauge from './components/SentimentGauge.vue';
import SignalValidationPanel from './components/SignalValidationPanel.vue';
import SystemStatus from './components/SystemStatus.vue';
import { api } from './api/client';
import { useSocket } from './composables/useSocket';
import { changeClass, formatPercent, formatPrice } from './lib/format';
import { INTERVALS, type Asset, type Interval, type NewsItem, type Quote, type SentimentSummary } from './types';

const assets = ref<Asset[]>([]);
const quotes = ref<Record<string, Quote>>({});
const news = ref<NewsItem[]>([]);
const summary = ref<SentimentSummary | null>(null);

const selected = ref<string>('BTCUSDT');
const interval = ref<Interval>('1h');
const showSentiment = ref(true);
const filterNewsToAsset = ref(true);

const loadingNews = ref(true);
const bootError = ref<string | null>(null);
const showAddDialog = ref(false);
const editingAsset = ref<Asset | null>(null);
const notice = ref<string | null>(null);

const { connected, subscribeSymbol, onQuote, onSentiment } = useSocket();

const selectedAsset = computed(() => assets.value.find((a) => a.symbol === selected.value) ?? null);
const selectedQuote = computed(() => quotes.value[selected.value] ?? null);
const newsFilter = computed(() => (filterNewsToAsset.value ? selected.value : null));

let unsubscribe: (() => void) | null = null;

async function reloadAssets(): Promise<void> {
  assets.value = await api.assets();
}

function flash(message: string): void {
  notice.value = message;
  window.setTimeout(() => (notice.value = null), 4000);
}

async function onAssetCreated(symbol: string, taggedArticles: number): Promise<void> {
  showAddDialog.value = false;
  await reloadAssets();
  selected.value = symbol;
  flash(
    taggedArticles > 0
      ? `${symbol} ditambahkan — ${taggedArticles} artikel arsip langsung dicocokkan.`
      : `${symbol} ditambahkan. Belum ada artikel arsip yang cocok; sentimen muncul setelah scraper berjalan.`,
  );

  // Seed its quote so the sidebar is not blank until the next poll tick.
  try {
    const quote = await api.quote(symbol);
    quotes.value[symbol] = quote;
  } catch {
    /* the price poller will fill it in shortly */
  }
}

async function onAssetRemoved(symbol: string): Promise<void> {
  try {
    await api.deleteAsset(symbol);
  } catch (err) {
    flash(err instanceof Error ? err.message : `gagal menghapus ${symbol}`);
    return;
  }

  delete quotes.value[symbol];
  await reloadAssets();

  // The chart is pointed at a symbol that no longer exists; move off it.
  if (selected.value === symbol) {
    selected.value = assets.value[0]?.symbol ?? '';
  }
  flash(`${symbol} dihapus dari watchlist.`);
}

async function onKeywordsSaved(symbol: string, taggedArticles: number): Promise<void> {
  editingAsset.value = null;
  flash(`Kata kunci ${symbol} disimpan — ${taggedArticles} artikel arsip cocok sekarang.`);
  // The overlay and news panel are keyword-derived, so refresh what is on screen.
  if (selected.value === symbol) await loadSidePanels();
}

async function loadSidePanels(): Promise<void> {
  loadingNews.value = true;
  const symbol = newsFilter.value ?? undefined;
  try {
    const [items, stats] = await Promise.all([api.news(symbol), api.summary(symbol)]);
    news.value = items;
    summary.value = stats;
  } catch {
    // A missing news panel should not blank the chart; leave the last data up.
    news.value = [];
    summary.value = null;
  } finally {
    loadingNews.value = false;
  }
}

onMounted(async () => {
  try {
    await reloadAssets();
    if (assets.value.length && !assets.value.some((a) => a.symbol === selected.value)) {
      selected.value = assets.value[0].symbol;
    }
  } catch (err) {
    bootError.value =
      err instanceof Error
        ? `Cannot reach the API gateway (${err.message}). Is the stack running?`
        : 'Cannot reach the API gateway.';
    return;
  }

  // Seed the sidebar immediately; the socket keeps it fresh after this.
  try {
    for (const quote of await api.quotes()) quotes.value[quote.symbol] = quote;
  } catch {
    /* quotes stream in over the socket regardless */
  }

  onQuote((quote) => {
    quotes.value[quote.symbol] = quote;
  });

  onSentiment((payload) => {
    // Only refresh when the new article is relevant to what's on screen.
    const relevant = !newsFilter.value || payload.symbols.includes(newsFilter.value);
    if (relevant) void loadSidePanels();
  });

  void loadSidePanels();
});

watch(
  selected,
  (symbol) => {
    unsubscribe?.();
    unsubscribe = subscribeSymbol(symbol);
  },
  { immediate: true },
);

watch([selected, filterNewsToAsset], () => void loadSidePanels());
</script>

<template>
  <div class="flex h-full flex-col bg-ink-900">
    <!-- ── Top bar ─────────────────────────────────────────── -->
    <header class="flex shrink-0 items-center gap-4 border-b border-ink-600/70 bg-ink-800/60 px-5 py-3">
      <h1 class="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-100">
        <span class="grid h-6 w-6 place-items-center rounded bg-accent/15 text-accent">◪</span>
        Market Sentiment Tracker
      </h1>

      <div v-if="selectedAsset" class="ml-2 flex items-baseline gap-3 border-l border-ink-600 pl-4">
        <span class="text-sm font-semibold text-slate-100">{{ selectedAsset.symbol }}</span>
        <template v-if="selectedQuote">
          <span class="tabular text-sm text-slate-300">{{ formatPrice(selectedQuote.price) }}</span>
          <span class="tabular text-xs font-medium" :class="changeClass(selectedQuote.changePercent)">
            {{ formatPercent(selectedQuote.changePercent) }}
          </span>
        </template>
      </div>

      <div class="ml-auto flex items-center gap-3">
        <div class="flex rounded-lg bg-ink-700 p-0.5">
          <button
            v-for="value in INTERVALS"
            :key="value"
            type="button"
            class="rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors"
            :class="
              interval === value ? 'bg-ink-500 text-slate-100' : 'text-slate-400 hover:text-slate-200'
            "
            @click="interval = value"
          >
            {{ value }}
          </button>
        </div>

        <label class="flex cursor-pointer select-none items-center gap-2 text-[11px] text-slate-400">
          <input
            v-model="showSentiment"
            type="checkbox"
            class="h-3.5 w-3.5 rounded border-ink-500 bg-ink-700 text-accent focus:ring-0 focus:ring-offset-0"
          />
          Sentiment overlay
        </label>

        <span
          class="flex items-center gap-1.5 text-[11px]"
          :class="connected ? 'text-bullish' : 'text-slate-500'"
          :title="connected ? 'WebSocket connected' : 'WebSocket disconnected'"
        >
          <span
            class="h-1.5 w-1.5 rounded-full"
            :class="connected ? 'animate-pulse bg-bullish' : 'bg-slate-600'"
          />
          {{ connected ? 'Live' : 'Offline' }}
        </span>

        <!-- WebSocket liveness above is not the same as the pipeline still
             producing data; this reports the latter. -->
        <SystemStatus />
      </div>
    </header>

    <!-- ── Boot failure ────────────────────────────────────── -->
    <div v-if="bootError" class="grid flex-1 place-items-center px-6">
      <div class="panel max-w-md px-6 py-5 text-center">
        <p class="mb-1 text-sm font-semibold text-bearish">Connection failed</p>
        <p class="text-xs leading-relaxed text-slate-400">{{ bootError }}</p>
        <code class="mt-3 block rounded bg-ink-900 px-3 py-2 text-[11px] text-slate-500">
          docker compose up -d
        </code>
      </div>
    </div>

    <!-- ── Workspace ───────────────────────────────────────── -->
    <main v-else class="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(200px,240px)_1fr_minmax(280px,340px)]">
      <AssetSidebar
        :assets="assets"
        :quotes="quotes"
        :selected="selected"
        class="hidden lg:flex"
        @select="selected = $event"
        @add="showAddDialog = true"
        @remove="onAssetRemoved"
        @edit-keywords="editingAsset = $event"
      />

      <div class="grid min-h-0 grid-rows-[1fr_auto] gap-3">
        <section class="panel min-h-[280px] overflow-hidden p-1">
          <PriceChart
            :key="`${selected}-${interval}`"
            :symbol="selected"
            :interval="interval"
            :show-sentiment="showSentiment"
          />
        </section>

        <ConditionPanel v-if="selected" :symbol="selected" />
      </div>

      <div class="grid min-h-0 grid-rows-[auto_auto_1fr] gap-3">
        <SentimentGauge :summary="summary" />
        <SignalValidationPanel :symbol="newsFilter" />
        <NewsFeed
          :items="news"
          :loading="loadingNews"
          :filter="newsFilter"
          @clear-filter="filterNewsToAsset = false"
        />
      </div>
    </main>

    <AddAssetDialog
      v-if="showAddDialog"
      @close="showAddDialog = false"
      @created="onAssetCreated"
    />

    <KeywordEditorDialog
      v-if="editingAsset"
      :asset="editingAsset"
      @close="editingAsset = null"
      @saved="onKeywordsSaved"
    />

    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-300"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <p
        v-if="notice"
        class="panel fixed bottom-4 left-1/2 z-40 -translate-x-1/2 px-4 py-2 text-xs text-slate-200 shadow-lg"
      >
        {{ notice }}
      </p>
    </Transition>
  </div>
</template>
