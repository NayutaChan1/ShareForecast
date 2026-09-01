import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { SentimentConsumerService } from '../realtime/sentiment-consumer.service';
import { HealthReport } from './health.types';

/**
 * Multiple of the scrape interval after which silence stops being normal.
 *
 * One missed pass is a hiccup; three in a row means the scraper is not running
 * even though its container still reports Up — which is exactly how it failed
 * for two and a half hours without anything noticing.
 */
const STALE_INTERVALS = 3;

/** A backlog beyond this means the worker is not draining the queue. */
const PENDING_BACKLOG_LIMIT = 200;

interface FreshnessRow {
  last_article: Date | null;
  last_score: Date | null;
  pending: string;
  last_scrape: Date | null;
}

@Injectable()
export class HealthService {
  private readonly scrapeIntervalMinutes: number;

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly consumer: SentimentConsumerService,
    config: ConfigService,
  ) {
    this.scrapeIntervalMinutes = config.get<number>('scrapeIntervalMinutes') ?? 10;
  }

  /**
   * Liveness plus a judgement on whether the data behind it is still moving.
   *
   * Reachable dependencies are not the same as a working pipeline: every
   * container can be healthy while no article has arrived for hours.
   */
  async check(): Promise<HealthReport> {
    const [postgres, redis] = await Promise.all([this.db.ping(), this.redis.ping()]);
    const rabbitmq = this.consumer.isConnected();

    const issues: string[] = [];
    if (!postgres) issues.push('PostgreSQL tidak merespons');
    if (!redis) issues.push('Redis tidak merespons');
    if (!rabbitmq) issues.push('RabbitMQ terputus — pipeline sentimen berhenti');

    const freshness = postgres
      ? await this.freshness(issues)
      : {
          lastArticleAt: null,
          articleAgeMinutes: null,
          lastScoreAt: null,
          pendingAnalysis: null,
          lastScrapeRunAt: null,
          scrapeAgeMinutes: null,
          expectedIntervalMinutes: this.scrapeIntervalMinutes,
          staleAfterMinutes: this.scrapeIntervalMinutes * STALE_INTERVALS,
          stale: false,
        };

    return {
      status: issues.length === 0 ? 'ok' : 'degraded',
      dependencies: { postgres, redis, rabbitmq },
      freshness,
      issues,
      uptime: Math.floor(process.uptime()),
    };
  }

  private async freshness(issues: string[]): Promise<HealthReport['freshness']> {
    const staleAfter = this.scrapeIntervalMinutes * STALE_INTERVALS;

    const row = await this.db
      .queryOne<FreshnessRow>(
        `SELECT (SELECT max(scraped_at) FROM news_articles)                       AS last_article,
                (SELECT max(created_at) FROM sentiment_scores)                    AS last_score,
                (SELECT count(*) FROM news_articles WHERE analyzed = FALSE)       AS pending,
                (SELECT last_run_at FROM service_heartbeats
                  WHERE service = 'news-scraper')                                AS last_scrape`,
      )
      .catch(() => null);

    const lastArticle = row?.last_article ?? null;
    const ageMinutes =
      lastArticle === null ? null : (Date.now() - lastArticle.getTime()) / 60_000;

    const lastScrape = row?.last_scrape ?? null;
    const scrapeAge = lastScrape === null ? null : (Date.now() - lastScrape.getTime()) / 60_000;

    // The heartbeat is the authoritative liveness signal. Article age only
    // reports a quiet news cycle, which is not a fault.
    const stale = scrapeAge !== null && scrapeAge > staleAfter;
    if (stale) {
      issues.push(
        `news-scraper tidak menyelesaikan pass selama ${Math.round(scrapeAge!)} menit ` +
          `(ambang ${staleAfter} menit)`,
      );
    } else if (scrapeAge === null && ageMinutes !== null && ageMinutes > staleAfter) {
      // Older deployments have no heartbeat row yet; fall back to article age.
      issues.push(
        `Tidak ada artikel baru selama ${Math.round(ageMinutes)} menit — periksa news-scraper`,
      );
    }

    const pending = row ? Number(row.pending) : null;
    if (pending !== null && pending > PENDING_BACKLOG_LIMIT) {
      issues.push(`${pending} artikel menunggu diskor — periksa nlp-worker`);
    }

    return {
      lastArticleAt: lastArticle ? Math.floor(lastArticle.getTime() / 1000) : null,
      articleAgeMinutes: ageMinutes === null ? null : Math.round(ageMinutes),
      lastScoreAt: row?.last_score ? Math.floor(row.last_score.getTime() / 1000) : null,
      pendingAnalysis: pending,
      lastScrapeRunAt: lastScrape ? Math.floor(lastScrape.getTime() / 1000) : null,
      scrapeAgeMinutes: scrapeAge === null ? null : Math.round(scrapeAge),
      expectedIntervalMinutes: this.scrapeIntervalMinutes,
      staleAfterMinutes: staleAfter,
      stale,
    };
  }
}
