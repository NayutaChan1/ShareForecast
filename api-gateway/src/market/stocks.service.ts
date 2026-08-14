import { BadGatewayException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Candle, Interval, Quote } from './market.types';

const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Equities data, proxied from the Python service.
 *
 * yfinance has no Node equivalent worth depending on, so nlp-engine owns the
 * yfinance call and this service is a typed HTTP client in front of it.
 */
@Injectable()
export class StocksService {
  private readonly logger = new Logger(StocksService.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('nlpEngineUrl')!;
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    }).catch((err: Error) => {
      this.logger.error(`nlp-engine request failed: ${err.message}`);
      throw new BadGatewayException('stock data service unavailable');
    });

    if (response.status === 404) {
      throw new NotFoundException('no market data for this symbol');
    }
    if (!response.ok) {
      this.logger.error(`nlp-engine ${path} responded ${response.status}`);
      throw new BadGatewayException('stock data service error');
    }
    return (await response.json()) as T;
  }

  fetchCandles(symbol: string, interval: Interval, limit: number): Promise<Candle[]> {
    const query = new URLSearchParams({ interval, limit: String(limit) });
    return this.get<Candle[]>(
      `/market/stocks/${encodeURIComponent(symbol)}/candles?${query.toString()}`,
    );
  }

  fetchQuote(symbol: string): Promise<Quote> {
    return this.get<Quote>(`/market/stocks/${encodeURIComponent(symbol)}/quote`);
  }
}
