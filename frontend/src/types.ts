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
