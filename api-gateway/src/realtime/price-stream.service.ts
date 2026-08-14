import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MarketService } from '../market/market.service';
import { EventsGateway } from './events.gateway';

/**
 * Polls quotes on a fixed interval and pushes them over WebSocket.
 *
 * Polling rather than holding a Binance socket keeps one code path for crypto
 * and equities — yfinance has no streaming endpoint to subscribe to anyway.
 */
@Injectable()
export class PriceStreamService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PriceStreamService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly market: MarketService,
    private readonly gateway: EventsGateway,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const interval = this.config.get<number>('pricePollIntervalMs') ?? 5_000;
    this.timer = setInterval(() => void this.tick(), interval);
    this.logger.log(`polling quotes every ${interval}ms`);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    // A slow upstream must not stack overlapping passes.
    if (this.running) return;
    this.running = true;

    try {
      for (const quote of await this.market.getAllQuotes()) {
        this.gateway.emitQuote(quote);
      }
    } catch (err) {
      this.logger.warn(`quote poll failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
