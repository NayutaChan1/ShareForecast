import { Injectable, Logger } from '@nestjs/common';

import { AssetsService } from '../assets/assets.service';
import { DatabaseService } from '../database/database.service';
import { MarketService } from '../market/market.service';
import {
  BucketResult,
  SentimentBucket,
  SignalValidation,
  ValidationStatus,
} from './validation.types';

/** Daily candles fetched per asset to line sentiment up against prices. */
const CANDLE_LOOKBACK = 200;

/**
 * Below this many observations in the smallest bucket, no comparison is worth
 * reporting. Twenty is already generous for a claim about returns — it is set
 * here as the floor for saying anything at all, not as a threshold for
 * confidence.
 */
const MIN_SAMPLES_PER_BUCKET = 20;

/** Same neutral band the overlay uses, so both read the archive identically. */
const NEUTRAL_BAND = 0.15;

interface DailySentiment {
  asset_id: number;
  symbol: string;
  day: Date;
  score: string;
  articles: string;
}

const mean = (values: number[]): number =>
  values.reduce((sum, v) => sum + v, 0) / values.length;

const stdDev = (values: number[], average: number): number =>
  values.length < 2
    ? 0
    : Math.sqrt(values.reduce((s, v) => s + (v - average) ** 2, 0) / (values.length - 1));

const round = (value: number | null, digits = 3): number | null =>
  value === null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));

