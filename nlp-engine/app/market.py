"""Stock market data via yfinance.

yfinance is Python-only, so the equities half of the market data lives here and
the NestJS gateway proxies it. Crypto goes straight to Binance from the gateway.
"""

from __future__ import annotations

import logging
from typing import Any

import yfinance as yf

log = logging.getLogger(__name__)

# Our interval vocabulary -> (yfinance interval, default lookback period).
# Yahoo caps intraday history hard: 1m is 7 days, other intraday is 60 days.
_INTERVALS: dict[str, tuple[str, str]] = {
    "1m": ("1m", "5d"),
    "5m": ("5m", "1mo"),
    "15m": ("15m", "1mo"),
    "30m": ("30m", "1mo"),
    "1h": ("1h", "3mo"),
    "1d": ("1d", "2y"),
    "1w": ("1wk", "5y"),
}

SUPPORTED_INTERVALS = tuple(_INTERVALS)


class UnknownIntervalError(ValueError):
    pass


class NoDataError(LookupError):
    pass


def fetch_candles(symbol: str, interval: str = "1d", limit: int = 500) -> list[dict[str, Any]]:
    """Return up to `limit` most recent candles, oldest first."""
    if interval not in _INTERVALS:
        raise UnknownIntervalError(
            f"interval '{interval}' not supported; use one of {', '.join(SUPPORTED_INTERVALS)}"
        )

    yf_interval, period = _INTERVALS[interval]
    ticker = yf.Ticker(symbol)
    frame = ticker.history(period=period, interval=yf_interval, auto_adjust=False)

    if frame is None or frame.empty:
        raise NoDataError(f"no market data for '{symbol}'")

    frame = frame.dropna(subset=["Open", "High", "Low", "Close"]).tail(limit)

    candles: list[dict[str, Any]] = []
    for timestamp, row in frame.iterrows():
        candles.append(
            {
                # Seconds since epoch — what Lightweight Charts expects.
                "time": int(timestamp.timestamp()),
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
                "volume": float(row.get("Volume") or 0),
            }
        )
    return candles


def fetch_quote(symbol: str) -> dict[str, Any]:
    """Latest price plus change over the previous close."""
    ticker = yf.Ticker(symbol)
    frame = ticker.history(period="2d", interval="1d", auto_adjust=False)

    if frame is None or frame.empty:
        raise NoDataError(f"no market data for '{symbol}'")

    last_close = float(frame["Close"].iloc[-1])
    prev_close = float(frame["Close"].iloc[-2]) if len(frame) > 1 else last_close
    change = last_close - prev_close

    return {
        "symbol": symbol.upper(),
        "price": last_close,
        "previousClose": prev_close,
        "change": change,
        "changePercent": (change / prev_close * 100) if prev_close else 0.0,
        "time": int(frame.index[-1].timestamp()),
    }
