import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AssetsModule } from './assets/assets.module';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { MarketModule } from './market/market.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RedisModule } from './redis/redis.module';
import { SentimentModule } from './sentiment/sentiment.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    DatabaseModule,
    RedisModule,
    AssetsModule,
    MarketModule,
    SentimentModule,
    RealtimeModule,
    // After RealtimeModule: the health check reads that module's live broker
    // connection rather than opening one of its own.
    HealthModule,
  ],
})
export class AppModule {}
