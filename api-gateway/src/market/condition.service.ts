import { Injectable } from '@nestjs/common';

import { AssetsService } from '../assets/assets.service';
import { AssetCondition, Metric } from './condition.types';
import { Candle } from './market.types';
import { MarketService } from './market.service';

/** Daily candles pulled per request. Enough for SMA50 and a ~6-month range. */
const LOOKBACK = 200;

/** Below this, several indicators are not meaningful and are returned as null. */
const MIN_CANDLES = 50;

const RSI_PERIOD = 14;

/**
 * Crypto trades every day; equities roughly 252 sessions a year. Using the
 * wrong one misstates annualised volatility by about 20%.
 */
const periodsPerYear = (type: 'crypto' | 'stock'): number => (type === 'crypto' ? 365 : 252);

const sma = (values: number[], period: number): number | null =>
  values.length < period ? null : values.slice(-period).reduce((sum, v) => sum + v, 0) / period;

/** Wilder smoothing — the definition the indicator is actually specified with. */
function rsi(closes: number[], period = RSI_PERIOD): number | null {
  if (closes.length < period + 1) return null;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }
  gain /= period;
  loss /= period;

  for (let i = period + 1; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(delta, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-delta, 0)) / period;
  }

  // A run with no losses is defined as 100 rather than a division by zero.
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

/** Annualised standard deviation of daily log returns, in percent. */
function volatility(closes: number[], type: 'crypto' | 'stock'): number | null {
  if (closes.length < 30) return null;

  const window = closes.slice(-31);
  const returns: number[] = [];
  for (let i = 1; i < window.length; i += 1) {
    if (window[i - 1] > 0) returns.push(Math.log(window[i] / window[i - 1]));
  }
  if (returns.length < 20) return null;

  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);

  return Math.sqrt(variance) * Math.sqrt(periodsPerYear(type)) * 100;
}

const pctChange = (from: number, to: number): number | null =>
  from > 0 ? ((to - from) / from) * 100 : null;

const round = (value: number | null, digits = 2): number | null =>
  value === null ? null : Number(value.toFixed(digits));

@Injectable()
export class ConditionService {
  constructor(
    private readonly assets: AssetsService,
    private readonly market: MarketService,
  ) {}

  async getCondition(symbol: string): Promise<AssetCondition> {
    const asset = await this.assets.findBySymbol(symbol);
    const candles = await this.market.getCandles(asset.symbol, '1d', LOOKBACK);

    const closes = candles.map((c: Candle) => c.close);
    const volumes = candles.map((c: Candle) => c.volume);
    const last = closes[closes.length - 1] ?? 0;

    const ma20 = sma(closes, 20);
    const ma50 = sma(closes, 50);
    const windowHigh = closes.length ? Math.max(...closes) : null;
    const windowLow = closes.length ? Math.min(...closes) : null;

    const position =
      windowHigh !== null && windowLow !== null && windowHigh > windowLow
        ? ((last - windowLow) / (windowHigh - windowLow)) * 100
        : null;
    const drawdown = windowHigh ? ((last - windowHigh) / windowHigh) * 100 : null;

    const return7 = closes.length > 7 ? pctChange(closes[closes.length - 8], last) : null;
    const return30 = closes.length > 30 ? pctChange(closes[closes.length - 31], last) : null;

    return {
      symbol: asset.symbol,
      type: asset.type,
      asOf: candles[candles.length - 1]?.time ?? 0,
      basis: {
        candles: candles.length,
        interval: '1d',
        sufficient: candles.length >= MIN_CANDLES,
      },
      price: {
        last,
        changePct: closes.length > 1 ? round(pctChange(closes[closes.length - 2], last)) : null,
      },
      trend: {
        sma20: this.compare(last, ma20, '20 hari'),
        sma50: this.compare(last, ma50, '50 hari'),
        structure: this.structure(ma20, ma50),
      },
      momentum: {
        rsi14: this.rsiReading(rsi(closes)),
        return7: this.returnReading(return7, '7 hari'),
        return30: this.returnReading(return30, '30 hari'),
      },
      volatility: { annualisedPct: this.volatilityReading(volatility(closes, asset.type), asset.type) },
      range: {
        high: round(windowHigh),
        low: round(windowLow),
        positionPct: this.positionReading(position),
        drawdownPct: {
          value: round(drawdown),
          reading:
            drawdown === null
              ? 'data tidak cukup'
              : drawdown > -1
                ? 'di puncak periode'
                : `${Math.abs(drawdown).toFixed(1)}% di bawah puncak periode`,
        },
      },
      volume: { trend: this.volumeReading(volumes) },
    };
  }

