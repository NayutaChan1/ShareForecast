import { Module } from '@nestjs/common';

import { AssetsModule } from '../assets/assets.module';
import { SentimentController } from './sentiment.controller';
import { SentimentService } from './sentiment.service';

@Module({
  imports: [AssetsModule],
  controllers: [SentimentController],
  providers: [SentimentService],
  exports: [SentimentService],
})
export class SentimentModule {}
