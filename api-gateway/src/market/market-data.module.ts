import { Module } from '@nestjs/common';

import { BinanceService } from './binance.service';
import { StocksService } from './stocks.service';

/**
 * The two upstream market-data clients, on their own so both MarketModule and
 * AssetsModule can use them.
 *
 * AssetsModule needs them to verify a symbol before inserting it, but
 * MarketModule already imports AssetsModule — putting them here is what keeps
 * that from becoming a circular dependency.
 */
@Module({
  providers: [BinanceService, StocksService],
  exports: [BinanceService, StocksService],
})
export class MarketDataModule {}
