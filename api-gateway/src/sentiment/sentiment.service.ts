import { Injectable } from '@nestjs/common';

import { AssetsService } from '../assets/assets.service';
import { DatabaseService } from '../database/database.service';
import { Interval } from '../market/market.types';

/** Bucket width in seconds for each chart interval. */
const BUCKET_SECONDS: Record<Interval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '1d': 86_400,
  '1w': 604_800,
};

export interface NewsItem {
  id: number;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  label: string;
  confidence: number;
  score: number;
  symbols: string[];
}

export interface OverlayPoint {
  /** Bucket start, seconds since epoch — aligns with the candle series. */
  time: number;
  /** Mean signed sentiment in [-1, 1]. */
  value: number;
  label: 'bullish' | 'bearish' | 'neutral';
  articles: number;
}

export interface SentimentSummary {
  symbol: string | null;
  total: number;
  bullish: number;
  bearish: number;
  neutral: number;
  /** Mean signed sentiment across the window, in [-1, 1]. */
  score: number;
}

@Injectable()
export class SentimentService {
  constructor(
    private readonly db: DatabaseService,
    private readonly assets: AssetsService,
  ) {}

  /** Recent scored articles, newest first, optionally filtered to one asset. */
  async getFeed(symbol: string | undefined, limit: number): Promise<NewsItem[]> {
    const assetId = symbol ? (await this.assets.findBySymbol(symbol)).id : null;

    const rows = await this.db.query<{
      id: string;
      title: string;
      url: string;
      source: string;
      published_at: Date;
      label: string;
      confidence: number;
      score: number;
      symbols: string[] | null;
    }>(
      `SELECT n.id,
              n.title,
              n.url,
              n.source,
              n.published_at,
              s.label,
              s.confidence,
              (s.positive - s.negative) AS score,
              ARRAY(
                SELECT a.symbol FROM article_assets aa
                JOIN assets a ON a.id = aa.asset_id
                WHERE aa.article_id = n.id
              ) AS symbols
         FROM news_articles n
         JOIN sentiment_scores s ON s.article_id = n.id
        WHERE ($1::int IS NULL OR EXISTS (
                SELECT 1 FROM article_assets aa
                 WHERE aa.article_id = n.id AND aa.asset_id = $1::int
              ))
        ORDER BY n.published_at DESC
        LIMIT $2`,
      [assetId, limit],
    );

    return rows.map((row) => ({
      id: Number(row.id),
      title: row.title,
      url: row.url,
      source: row.source,
      publishedAt: row.published_at.toISOString(),
      label: row.label,
      confidence: Number(row.confidence),
      score: Number(row.score),
      symbols: row.symbols ?? [],
    }));
  }

  /**
   * Sentiment aggregated into candle-aligned buckets.
   *
   * This is what the UI draws on top of the price chart, so bucket boundaries
   * must match the candle interval exactly or the two series drift apart.
   */
  async getOverlay(symbol: string, interval: Interval, limit: number): Promise<OverlayPoint[]> {
    const asset = await this.assets.findBySymbol(symbol);
    const bucket = BUCKET_SECONDS[interval];

    const rows = await this.db.query<{
      bucket: string;
      value: number;
      articles: string;
    }>(
      `SELECT (floor(extract(epoch FROM n.published_at) / $2) * $2)::bigint AS bucket,
              avg(s.positive - s.negative)                                  AS value,
              count(*)                                                      AS articles
         FROM news_articles n
         JOIN sentiment_scores s  ON s.article_id = n.id
         JOIN article_assets  aa  ON aa.article_id = n.id
        WHERE aa.asset_id = $1
        GROUP BY bucket
        ORDER BY bucket DESC
        LIMIT $3`,
      [asset.id, bucket, limit],
    );

    return rows
      .map((row) => {
        const value = Number(row.value);
        return {
          time: Number(row.bucket),
          value: Number(value.toFixed(4)),
          label: labelFor(value),
          articles: Number(row.articles),
        };
      })
      // The query sorts DESC to take the most recent N; charts need ascending.
      .reverse();
  }

  /** Distribution over the last `hours` hours. */
  async getSummary(symbol: string | undefined, hours: number): Promise<SentimentSummary> {
    const assetId = symbol ? (await this.assets.findBySymbol(symbol)).id : null;

    const row = await this.db.queryOne<{
      total: string;
      bullish: string;
      bearish: string;
      neutral: string;
      // avg() over numeric comes back from pg as a string.
      score: string | null;
    }>(
      `SELECT count(*)                                              AS total,
              count(*) FILTER (WHERE s.label = 'bullish')           AS bullish,
              count(*) FILTER (WHERE s.label = 'bearish')           AS bearish,
              count(*) FILTER (WHERE s.label = 'neutral')           AS neutral,
              avg(s.positive - s.negative)                          AS score
         FROM news_articles n
         JOIN sentiment_scores s ON s.article_id = n.id
        WHERE n.published_at >= now() - ($2 || ' hours')::interval
          AND ($1::int IS NULL OR EXISTS (
                SELECT 1 FROM article_assets aa
                 WHERE aa.article_id = n.id AND aa.asset_id = $1::int
              ))`,
      [assetId, String(hours)],
    );

    return {
      symbol: symbol ? symbol.toUpperCase() : null,
      total: Number(row?.total ?? 0),
      bullish: Number(row?.bullish ?? 0),
      bearish: Number(row?.bearish ?? 0),
      neutral: Number(row?.neutral ?? 0),
      score: Number(Number(row?.score ?? 0).toFixed(4)),
    };
  }
}

/**
 * Bucket a signed score into a label.
 *
 * FinBERT is confident enough that a small residual imbalance is noise, so
 * anything inside +/-0.15 reads as neutral rather than a weak directional call.
 */
function labelFor(value: number): 'bullish' | 'bearish' | 'neutral' {
  if (value > 0.15) return 'bullish';
  if (value < -0.15) return 'bearish';
  return 'neutral';
}
