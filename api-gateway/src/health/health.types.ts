export interface HealthReport {
  status: 'ok' | 'degraded';

  dependencies: {
    postgres: boolean;
    redis: boolean;
    rabbitmq: boolean;
  };

  /**
   * Whether data is still arriving, as distinct from whether services answer.
   * A stack can be entirely reachable while the pipeline has stopped.
   */
  freshness: {
    /** Unix seconds of the most recently scraped article. */
    lastArticleAt: number | null;
    articleAgeMinutes: number | null;
    lastScoreAt: number | null;
    /** Articles stored but not yet scored — a growing number means a stuck worker. */
    pendingAnalysis: number | null;
    /**
     * When the scraper last completed a pass, new articles or not. This is the
     * signal that separates a quiet news cycle from a stopped process.
     */
    lastScrapeRunAt: number | null;
    scrapeAgeMinutes: number | null;
    expectedIntervalMinutes: number;
    staleAfterMinutes: number;
    stale: boolean;
  };

  /** Plain-language reasons behind a `degraded` status. Empty when ok. */
  issues: string[];

  uptime: number;
}
