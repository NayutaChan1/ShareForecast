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
    # Language of this feed's articles. Sentiment routing keys off this rather
    # than detecting per-article: a feed never mixes languages, so the source
    # is both free and exact where a detector on a short headline is neither.
    lang: str = "en"


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
    # Indonesia. Bisnis.com and IDN Financials are deliberately absent: both
    # serve malformed XML that feedparser cannot read at all.
    Feed("CNBC Indonesia", "https://www.cnbcindonesia.com/market/rss", lang="id"),
    Feed("Detik Finance", "https://finance.detik.com/rss", lang="id"),
    Feed("Kontan Investasi", "https://investasi.kontan.co.id/rss", lang="id"),
    Feed("Antara Ekonomi", "https://www.antaranews.com/rss/ekonomi.xml", lang="id"),
]


# Feed name -> language, for the worker to route an article to the right model.
FEED_LANGUAGES: dict[str, str] = {feed.name: feed.lang for feed in FEEDS}


def language_for(source: str) -> str:
    """Language of a stored article, by the source name it was saved under."""
    return FEED_LANGUAGES.get(source, "en")
