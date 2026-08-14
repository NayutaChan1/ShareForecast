"""Sentiment worker.

Consumes `sentiment.analyze`, runs FinBERT over the article headline+summary,
persists the score, and republishes the enriched result on `sentiment.results`
for the API gateway to fan out over WebSocket.

Run as: python -m app.worker
"""

from __future__ import annotations

import json
import logging
import signal
import sys
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from . import queue as mq
from .db import session_scope, wait_for_db
from .models import ArticleAsset, Asset, NewsArticle, SentimentScore
from .sentiment import analyzer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [worker] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)


def _handle(article_id: int) -> dict | None:
    """Analyse one article. Returns the payload to publish, or None to skip."""
    with session_scope() as session:
        article = session.get(NewsArticle, article_id)
        if article is None:
            log.warning("article %s no longer exists", article_id)
            return None

        existing = session.scalar(
            select(SentimentScore).where(SentimentScore.article_id == article_id)
        )
        if existing is not None:
            log.info("article %s already scored, skipping", article_id)
            return None

        text = article.title
        if article.summary:
            text = f"{article.title}. {article.summary}"

        result = analyzer.analyze(text)

        session.execute(
            pg_insert(SentimentScore)
            .values(
                article_id=article_id,
                label=result.label,
                confidence=result.confidence,
                positive=result.positive,
                negative=result.negative,
                neutral=result.neutral,
                model=result.model,
                created_at=datetime.now(timezone.utc),
            )
            .on_conflict_do_nothing(index_elements=["article_id"])
        )
        session.execute(
            update(NewsArticle).where(NewsArticle.id == article_id).values(analyzed=True)
        )

        symbols = list(
            session.scalars(
                select(Asset.symbol)
                .join(ArticleAsset, ArticleAsset.asset_id == Asset.id)
                .where(ArticleAsset.article_id == article_id)
            )
        )

        return {
            "article_id": article_id,
            "title": article.title,
            "url": article.url,
            "source": article.source,
            "published_at": article.published_at.isoformat(),
            "symbols": symbols,
            "sentiment": {
                "label": result.label,
                "confidence": result.confidence,
                "positive": result.positive,
                "negative": result.negative,
                "neutral": result.neutral,
                "score": round(result.score, 6),
            },
        }


def _on_message(channel, method, _properties, body: bytes) -> None:
    try:
        message = json.loads(body)
        article_id = int(message["article_id"])
    except (ValueError, KeyError, TypeError) as exc:
        log.error("malformed message dropped: %s (%r)", exc, body[:200])
        # Unparseable payloads will never succeed on redelivery.
        channel.basic_ack(delivery_tag=method.delivery_tag)
        return

    try:
        payload = _handle(article_id)
    except Exception:  # noqa: BLE001
        log.exception("failed to analyse article %s, requeueing", article_id)
        channel.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
        return

    if payload is not None:
        mq.publish(channel, mq.ROUTING_RESULTS, payload)
        log.info(
            "article %s -> %s (%.2f)",
            article_id,
            payload["sentiment"]["label"],
            payload["sentiment"]["confidence"],
        )

    channel.basic_ack(delivery_tag=method.delivery_tag)


def main() -> None:
    wait_for_db()

    # Pull the weights before taking any work, so the first message isn't
    # stuck behind a multi-hundred-MB download while its ack timer runs.
    log.info("warming up FinBERT")
    analyzer.load()

    connection = mq.connect()
    channel = connection.channel()
    mq.declare_topology(channel)

    # One in flight at a time: inference is the bottleneck, and a deep prefetch
    # buffer would just sit idle in this process.
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=mq.QUEUE_ANALYZE, on_message_callback=_on_message)

    def shutdown(*_args) -> None:
        log.info("shutting down")
        try:
            channel.stop_consuming()
            connection.close()
        finally:
            sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    log.info("waiting for messages on %s", mq.QUEUE_ANALYZE)
    channel.start_consuming()


if __name__ == "__main__":
    main()
