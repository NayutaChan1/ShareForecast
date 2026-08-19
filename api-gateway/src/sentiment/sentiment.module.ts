import { Module } from '@nestjs/common';

import { AssetsModule } from '../assets/assets.module';
import { MarketModule } from '../market/market.module';
import { SentimentController } from './sentiment.controller';
import { SentimentService } from './sentiment.service';
import { ValidationService } from './validation.service';

@Module({
  imports: [AssetsModule, MarketModule],
  controllers: [SentimentController],
  providers: [SentimentService, ValidationService],
  exports: [SentimentService],
})
export class SentimentModule {}
