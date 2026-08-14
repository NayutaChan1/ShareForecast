import type {
  Asset,
  Candle,
  Interval,
  NewsItem,
  OverlayPoint,
  Quote,
  SentimentSummary,
} from '../types';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}/api${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    // Nest error bodies carry a `message`; fall back to the status text.
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(body?.message ?? response.statusText, response.status);
  }
  return (await response.json()) as T;
}

export const api = {
  assets: () => get<Asset[]>('/assets'),

  quotes: () => get<Quote[]>('/market/quotes'),

  quote: (symbol: string) => get<Quote>(`/market/${encodeURIComponent(symbol)}/quote`),

  candles: (symbol: string, interval: Interval, limit = 400) =>
    get<Candle[]>(`/market/${encodeURIComponent(symbol)}/candles`, { interval, limit }),

  overlay: (symbol: string, interval: Interval, limit = 400) =>
    get<OverlayPoint[]>(`/sentiment/${encodeURIComponent(symbol)}/overlay`, { interval, limit }),

  news: (symbol?: string, limit = 40) =>
    get<NewsItem[]>('/sentiment/news', symbol ? { symbol, limit } : { limit }),

  summary: (symbol?: string, hours = 24) =>
    get<SentimentSummary>('/sentiment/summary', symbol ? { symbol, hours } : { hours }),
};
