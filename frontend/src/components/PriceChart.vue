<script setup lang="ts">
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';

import { api } from '../api/client';
import type { Candle, Interval, OverlayPoint } from '../types';

const props = defineProps<{
  symbol: string;
  interval: Interval;
  /** Toggles the sentiment series without refetching price data. */
  showSentiment: boolean;
}>();

const container = ref<HTMLDivElement | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const overlayCount = ref(0);

// shallowRef: these are large mutable chart objects, and making them deeply
// reactive would have Vue walk the entire internal chart state on every tick.
const chart = shallowRef<IChartApi | null>(null);
const candleSeries = shallowRef<ISeriesApi<'Candlestick'> | null>(null);
const sentimentSeries = shallowRef<ISeriesApi<'Line'> | null>(null);

let resizeObserver: ResizeObserver | null = null;

const SENTIMENT_SCALE = 'sentiment';

function buildChart(el: HTMLDivElement): void {
  const instance = createChart(el, {
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: '#94a3b8',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 11,
    },
    grid: {
      vertLines: { color: 'rgba(42, 51, 70, 0.35)' },
      horzLines: { color: 'rgba(42, 51, 70, 0.35)' },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: '#38bdf8', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#0f131c' },
      horzLine: { color: '#38bdf8', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#0f131c' },
    },
    rightPriceScale: {
      borderColor: 'rgba(42, 51, 70, 0.8)',
      scaleMargins: { top: 0.08, bottom: 0.28 },
    },
    timeScale: {
      borderColor: 'rgba(42, 51, 70, 0.8)',
      timeVisible: true,
      secondsVisible: false,
    },
    autoSize: false,
    height: el.clientHeight,
    width: el.clientWidth,
  });

  candleSeries.value = instance.addCandlestickSeries({
    upColor: '#22c55e',
    downColor: '#ef4444',
    borderUpColor: '#22c55e',
    borderDownColor: '#ef4444',
    wickUpColor: 'rgba(34, 197, 94, 0.7)',
    wickDownColor: 'rgba(239, 68, 68, 0.7)',
  });

  // The sentiment line lives on its own overlay scale pinned to the lower
  // quarter, so it reads against the candles without distorting the price axis.
  sentimentSeries.value = instance.addLineSeries({
    priceScaleId: SENTIMENT_SCALE,
    color: '#38bdf8',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerRadius: 3,
  });

  instance.priceScale(SENTIMENT_SCALE).applyOptions({
    scaleMargins: { top: 0.78, bottom: 0 },
  });

  chart.value = instance;
}

async function loadData(): Promise<void> {
  if (!candleSeries.value || !sentimentSeries.value) return;

  loading.value = true;
  error.value = null;

  try {
    // Sentiment is optional context: a symbol with no scored news yet should
    // still render its price chart, so failures there are swallowed.
    const [candles, overlay] = await Promise.all([
      api.candles(props.symbol, props.interval),
      api.overlay(props.symbol, props.interval).catch((): OverlayPoint[] => []),
    ]);

    candleSeries.value.setData(
      candles.map((c: Candle) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    overlayCount.value = overlay.reduce((sum, point) => sum + point.articles, 0);
    applyOverlay(overlay);

    chart.value?.timeScale().fitContent();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'failed to load chart data';
    candleSeries.value.setData([]);
    sentimentSeries.value.setData([]);
    overlayCount.value = 0;
  } finally {
    loading.value = false;
  }
}

function applyOverlay(points: OverlayPoint[]): void {
  if (!sentimentSeries.value) return;

  sentimentSeries.value.setData(
    props.showSentiment
      ? points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
      : [],
  );

  // Flag the buckets that actually moved: a marker per candle would bury the
  // price action under icons.
  candleSeries.value?.setMarkers(
    props.showSentiment
      ? points
          .filter((p) => p.label !== 'neutral')
          .map((p) => ({
            time: p.time as UTCTimestamp,
            position: p.label === 'bullish' ? ('belowBar' as const) : ('aboveBar' as const),
            color: p.label === 'bullish' ? '#22c55e' : '#ef4444',
            shape: p.label === 'bullish' ? ('arrowUp' as const) : ('arrowDown' as const),
            text: `${p.articles}`,
          }))
      : [],
  );
}

onMounted(() => {
  if (!container.value) return;
  buildChart(container.value);

  resizeObserver = new ResizeObserver(([entry]) => {
    chart.value?.resize(entry.contentRect.width, entry.contentRect.height);
  });
  resizeObserver.observe(container.value);

  void loadData();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart.value?.remove();
  chart.value = null;
});

watch(() => [props.symbol, props.interval], () => void loadData());

// Toggling the overlay only needs the series redrawn, not a round trip.
watch(
  () => props.showSentiment,
  () => void loadData(),
);
</script>

<template>
  <div class="relative h-full w-full">
    <div ref="container" class="h-full w-full" />

    <div
      v-if="loading"
      class="pointer-events-none absolute inset-0 grid place-items-center bg-ink-800/50 backdrop-blur-sm"
    >
      <div class="flex items-center gap-2 text-xs text-slate-400">
        <span class="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        Loading market data…
      </div>
    </div>

    <div
      v-else-if="error"
      class="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center"
    >
      <p class="max-w-sm text-xs text-bearish">{{ error }}</p>
    </div>

    <p
      v-else-if="showSentiment && overlayCount === 0"
      class="pointer-events-none absolute bottom-3 left-3 text-[11px] text-slate-500"
    >
      No scored news for this asset yet — the overlay fills in as the scraper runs.
    </p>
  </div>
</template>
