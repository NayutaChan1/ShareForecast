import { Controller, Get, Param, Query } from '@nestjs/common';

import { AssetsService, AssetRow } from './assets.service';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  list(@Query('type') type?: 'crypto' | 'stock'): Promise<AssetRow[]> {
    return this.assets.findAll(type === 'crypto' || type === 'stock' ? type : undefined);
  }

  @Get(':symbol')
  get(@Param('symbol') symbol: string): Promise<AssetRow> {
    return this.assets.findBySymbol(symbol);
  }
}
