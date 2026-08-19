import { Module } from '@nestjs/common';

import { AssetsModule } from '../assets/assets.module';
import { MarketController } from './market.controller';
import { ConditionService } from './condition.service';
import { MarketDataModule } from './market-data.module';
import { MarketService } from './market.service';

@Module({
  imports: [AssetsModule, MarketDataModule],
  controllers: [MarketController],
  providers: [MarketService, ConditionService],
  exports: [MarketService],
})
export class MarketModule {}
