import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Candle, Interval, Quote } from './market.types';

const REQUEST_TIMEOUT_MS = 10_000;

/** Raw kline tuple as returned by Binance. */
type KlineTuple = [number, string, string, string, string, string, ...unknown[]];

interface Ticker24h {
  lastPrice: string;
  prevClosePrice: string;
  priceChange: string;
  priceChangePercent: string;
  closeTime: number;
}

@Injectable()
export class BinanceService {
  private readonly logger = new Logger(BinanceService.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('binanceApiUrl')!;
  }

  private async get<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    }).catch((err: Error) => {
      this.logger.error(`binance request failed: ${err.message}`);
      throw new BadGatewayException('upstream market data error');
    });

    if (!response.ok) {
      this.logger.error(`binance ${path} responded ${response.status}`);
      throw new BadGatewayException('upstream market data error');
    }
    return (await response.json()) as T;
  }

  async fetchCandles(symbol: string, interval: Interval, limit: number): Promise<Candle[]> {
    const klines = await this.get<KlineTuple[]>('/klines', {
      symbol: symbol.toUpperCase(),
      interval,
      limit: Math.min(limit, 1000),
    });

    return klines.map(([openTime, open, high, low, close, volume]) => ({
      time: Math.floor(openTime / 1000),
      open: Number.parseFloat(open),
      high: Number.parseFloat(high),
      low: Number.parseFloat(low),
      close: Number.parseFloat(close),
      volume: Number.parseFloat(volume),
    }));
  }

  async fetchQuote(symbol: string): Promise<Quote> {
    const ticker = await this.get<Ticker24h>('/ticker/24hr', { symbol: symbol.toUpperCase() });

    return {
      symbol: symbol.toUpperCase(),
      price: Number.parseFloat(ticker.lastPrice),
      previousClose: Number.parseFloat(ticker.prevClosePrice),
      change: Number.parseFloat(ticker.priceChange),
      changePercent: Number.parseFloat(ticker.priceChangePercent),
      time: Math.floor(ticker.closeTime / 1000),
    };
  }
}
