export type SentimentBucket = 'bullish' | 'bearish' | 'neutral';

export interface BucketResult {
  label: SentimentBucket;
  /** Number of (asset, day) observations that fell in this bucket. */
  samples: number;
  /** Mean forward return following days in this bucket, in percent. */
  meanReturnPct: number | null;
  stdDevPct: number | null;
  /**
   * Standard error of the mean. The point of reporting it: a mean of +0.8%
   * with an error of ±1.5% is indistinguishable from zero, and without this
   * number the mean alone looks like a finding.
   */
  stdErrorPct: number | null;
}

export type ValidationStatus = 'insufficient' | 'no_signal' | 'weak_signal' | 'signal';

export interface SignalValidation {
  /** null when pooled across every asset. */
  symbol: string | null;
  horizonDays: number;
  generatedAt: number;

  observations: number;
  buckets: BucketResult[];

  /** Mean bullish return minus mean bearish return, in percentage points. */
  spreadPct: number | null;
  /** Combined standard error of that spread. */
  spreadErrorPct: number | null;

  verdict: {
    status: ValidationStatus;
    detail: string;
  };

  coverage: {
    /** Distinct days that carry sentiment for at least one asset. */
    daysWithSentiment: number;
    minSamplesPerBucket: number;
    /** Smallest bucket, which is what actually limits the conclusion. */
    smallestBucket: number;
  };
}