/** Local calendar date key, so a candle timestamp and a publish date align. */
const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly assets: AssetsService,
    private readonly market: MarketService,
  ) {}

  /**
   * Measure whether a day's sentiment says anything about the price move that
   * follows it.
   *
   * Method: bucket each (asset, day) by its mean sentiment, then compare the
   * forward return across buckets. If bullish days are followed by materially
   * better returns than bearish days, the signal carries information; if the
   * gap is inside the noise, it does not — and that is the more likely result
   * worth being able to see.
   */
  async validate(symbol: string | undefined, horizonDays: number): Promise<SignalValidation> {
    const assetId = symbol ? (await this.assets.findBySymbol(symbol)).id : null;

    const rows = await this.db.query<DailySentiment>(
      `SELECT aa.asset_id,
              a.symbol,
              date_trunc('day', n.published_at)::date AS day,
              avg(s.positive - s.negative)            AS score,
              count(*)                                AS articles
         FROM news_articles  n
         JOIN sentiment_scores s ON s.article_id = n.id
         JOIN article_assets  aa ON aa.article_id = n.id
         JOIN assets          a  ON a.id = aa.asset_id
        WHERE ($1::int IS NULL OR aa.asset_id = $1::int)
        GROUP BY aa.asset_id, a.symbol, day
        ORDER BY day`,
      [assetId],
    );

    const closesBySymbol = await this.loadCloses([...new Set(rows.map((r) => r.symbol))]);

    const returnsByBucket: Record<SentimentBucket, number[]> = {
      bullish: [],
      bearish: [],
      neutral: [],
    };

    for (const row of rows) {
      const series = closesBySymbol.get(row.symbol);
      if (!series) continue;

      const forward = this.forwardReturn(series, dayKey(row.day), horizonDays);
      if (forward === null) continue;

      returnsByBucket[this.bucket(Number(row.score))].push(forward);
    }

    const buckets = (['bullish', 'neutral', 'bearish'] as const).map((label) =>
      this.summarise(label, returnsByBucket[label]),
    );

    const bullish = buckets.find((b) => b.label === 'bullish')!;
    const bearish = buckets.find((b) => b.label === 'bearish')!;

    const spread =
      bullish.meanReturnPct !== null && bearish.meanReturnPct !== null
        ? bullish.meanReturnPct - bearish.meanReturnPct
        : null;

    // Errors of two independent means add in quadrature.
    const spreadError =
      bullish.stdErrorPct !== null && bearish.stdErrorPct !== null
        ? Math.sqrt(bullish.stdErrorPct ** 2 + bearish.stdErrorPct ** 2)
        : null;

    const smallestBucket = Math.min(...buckets.map((b) => b.samples));
    const observations = buckets.reduce((sum, b) => sum + b.samples, 0);

    return {
      symbol: symbol ? symbol.toUpperCase() : null,
      horizonDays,
      generatedAt: Math.floor(Date.now() / 1000),
      observations,
      buckets,
      spreadPct: round(spread, 3),
      spreadErrorPct: round(spreadError, 3),
      verdict: this.verdict(smallestBucket, spread, spreadError),
      coverage: {
        daysWithSentiment: new Set(rows.map((r) => dayKey(r.day))).size,
        minSamplesPerBucket: MIN_SAMPLES_PER_BUCKET,
        smallestBucket: Number.isFinite(smallestBucket) ? smallestBucket : 0,
      },
    };
  }

  private bucket(score: number): SentimentBucket {
    if (score > NEUTRAL_BAND) return 'bullish';
    if (score < -NEUTRAL_BAND) return 'bearish';
    return 'neutral';
  }

  /**
   * Return over `horizon` *trading* rows, not calendar days.
   *
   * Equities do not trade on weekends and holidays, so stepping forward by
   * calendar date would silently drop or misalign observations.
   */
  private forwardReturn(
    series: { keys: string[]; closes: number[]; index: Map<string, number> },
    day: string,
    horizon: number,
  ): number | null {
    const start = series.index.get(day);
    if (start === undefined) return null;

    const end = start + horizon;
    if (end >= series.closes.length) return null;

    const from = series.closes[start];
    const to = series.closes[end];
    if (!(from > 0)) return null;

    return ((to - from) / from) * 100;
  }

  private async loadCloses(
    symbols: string[],
  ): Promise<Map<string, { keys: string[]; closes: number[]; index: Map<string, number> }>> {
    const result = new Map<string, { keys: string[]; closes: number[]; index: Map<string, number> }>();

    const settled = await Promise.allSettled(
      symbols.map(async (symbol) => {
        const candles = await this.market.getCandles(symbol, '1d', CANDLE_LOOKBACK);
        const keys = candles.map((c) => dayKey(new Date(c.time * 1000)));
        return {
          symbol,
          keys,
          closes: candles.map((c) => c.close),
          index: new Map(keys.map((k, i) => [k, i])),
        };
      }),
    );

    for (const entry of settled) {
      if (entry.status === 'fulfilled') {
        const { symbol, ...series } = entry.value;
        result.set(symbol, series);
      } else {
        this.logger.warn(`price history unavailable for one symbol: ${entry.reason}`);
      }
    }
    return result;
  }

  private summarise(label: SentimentBucket, returns: number[]): BucketResult {
    if (returns.length === 0) {
      return { label, samples: 0, meanReturnPct: null, stdDevPct: null, stdErrorPct: null };
    }
    const average = mean(returns);
    const deviation = stdDev(returns, average);
    return {
      label,
      samples: returns.length,
      meanReturnPct: round(average),
      stdDevPct: round(deviation),
      stdErrorPct: round(deviation / Math.sqrt(returns.length)),
    };
  }

  private verdict(
    smallestBucket: number,
    spread: number | null,
    spreadError: number | null,
  ): { status: ValidationStatus; detail: string } {
    if (!Number.isFinite(smallestBucket) || smallestBucket < MIN_SAMPLES_PER_BUCKET) {
      return {
        status: 'insufficient',
        detail:
          `Bucket terkecil baru ${Number.isFinite(smallestBucket) ? smallestBucket : 0} observasi, ` +
          `minimal ${MIN_SAMPLES_PER_BUCKET}. Belum ada yang bisa disimpulkan — biarkan scraper berjalan.`,
      };
    }

    if (spread === null || spreadError === null || spreadError === 0) {
      return { status: 'insufficient', detail: 'Data tidak cukup untuk menghitung selisih.' };
    }

    // Ratio of the gap to its own uncertainty. Roughly a t-statistic; treated
    // as a rule of thumb, not a formal test.
    const ratio = Math.abs(spread) / spreadError;
    const direction = spread > 0 ? 'searah' : 'berlawanan arah';

    if (ratio < 2) {
      return {
        status: 'no_signal',
        detail:
          `Selisih ${spread.toFixed(2)}% masih di dalam derau (±${(spreadError * 2).toFixed(2)}%). ` +
          `Sentimen belum terbukti mendahului harga.`,
      };
    }
    if (ratio < 3) {
      return {
        status: 'weak_signal',
        detail:
          `Selisih ${spread.toFixed(2)}% (${direction}) sekitar ${ratio.toFixed(1)}× derau. ` +
          `Menarik, tapi belum kuat — perbesar sampel sebelum dipercaya.`,
      };
    }
    return {
      status: 'signal',
      detail:
        `Selisih ${spread.toFixed(2)}% (${direction}) sekitar ${ratio.toFixed(1)}× derau. ` +
        `Sinyalnya konsisten pada data yang ada.`,
    };
  }
}
