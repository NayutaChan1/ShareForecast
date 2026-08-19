/** One measured indicator plus a plain-language reading of it. */
export interface Metric<T = number> {
  value: T | null;
  reading: string;
}

export interface AssetCondition {
  symbol: string;
  type: 'crypto' | 'stock';
  /** Unix seconds of the most recent candle the numbers are drawn from. */
  asOf: number;

  /**
   * What the reading is built on. Surfaced deliberately: a metric computed
   * from 20 candles deserves less weight than one from 200, and hiding that
   * is how a dashboard ends up looking more certain than its data.
   */
  basis: {
    candles: number;
    interval: string;
    sufficient: boolean;
  };

  price: {
    last: number;
    changePct: number | null;
  };

  trend: {
    sma20: Metric;
    sma50: Metric;
    /** Relationship of the two averages to each other. */
    structure: Metric<string>;
  };

  momentum: {
    rsi14: Metric;
    return7: Metric;
    return30: Metric;
  };

  volatility: {
    /** Annualised standard deviation of daily returns, in percent. */
    annualisedPct: Metric;
  };

  range: {
    high: number | null;
    low: number | null;
    positionPct: Metric;
    drawdownPct: Metric;
  };

  volume: {
    trend: Metric<string>;
  };
}
