import { Module } from '@nestjs/common';

import { AssetsModule } from '../assets/assets.module';
import { BinanceService } from './binance.service';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { StocksService } from './stocks.service';

@Module({
  imports: [AssetsModule],
  controllers: [MarketController],
  providers: [BinanceService, StocksService, MarketService],
  exports: [MarketService],
})
export class MarketModule {}
