export interface Asset {
  id: number;
  symbol: string;
  name: string;
  type: 'crypto' | 'stock';
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  symbol: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  time: number;
}

export type SentimentLabel = 'bullish' | 'bearish' | 'neutral';

export interface OverlayPoint {
  time: number;
  value: number;
  label: SentimentLabel;
  articles: number;
}

export interface NewsItem {
  id: number;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  label: SentimentLabel;
  confidence: number;
  score: number;
  symbols: string[];
}

export interface SentimentSummary {
  symbol: string | null;
  total: number;
  bullish: number;
  bearish: number;
  neutral: number;
  score: number;
}

/** Payload pushed by the gateway when the worker scores an article. */
export interface LiveSentiment {
  article_id: number;
  title: string;
  url: string;
  source: string;
  published_at: string;
  symbols: string[];
  sentiment: {
    label: SentimentLabel;
    confidence: number;
    positive: number;
    negative: number;
    neutral: number;
    score: number;
  };
}

export const INTERVALS = ['15m', '1h', '1d', '1w'] as const;
export type Interval = (typeof INTERVALS)[number];

/** Payload for creating a watchlist asset. */
export interface NewAsset {
  symbol: string;
  name: string;
  type: 'crypto' | 'stock';
  keywords: string[];
}

/** What the API returns after creating an asset. */
export interface CreatedAsset extends Asset {
  keywords: string[];
  /** Archived articles matched to it on creation. */
  taggedArticles: number;
}

/** An asset together with the keywords used to match news to it. */
export interface AssetWithKeywords extends Asset {
  keywords: string[];
}

/** One measured indicator plus a plain-language reading of it. */
export interface Metric<T = number> {
  value: T | null;
  reading: string;
}

export interface AssetCondition {
  symbol: string;
  type: 'crypto' | 'stock';
  asOf: number;
  basis: { candles: number; interval: string; sufficient: boolean };
  price: { last: number; changePct: number | null };
  trend: { sma20: Metric; sma50: Metric; structure: Metric<string> };
  momentum: { rsi14: Metric; return7: Metric; return30: Metric };
  volatility: { annualisedPct: Metric };
  range: {
    high: number | null;
    low: number | null;
    positionPct: Metric;
    drawdownPct: Metric;
  };
  volume: { trend: Metric<string> };
}

export type SentimentBucketLabel = 'bullish' | 'bearish' | 'neutral';
export type ValidationStatus = 'insufficient' | 'no_signal' | 'weak_signal' | 'signal';

export interface BucketResult {
  label: SentimentBucketLabel;
  samples: number;
  meanReturnPct: number | null;
  stdDevPct: number | null;
  stdErrorPct: number | null;
}

export interface SignalValidation {
  symbol: string | null;
  horizonDays: number;
  generatedAt: number;
  observations: number;
  buckets: BucketResult[];
  spreadPct: number | null;
  spreadErrorPct: number | null;
  verdict: { status: ValidationStatus; detail: string };
  coverage: {
    daysWithSentiment: number;
    minSamplesPerBucket: number;
    smallestBucket: number;
  };
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  dependencies: { postgres: boolean; redis: boolean; rabbitmq: boolean };
  freshness: {
    lastArticleAt: number | null;
    articleAgeMinutes: number | null;
    lastScoreAt: number | null;
    pendingAnalysis: number | null;
    lastScrapeRunAt: number | null;
    scrapeAgeMinutes: number | null;
    expectedIntervalMinutes: number;
    staleAfterMinutes: number;
    stale: boolean;
  };
  issues: string[];
  uptime: number;
}
