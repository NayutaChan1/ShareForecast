import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { BinanceService } from '../market/binance.service';
import { StocksService } from '../market/stocks.service';
import { CreateAssetDto } from './dto/create-asset.dto';

export interface AssetRow {
  id: number;
  symbol: string;
  name: string;
  type: 'crypto' | 'stock';
}

export interface AssetDetail extends AssetRow {
  keywords: string[];
}

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly binance: BinanceService,
    private readonly stocks: StocksService,
  ) {}

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

  /**
   * Add an asset to the watchlist.
   *
   * The symbol is checked against the real upstream first: a row that no
   * provider recognises would otherwise sit in the watchlist forever, failing
   * every quote poll and showing a permanently broken chart.
   */
  async create(dto: CreateAssetDto): Promise<AssetDetail> {
    const symbol = dto.symbol.trim().toUpperCase();
    const name = dto.name.trim();

    // Matching lowercases the haystack, so store keywords the same way and
    // drop duplicates the user may have typed twice.
    const keywords = [...new Set(dto.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))];
    if (keywords.length === 0) {
      throw new BadRequestException('at least one non-empty keyword is required');
    }

    await this.assertSymbolResolves(symbol, dto.type);

    const created = await this.db.queryOne<AssetDetail>(
      `INSERT INTO assets (symbol, name, type, keywords)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (symbol, type) DO NOTHING
       RETURNING id, symbol, name, type, keywords`,
      [symbol, name, dto.type, keywords],
    );

    if (!created) {
      throw new ConflictException(`'${symbol}' is already on the watchlist`);
    }

    this.logger.log(`added ${dto.type} asset ${symbol}`);
    return created;
  }

  /**
   * Remove an asset. Its candles and news tags go with it via ON DELETE
   * CASCADE; the articles themselves stay, they just stop being attributed.
   */
  async remove(symbol: string): Promise<{ symbol: string; deleted: true }> {
    const removed = await this.db.queryOne<{ symbol: string }>(
      `DELETE FROM assets WHERE upper(symbol) = upper($1) RETURNING symbol`,
      [symbol],
    );

    if (!removed) {
      throw new NotFoundException(`asset '${symbol}' is not on the watchlist`);
    }

    this.logger.log(`removed asset ${removed.symbol}`);
    return { symbol: removed.symbol, deleted: true };
  }

  private async assertSymbolResolves(symbol: string, type: 'crypto' | 'stock'): Promise<void> {
    try {
      if (type === 'crypto') {
        await this.binance.fetchQuote(symbol);
      } else {
        await this.stocks.fetchQuote(symbol);
      }
    } catch (err) {
      // A provider that is down must not be reported as a bad symbol — that
      // sends the user off rewriting a ticker that was correct all along.
      if (err instanceof BadGatewayException) {
        throw new ServiceUnavailableException(
          `cannot verify '${symbol}' right now: the market data provider is unreachable. Try again shortly.`,
        );
      }
      const hint =
        type === 'crypto'
          ? 'Crypto symbols are Binance trading pairs, e.g. ADAUSDT.'
          : 'Yahoo tickers need their exchange suffix, e.g. TLKM.JK for Indonesian stocks.';
      throw new BadRequestException(
        `no market data found for '${symbol}'. ${hint}`,
      );
    }
  }
}
