import { Module } from '@nestjs/common';

import { RealtimeModule } from '../realtime/realtime.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [RealtimeModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
