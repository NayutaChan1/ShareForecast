import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AssetsService, AssetRow } from '../assets/assets.service';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { BinanceService } from './binance.service';
import { StocksService } from './stocks.service';
import { Candle, Interval, Quote } from './market.types';

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);
  private readonly quoteTtl: number;

  constructor(
    private readonly assets: AssetsService,
    private readonly binance: BinanceService,
    private readonly stocks: StocksService,
    private readonly redis: RedisService,
    private readonly db: DatabaseService,
    config: ConfigService,
  ) {
    this.quoteTtl = config.get<number>('priceCacheTtl') ?? 30;
  }

  /** Candles for any watchlisted asset, routed by asset type. */
  async getCandles(symbol: string, interval: Interval, limit: number): Promise<Candle[]> {
    const asset = await this.assets.findBySymbol(symbol);

    const candles =
      asset.type === 'crypto'
        ? await this.binance.fetchCandles(asset.symbol, interval, limit)
        : await this.stocks.fetchCandles(asset.symbol, interval, limit);

    // Archive in the background: a slow write must not delay the response, and
    // a failed write only costs us history we can re-fetch next time.
    void this.persistCandles(asset, interval, candles).catch((err: Error) =>
      this.logger.warn(`failed to archive candles for ${asset.symbol}: ${err.message}`),
    );

    return candles;
  }

  /** Latest quote, served from Redis when warm. */
  async getQuote(symbol: string): Promise<Quote> {
    const asset = await this.assets.findBySymbol(symbol);
    const cacheKey = `quote:${asset.type}:${asset.symbol}`;

    const cached = await this.redis.getJson<Quote>(cacheKey).catch(() => null);
    if (cached) return cached;

    const quote =
      asset.type === 'crypto'
        ? await this.binance.fetchQuote(asset.symbol)
        : await this.stocks.fetchQuote(asset.symbol);

    await this.redis.setJson(cacheKey, quote, this.quoteTtl).catch((err: Error) =>
      this.logger.warn(`failed to cache quote for ${asset.symbol}: ${err.message}`),
    );

    return quote;
  }

  /** Quotes for every watchlisted asset, skipping any that fail. */
  async getAllQuotes(): Promise<Quote[]> {
    const assets = await this.assets.findAll();
    const settled = await Promise.allSettled(assets.map((a) => this.getQuote(a.symbol)));

    return settled
      .filter((r): r is PromiseFulfilledResult<Quote> => r.status === 'fulfilled')
      .map((r) => r.value);
  }

  private async persistCandles(
    asset: AssetRow,
    interval: Interval,
    candles: Candle[],
  ): Promise<void> {
    if (candles.length === 0) return;

    // One multi-row insert instead of N round trips; the unique index on
    // (asset_id, interval, open_time) makes re-inserting overlapping ranges a no-op.
    const columns = 8;
    const values: unknown[] = [];
    const tuples = candles.map((candle, i) => {
      const base = i * columns;
      values.push(
        asset.id,
        interval,
        new Date(candle.time * 1000).toISOString(),
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume,
      );
      const placeholders = Array.from({ length: columns }, (_, c) => `$${base + c + 1}`);
      return `(${placeholders.join(', ')})`;
    });

    await this.db.query(
      `INSERT INTO candles (asset_id, interval, open_time, open, high, low, close, volume)
       VALUES ${tuples.join(', ')}
       ON CONFLICT (asset_id, interval, open_time) DO NOTHING`,
      values,
    );
  }
}
