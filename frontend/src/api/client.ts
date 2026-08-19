import type {
  Asset,
  CreatedAsset,
  NewAsset,
  Candle,
  Interval,
  NewsItem,
  OverlayPoint,
  Quote,
  SentimentSummary,
} from '../types';

// Empty means same-origin: in production Caddy serves this app and proxies
// /api to the gateway under one domain, so requests stay relative and no CORS
// negotiation happens at all. In dev it points at the gateway's own port.
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
  // The second argument is what lets a relative BASE_URL resolve; it is
  // ignored when BASE_URL is already absolute.
  const url = new URL(`${BASE_URL}/api${path}`, window.location.origin);
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

async function send<T>(method: 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const response = await fetch(new URL(`${BASE_URL}/api${path}`, window.location.origin), {
    method,
    headers: body ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
    // Nest's ValidationPipe returns an array of messages; show them all.
    const message = Array.isArray(payload?.message)
      ? payload!.message.join('; ')
      : (payload?.message ?? response.statusText);
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}

export const api = {
  assets: () => get<Asset[]>('/assets'),

  createAsset: (payload: NewAsset) => send<CreatedAsset>('POST', '/assets', payload),

  deleteAsset: (symbol: string) =>
    send<{ symbol: string; deleted: true }>('DELETE', `/assets/${encodeURIComponent(symbol)}`),

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
