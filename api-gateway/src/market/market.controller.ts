import { BadRequestException, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query } from '@nestjs/common';

import { MarketService } from './market.service';
import { Candle, Interval, Quote, SUPPORTED_INTERVALS, isInterval } from './market.types';

@Controller('market')
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Get('quotes')
  quotes(): Promise<Quote[]> {
    return this.market.getAllQuotes();
  }

  @Get(':symbol/quote')
  quote(@Param('symbol') symbol: string): Promise<Quote> {
    return this.market.getQuote(symbol);
  }

  @Get(':symbol/candles')
  candles(
    @Param('symbol') symbol: string,
    @Query('interval', new DefaultValuePipe('1d')) interval: string,
    @Query('limit', new DefaultValuePipe(500), ParseIntPipe) limit: number,
  ): Promise<Candle[]> {
    if (!isInterval(interval)) {
      throw new BadRequestException(
        `interval '${interval}' not supported; use one of ${SUPPORTED_INTERVALS.join(', ')}`,
      );
    }
    if (limit < 1 || limit > 1000) {
      throw new BadRequestException('limit must be between 1 and 1000');
    }
    return this.market.getCandles(symbol, interval as Interval, limit);
  }
}
