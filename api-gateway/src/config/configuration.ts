export interface AppConfig {
  port: number;
  corsOrigins: string[];
  postgres: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  redis: { host: string; port: number };
  rabbitmq: { url: string };
  nlpEngineUrl: string;
  binanceApiUrl: string;
  pricePollIntervalMs: number;
  scrapeIntervalMinutes: number;
  priceCacheTtl: number;
}

const int = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default (): AppConfig => {
  const rabbitUser = process.env.RABBITMQ_USER ?? 'market';
  const rabbitPass = process.env.RABBITMQ_PASSWORD ?? 'market';
  const rabbitHost = process.env.RABBITMQ_HOST ?? 'rabbitmq';
  const rabbitPort = int(process.env.RABBITMQ_PORT, 5672);

  return {
    port: int(process.env.API_PORT, 3000),
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    postgres: {
      host: process.env.POSTGRES_HOST ?? 'postgres',
      port: int(process.env.POSTGRES_PORT, 5432),
      user: process.env.POSTGRES_USER ?? 'market',
      password: process.env.POSTGRES_PASSWORD ?? 'market',
      database: process.env.POSTGRES_DB ?? 'market_sentiment',
    },
    redis: {
      host: process.env.REDIS_HOST ?? 'redis',
      port: int(process.env.REDIS_PORT, 6379),
    },
    rabbitmq: {
      url: `amqp://${rabbitUser}:${rabbitPass}@${rabbitHost}:${rabbitPort}`,
    },
    nlpEngineUrl: process.env.NLP_ENGINE_URL ?? 'http://nlp-engine:8000',
    // Binance's public market-data host. It serves the same read-only
    // /api/v3 endpoints as api.binance.com without needing a key, and it
    // stays reachable in regions and networks where the trading host does not.
    binanceApiUrl: process.env.BINANCE_API_URL ?? 'https://data-api.binance.vision/api/v3',
    pricePollIntervalMs: int(process.env.PRICE_POLL_INTERVAL_MS, 5000),
    // Mirrors the scraper's own setting. The gateway does not schedule
    // scraping; it needs the number to judge whether data has gone stale.
    scrapeIntervalMinutes: int(process.env.SCRAPE_INTERVAL_MINUTES, 10),
    priceCacheTtl: int(process.env.PRICE_CACHE_TTL, 30),
  };
};
