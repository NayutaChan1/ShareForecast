import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { AssetDetail, AssetRow, AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';

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

  @Post()
  create(@Body() dto: CreateAssetDto): Promise<AssetDetail> {
    return this.assets.create(dto);
  }

  @Delete(':symbol')
  @HttpCode(200)
  remove(@Param('symbol') symbol: string): Promise<{ symbol: string; deleted: true }> {
    return this.assets.remove(symbol);
  }
}
