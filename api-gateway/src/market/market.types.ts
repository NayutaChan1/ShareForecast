export interface Candle {
  /** Seconds since epoch — the unit Lightweight Charts expects. */
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

export const SUPPORTED_INTERVALS = ['1m', '5m', '15m', '30m', '1h', '1d', '1w'] as const;

export type Interval = (typeof SUPPORTED_INTERVALS)[number];

export const isInterval = (value: string): value is Interval =>
  (SUPPORTED_INTERVALS as readonly string[]).includes(value);
