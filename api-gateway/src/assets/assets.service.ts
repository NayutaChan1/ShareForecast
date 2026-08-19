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
import { UpdateKeywordsDto } from './dto/update-keywords.dto';

export interface AssetRow {
  id: number;
  symbol: string;
  name: string;
  type: 'crypto' | 'stock';
}

export interface AssetDetail extends AssetRow {
  keywords: string[];
  /** Existing articles matched to this asset when it was created. */
  taggedArticles: number;
}

/**
 * Escape a keyword for use inside a Postgres regex.
 *
 * Keywords are free text, so an unescaped "S&P 500" or "Alphabet (GOOGL)"
 * would either error or match the wrong thing.
 */
const escapeRegex = (value: string): string =>
  value.replace(/[.^$*+?()[\]{}|\\]/g, '\\$&');

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

    const keywords = this.normaliseKeywords(dto.keywords);

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

    // Articles are matched to assets at scrape time, so without this pass a
    // new asset starts with an empty sentiment overlay even when the archive
    // already holds articles naming it.
    let taggedArticles = 0;
    try {
      taggedArticles = await this.backfillTags(created.id, keywords);
    } catch (err) {
      // The asset itself is created; a failed backfill only costs history that
      // the next scrape pass would pick up anyway.
      this.logger.warn(`tag backfill failed for ${symbol}: ${(err as Error).message}`);
    }

    this.logger.log(`added ${dto.type} asset ${symbol} (${taggedArticles} archived article(s) tagged)`);
    return { ...created, taggedArticles };
  }

  /**
   * Match the existing article archive against a newly added asset.
   *
   * Done in one statement rather than pulling rows into Node: Postgres `\m`
   * and `\M` are word boundaries, the same rule the Python scraper applies, so both
   * paths agree on what counts as a mention.
   */
  private async backfillTags(assetId: number, keywords: string[]): Promise<number> {
    const patterns = keywords.map((keyword) => `\\m${escapeRegex(keyword)}\\M`);

    const rows = await this.db.query<{ article_id: string }>(
      `INSERT INTO article_assets (article_id, asset_id)
       SELECT n.id, $2
         FROM news_articles n
        WHERE EXISTS (
                SELECT 1 FROM unnest($1::text[]) AS pattern
                 WHERE n.title || ' ' || coalesce(n.summary, '') ~* pattern
              )
       ON CONFLICT DO NOTHING
       RETURNING article_id`,
      [patterns, assetId],
    );

    return rows.length;
  }

  /** Detail of one asset, including the keywords used to match news to it. */
  async findDetail(symbol: string): Promise<Omit<AssetDetail, 'taggedArticles'>> {
    const asset = await this.db.queryOne<Omit<AssetDetail, 'taggedArticles'>>(
      `SELECT id, symbol, name, type, keywords FROM assets WHERE upper(symbol) = upper($1) LIMIT 1`,
      [symbol],
    );
    if (!asset) {
      throw new NotFoundException(`asset '${symbol}' is not on the watchlist`);
    }
    return asset;
  }

  /**
   * Replace an asset's keywords and rebuild its article tags.
   *
   * Tags are recomputed from scratch rather than topped up: a keyword the user
   * just removed must also drop the articles it was the only reason for, and
   * an incremental update cannot know which those were.
   */
  async updateKeywords(symbol: string, dto: UpdateKeywordsDto): Promise<AssetDetail> {
    const existing = await this.findBySymbol(symbol);
    const keywords = this.normaliseKeywords(dto.keywords);

    const updated = await this.db.queryOne<Omit<AssetDetail, 'taggedArticles'>>(
      `UPDATE assets SET keywords = $1 WHERE id = $2
       RETURNING id, symbol, name, type, keywords`,
      [keywords, existing.id],
    );
    if (!updated) {
      throw new NotFoundException(`asset '${symbol}' is not on the watchlist`);
    }

    await this.db.query(`DELETE FROM article_assets WHERE asset_id = $1`, [existing.id]);
    const taggedArticles = await this.backfillTags(existing.id, keywords);

    this.logger.log(
      `updated keywords for ${updated.symbol} (${taggedArticles} article(s) re-tagged)`,
    );
    return { ...updated, taggedArticles };
  }

  private normaliseKeywords(raw: string[]): string[] {
    // Matching lowercases the haystack, so store keywords the same way and
    // drop duplicates the user may have typed twice.
    const keywords = [...new Set(raw.map((k) => k.trim().toLowerCase()).filter(Boolean))];
    if (keywords.length === 0) {
      throw new BadRequestException('at least one non-empty keyword is required');
    }
    return keywords;
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
