"""RabbitMQ topology and connection helpers.

    news-scraper --(sentiment.analyze)--> nlp-worker --(sentiment.results)--> api-gateway

Both queues hang off one direct exchange so the gateway can subscribe to
results without the worker knowing anything about it.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import pika
from pika.adapters.blocking_connection import BlockingChannel
from pika.exceptions import AMQPConnectionError

from .config import settings

log = logging.getLogger(__name__)

EXCHANGE = "market.sentiment"
QUEUE_ANALYZE = "sentiment.analyze"
QUEUE_RESULTS = "sentiment.results"
ROUTING_ANALYZE = "sentiment.analyze"
ROUTING_RESULTS = "sentiment.results"


def connect(max_attempts: int = 30, delay: float = 2.0) -> pika.BlockingConnection:
    """Open a connection, retrying while the broker is still booting."""
    params = pika.URLParameters(settings.amqp_url)
    params.heartbeat = 60
    params.blocked_connection_timeout = 30

    for attempt in range(1, max_attempts + 1):
        try:
            conn = pika.BlockingConnection(params)
            log.info("connected to RabbitMQ")
            return conn
        except AMQPConnectionError as exc:
            log.warning("broker not ready (attempt %d/%d): %s", attempt, max_attempts, exc)
            time.sleep(delay)
    raise RuntimeError(f"RabbitMQ unreachable after {max_attempts} attempts")


def declare_topology(channel: BlockingChannel) -> None:
    """Idempotently declare the exchange, queues, and bindings."""
    channel.exchange_declare(exchange=EXCHANGE, exchange_type="direct", durable=True)

    for queue, routing_key in (
        (QUEUE_ANALYZE, ROUTING_ANALYZE),
        (QUEUE_RESULTS, ROUTING_RESULTS),
    ):
        channel.queue_declare(queue=queue, durable=True)
        channel.queue_bind(queue=queue, exchange=EXCHANGE, routing_key=routing_key)


def publish(channel: BlockingChannel, routing_key: str, payload: dict[str, Any]) -> None:
    channel.basic_publish(
        exchange=EXCHANGE,
        routing_key=routing_key,
        body=json.dumps(payload).encode(),
        properties=pika.BasicProperties(
            content_type="application/json",
            delivery_mode=pika.DeliveryMode.Persistent,
        ),
    )
