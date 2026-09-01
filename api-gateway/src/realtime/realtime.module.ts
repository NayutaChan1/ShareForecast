import { Module } from '@nestjs/common';

import { MarketModule } from '../market/market.module';
import { EventsGateway } from './events.gateway';
import { PriceStreamService } from './price-stream.service';
import { SentimentConsumerService } from './sentiment-consumer.service';

@Module({
  imports: [MarketModule],
  providers: [EventsGateway, PriceStreamService, SentimentConsumerService],
  exports: [EventsGateway, SentimentConsumerService],
})
export class RealtimeModule {}
