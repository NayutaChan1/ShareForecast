import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import { AssetDetail, AssetRow, AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateKeywordsDto } from './dto/update-keywords.dto';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  list(@Query('type') type?: 'crypto' | 'stock'): Promise<AssetRow[]> {
    return this.assets.findAll(type === 'crypto' || type === 'stock' ? type : undefined);
  }

  @Get(':symbol')
  get(@Param('symbol') symbol: string): Promise<Omit<AssetDetail, 'taggedArticles'>> {
    return this.assets.findDetail(symbol);
  }

  /** Replace an asset's news-matching keywords and re-tag the archive. */
  @Put(':symbol/keywords')
  updateKeywords(
    @Param('symbol') symbol: string,
    @Body() dto: UpdateKeywordsDto,
  ): Promise<AssetDetail> {
    return this.assets.updateKeywords(symbol, dto);
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
