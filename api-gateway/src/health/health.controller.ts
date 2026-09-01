import { Controller, Get } from '@nestjs/common';

import { HealthReport } from './health.types';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check(): Promise<HealthReport> {
    return this.health.check();
  }
}
