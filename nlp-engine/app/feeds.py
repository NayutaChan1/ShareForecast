"""RSS sources for financial news.

Kept as plain data so adding a source is a one-line change. Every feed here is
public and needs no API key.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Feed:
    name: str
    url: str


FEEDS: list[Feed] = [
    # Crypto
    Feed("CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
    Feed("Cointelegraph", "https://cointelegraph.com/rss"),
    Feed("Decrypt", "https://decrypt.co/feed"),
    Feed("Bitcoin Magazine", "https://bitcoinmagazine.com/feed"),
    # Equities / macro
    Feed("Yahoo Finance", "https://finance.yahoo.com/news/rssindex"),
    Feed("CNBC Markets", "https://www.cnbc.com/id/20910258/device/rss/rss.html"),
    Feed("MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories"),
    Feed("Investing.com", "https://www.investing.com/rss/news_25.rss"),
    # Indonesia
    Feed("CNBC Indonesia", "https://www.cnbcindonesia.com/market/rss"),
    Feed("Bisnis.com Market", "https://market.bisnis.com/rss"),
]
