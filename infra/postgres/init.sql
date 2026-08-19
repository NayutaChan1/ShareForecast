-- Schema for the Market Sentiment & Asset Tracker.
-- Runs once, on first boot of an empty postgres volume.

CREATE TYPE asset_type AS ENUM ('crypto', 'stock');
CREATE TYPE sentiment_label AS ENUM ('bullish', 'bearish', 'neutral');

-- ── Assets tracked by the platform ────────────────────────────
CREATE TABLE assets (
    id          SERIAL PRIMARY KEY,
    symbol      VARCHAR(32)  NOT NULL,
    name        VARCHAR(128) NOT NULL,
    type        asset_type   NOT NULL,
    -- Keywords used to attach a news article to this asset.
    keywords    TEXT[]       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (symbol, type)
);

-- ── OHLCV candles, one row per (asset, interval, open_time) ───
CREATE TABLE candles (
    id          BIGSERIAL PRIMARY KEY,
    asset_id    INTEGER     NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    interval    VARCHAR(8)  NOT NULL,
    open_time   TIMESTAMPTZ NOT NULL,
    open        NUMERIC(20, 8) NOT NULL,
    high        NUMERIC(20, 8) NOT NULL,
    low         NUMERIC(20, 8) NOT NULL,
    close       NUMERIC(20, 8) NOT NULL,
    volume      NUMERIC(28, 8) NOT NULL DEFAULT 0,
    UNIQUE (asset_id, interval, open_time)
);

CREATE INDEX idx_candles_lookup ON candles (asset_id, interval, open_time DESC);

-- ── News articles pulled from RSS feeds ───────────────────────
CREATE TABLE news_articles (
    id            BIGSERIAL PRIMARY KEY,
    source        VARCHAR(64)  NOT NULL,
    title         TEXT         NOT NULL,
    url           TEXT         NOT NULL UNIQUE,
    summary       TEXT,
    published_at  TIMESTAMPTZ  NOT NULL,
    scraped_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- Set once the worker has produced a sentiment score.
    analyzed      BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_news_published ON news_articles (published_at DESC);
CREATE INDEX idx_news_pending    ON news_articles (analyzed) WHERE analyzed = FALSE;

-- ── FinBERT output, one row per analysed article ──────────────
CREATE TABLE sentiment_scores (
    id          BIGSERIAL PRIMARY KEY,
    article_id  BIGINT          NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
    label       sentiment_label NOT NULL,
    -- Confidence of the winning label, 0..1
    confidence  REAL            NOT NULL,
    -- Full distribution, useful for charting a continuous signal.
    positive    REAL            NOT NULL,
    negative    REAL            NOT NULL,
    neutral     REAL            NOT NULL,
    model       VARCHAR(128)    NOT NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (article_id)
);

CREATE INDEX idx_sentiment_created ON sentiment_scores (created_at DESC);

-- ── Which assets a given article is about ─────────────────────
CREATE TABLE article_assets (
    article_id  BIGINT  NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
    asset_id    INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    PRIMARY KEY (article_id, asset_id)
);

CREATE INDEX idx_article_assets_asset ON article_assets (asset_id);

-- ── Seed a starter watchlist ──────────────────────────────────
INSERT INTO assets (symbol, name, type, keywords) VALUES
    ('BTCUSDT', 'Bitcoin',   'crypto', ARRAY['bitcoin', 'btc']),
    ('ETHUSDT', 'Ethereum',  'crypto', ARRAY['ethereum', 'eth', 'ether']),
    ('SOLUSDT', 'Solana',    'crypto', ARRAY['solana', 'sol']),
    ('BNBUSDT', 'BNB',       'crypto', ARRAY['bnb', 'binance coin']),
    ('AAPL',    'Apple Inc.',      'stock', ARRAY['apple', 'aapl', 'iphone']),
    ('MSFT',    'Microsoft Corp.', 'stock', ARRAY['microsoft', 'msft']),
    ('NVDA',    'NVIDIA Corp.',    'stock', ARRAY['nvidia', 'nvda']),
    ('TSLA',    'Tesla Inc.',      'stock', ARRAY['tesla', 'tsla', 'musk']),
    -- Indonesian financial media headlines an emiten by its IDX ticker code
    -- ('BBCA', 'BBRI') far more often than by name, so the code has to be a
    -- keyword or these rows almost never match an article.
    ('BBCA.JK', 'Bank Central Asia', 'stock', ARRAY['bbca', 'bca', 'bank central asia']),
    ('BBRI.JK', 'Bank Rakyat Indonesia', 'stock', ARRAY['bbri', 'bri', 'bank rakyat', 'bank rakyat indonesia']);
