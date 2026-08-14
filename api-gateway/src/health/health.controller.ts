import { Controller, Get } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check(): Promise<{
    status: 'ok' | 'degraded';
    dependencies: { postgres: boolean; redis: boolean };
    uptime: number;
  }> {
    const [postgres, redis] = await Promise.all([this.db.ping(), this.redis.ping()]);
    return {
      status: postgres && redis ? 'ok' : 'degraded',
      dependencies: { postgres, redis },
      uptime: Math.floor(process.uptime()),
    };
  }
}
