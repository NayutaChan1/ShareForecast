import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';

import { Interval, SUPPORTED_INTERVALS, isInterval } from '../market/market.types';
import { NewsItem, OverlayPoint, SentimentService, SentimentSummary } from './sentiment.service';

@Controller('sentiment')
export class SentimentController {
  constructor(private readonly sentiment: SentimentService) {}

  /** Scored news feed, newest first. */
  @Get('news')
  news(
    @Query('symbol') symbol?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ): Promise<NewsItem[]> {
    return this.sentiment.getFeed(symbol, clamp(limit, 1, 200));
  }

  /** Bullish/bearish/neutral counts over a rolling window. */
  @Get('summary')
  summary(
    @Query('symbol') symbol?: string,
    @Query('hours', new DefaultValuePipe(24), ParseIntPipe) hours = 24,
  ): Promise<SentimentSummary> {
    return this.sentiment.getSummary(symbol, clamp(hours, 1, 24 * 30));
  }

  /** Candle-aligned sentiment series for the chart overlay. */
  @Get(':symbol/overlay')
  overlay(
    @Param('symbol') symbol: string,
    @Query('interval', new DefaultValuePipe('1d')) interval: string,
    @Query('limit', new DefaultValuePipe(500), ParseIntPipe) limit = 500,
  ): Promise<OverlayPoint[]> {
    if (!isInterval(interval)) {
      throw new BadRequestException(
        `interval '${interval}' not supported; use one of ${SUPPORTED_INTERVALS.join(', ')}`,
      );
    }
    return this.sentiment.getOverlay(symbol, interval as Interval, clamp(limit, 1, 1000));
  }
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
