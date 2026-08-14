import type { SentimentLabel } from '../types';

/** Crypto trades in fractions of a cent; equities do not. Scale precision. */
export function formatPrice(value: number): string {
  const digits = value >= 1000 ? 2 : value >= 1 ? 2 : 6;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function formatRelativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

const LABEL_CLASSES: Record<SentimentLabel, string> = {
  bullish: 'bg-bullish/15 text-bullish',
  bearish: 'bg-bearish/15 text-bearish',
  neutral: 'bg-flat/15 text-slate-400',
};

export const labelClass = (label: SentimentLabel): string => LABEL_CLASSES[label];

export const changeClass = (value: number): string =>
  value > 0 ? 'text-bullish' : value < 0 ? 'text-bearish' : 'text-slate-400';
