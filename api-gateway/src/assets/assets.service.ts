import { Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';

export interface AssetRow {
  id: number;
  symbol: string;
  name: string;
  type: 'crypto' | 'stock';
}

@Injectable()
export class AssetsService {
  constructor(private readonly db: DatabaseService) {}

  findAll(type?: 'crypto' | 'stock'): Promise<AssetRow[]> {
    if (type) {
      return this.db.query<AssetRow>(
        `SELECT id, symbol, name, type FROM assets WHERE type = $1 ORDER BY symbol`,
        [type],
      );
    }
    return this.db.query<AssetRow>(`SELECT id, symbol, name, type FROM assets ORDER BY type, symbol`);
  }

  async findBySymbol(symbol: string): Promise<AssetRow> {
    const asset = await this.db.queryOne<AssetRow>(
      `SELECT id, symbol, name, type FROM assets WHERE upper(symbol) = upper($1) LIMIT 1`,
      [symbol],
    );
    if (!asset) {
      throw new NotFoundException(`asset '${symbol}' is not on the watchlist`);
    }
    return asset;
  }
}
