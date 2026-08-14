"""Database engine and session helpers."""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

from .config import settings

log = logging.getLogger(__name__)

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, future=True)


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional scope: commits on success, rolls back on error."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def wait_for_db(max_attempts: int = 30, delay: float = 2.0) -> None:
    """Block until Postgres accepts queries.

    Compose health checks cover the container, but the worker and scraper start
    issuing queries immediately and a cold volume can still be mid-init.
    """
    for attempt in range(1, max_attempts + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            log.info("database ready")
            return
        except OperationalError as exc:
            log.warning("database not ready (attempt %d/%d): %s", attempt, max_attempts, exc)
            time.sleep(delay)
    raise RuntimeError(f"database unreachable after {max_attempts} attempts")