  private compare(last: number, average: number | null, label: string): Metric {
    if (average === null) return { value: null, reading: `butuh lebih banyak data (${label})` };
    const gap = ((last - average) / average) * 100;
    return {
      value: round(average),
      reading: `${gap >= 0 ? 'di atas' : 'di bawah'} rata-rata ${label} (${gap >= 0 ? '+' : ''}${gap.toFixed(1)}%)`,
    };
  }

  private structure(ma20: number | null, ma50: number | null): Metric<string> {
    if (ma20 === null || ma50 === null) {
      return { value: null, reading: 'butuh 50 hari data' };
    }
    if (ma20 > ma50) return { value: 'naik', reading: 'rata-rata pendek di atas panjang' };
    if (ma20 < ma50) return { value: 'turun', reading: 'rata-rata pendek di bawah panjang' };
    return { value: 'datar', reading: 'kedua rata-rata berimpit' };
  }

  private rsiReading(value: number | null): Metric {
    if (value === null) return { value: null, reading: 'butuh 15 hari data' };
    // The conventional 30/70 thresholds. They describe how stretched the recent
    // move is, not what happens next.
    const reading =
      value >= 70
        ? 'kenaikan terakhir sudah panjang'
        : value <= 30
          ? 'penurunan terakhir sudah dalam'
          : 'di rentang netral';
    return { value: round(value, 1), reading };
  }

  private returnReading(value: number | null, label: string): Metric {
    if (value === null) return { value: null, reading: `butuh ${label} data` };
    return {
      value: round(value),
      reading: `${value >= 0 ? '+' : ''}${value.toFixed(1)}% dalam ${label}`,
    };
  }

  private volatilityReading(value: number | null, type: 'crypto' | 'stock'): Metric {
    if (value === null) return { value: null, reading: 'butuh 30 hari data' };
    // Typical annualised ranges differ by asset class, so the same number is
    // calm for crypto and wild for a blue chip.
    const high = type === 'crypto' ? 80 : 40;
    const low = type === 'crypto' ? 40 : 15;
    const band = value >= high ? 'tinggi' : value <= low ? 'tenang' : 'sedang';
    return {
      value: round(value, 1),
      reading: `${band} untuk ${type === 'crypto' ? 'kripto' : 'saham'}`,
    };
  }

  private positionReading(value: number | null): Metric {
    if (value === null) return { value: null, reading: 'data tidak cukup' };
    const reading =
      value >= 80 ? 'dekat puncak rentang' : value <= 20 ? 'dekat dasar rentang' : 'di tengah rentang';
    return { value: round(value, 1), reading };
  }

  private volumeReading(volumes: number[]): Metric<string> {
    if (volumes.length < 30) return { value: null, reading: 'butuh 30 hari data' };

    const recent = volumes.slice(-5).reduce((s, v) => s + v, 0) / 5;
    const baseline = volumes.slice(-30).reduce((s, v) => s + v, 0) / 30;
    if (baseline === 0) return { value: null, reading: 'volume tidak dilaporkan' };

    const ratio = recent / baseline;
    const label = ratio >= 1.3 ? 'naik' : ratio <= 0.7 ? 'turun' : 'normal';
    return { value: label, reading: `${ratio.toFixed(1)}× rata-rata 30 hari` };
  }
}
