"""News scraper service.

Polls every RSS source on a fixed interval, stores anything new, tags it with
the assets it mentions, and enqueues an analysis task per article.

Run as: python -m app.scraper
"""

from __future__ import annotations

import logging
import re
import signal
import sys
from datetime import datetime, timezone
from time import mktime

import feedparser
from apscheduler.schedulers.blocking import BlockingScheduler
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from . import queue as mq
from .config import settings
from .db import session_scope, wait_for_db
from .feeds import FEEDS, Feed
from .models import ArticleAsset, Asset, NewsArticle

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [scraper] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(value: str | None) -> str | None:
    if not value:
        return None
    return _TAG_RE.sub("", value).strip() or None


def _published_at(entry) -> datetime:
    """Best-effort publication timestamp, defaulting to now."""
    parsed = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
    if parsed:
        return datetime.fromtimestamp(mktime(parsed), tz=timezone.utc)
    return datetime.now(timezone.utc)


def _match_assets(text: str, assets: list[Asset]) -> list[int]:
    """Return ids of assets whose keywords appear in the text.

    Word-boundary matching keeps "eth" from firing on "whether" and "bri" from
    firing on "brief".
    """
    haystack = text.lower()
    matched: list[int] = []
    for asset in assets:
        for keyword in asset.keywords:
            if re.search(rf"\b{re.escape(keyword.lower())}\b", haystack):
                matched.append(asset.id)
                break
    return matched


def _store_article(
    session: Session, feed: Feed, entry, assets: list[Asset]
) -> int | None:
    """Insert one article. Returns its id, or None if we already had it."""
    url = getattr(entry, "link", None)
    title = _strip_html(getattr(entry, "title", None))
    if not url or not title:
        return None

    stmt = (
        pg_insert(NewsArticle)
        .values(
            source=feed.name,
            title=title,
            url=url,
            summary=_strip_html(getattr(entry, "summary", None)),
            published_at=_published_at(entry),
            scraped_at=datetime.now(timezone.utc),
            analyzed=False,
        )
        # The URL unique index is what makes re-polling a feed cheap.
        .on_conflict_do_nothing(index_elements=["url"])
        .returning(NewsArticle.id)
    )
    article_id = session.execute(stmt).scalar_one_or_none()
    if article_id is None:
        return None

    summary = _strip_html(getattr(entry, "summary", None)) or ""
    for asset_id in _match_assets(f"{title} {summary}", assets):
        session.execute(
            pg_insert(ArticleAsset)
            .values(article_id=article_id, asset_id=asset_id)
            .on_conflict_do_nothing()
        )

    return article_id


def scrape_once(channel) -> int:
    """One full pass over every feed. Returns the number of new articles."""
    new_ids: list[int] = []

    with session_scope() as session:
        assets = list(session.scalars(select(Asset)))

        for feed in FEEDS:
            try:
                parsed = feedparser.parse(feed.url)
            except Exception as exc:  # noqa: BLE001 - one bad feed must not kill the pass
                log.warning("failed to fetch %s: %s", feed.name, exc)
                continue

            if parsed.bozo and not parsed.entries:
                log.warning("no entries from %s (%s)", feed.name, parsed.get("bozo_exception"))
                continue

            for entry in parsed.entries[: settings.scrape_max_items]:
                try:
                    article_id = _store_article(session, feed, entry, assets)
                except Exception as exc:  # noqa: BLE001
                    log.warning("skipped an entry from %s: %s", feed.name, exc)
                    continue
                if article_id is not None:
                    new_ids.append(article_id)

    # Publish only after the transaction committed, so the worker can never
    # look up an article id that is not there yet.
    for article_id in new_ids:
        mq.publish(channel, mq.ROUTING_ANALYZE, {"article_id": article_id})

    log.info("scrape pass complete: %d new article(s) queued", len(new_ids))
    return len(new_ids)


def main() -> None:
    wait_for_db()
    connection = mq.connect()
    channel = connection.channel()
    mq.declare_topology(channel)

    scheduler = BlockingScheduler(timezone="UTC")
    scheduler.add_job(
        scrape_once,
        trigger="interval",
        minutes=settings.scrape_interval_minutes,
        args=[channel],
        id="rss-scrape",
        max_instances=1,
        coalesce=True,
    )

    def shutdown(*_args) -> None:
        log.info("shutting down")
        scheduler.shutdown(wait=False)
        connection.close()
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    # Don't make the first batch wait a full interval.
    scrape_once(channel)

    log.info("scheduled every %d minute(s)", settings.scrape_interval_minutes)
    scheduler.start()


if __name__ == "__main__":
    main()
