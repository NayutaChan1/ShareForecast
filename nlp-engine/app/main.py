"""FastAPI surface for the NLP engine.

Internal service — only the API gateway talks to it, so there is no CORS setup
and no auth layer here. Do not publish this port outside the compose network.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, HTTPException, Query
from starlette.concurrency import run_in_threadpool

from . import market
from .config import settings
from .schemas import (
    AnalyzeRequest,
    BatchAnalyzeRequest,
    Candle,
    HealthResponse,
    Quote,
    SentimentPayload,
)
from . import sentiment
from .sentiment import analyzer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [nlp-engine] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

app = FastAPI(
    title="Market Sentiment NLP Engine",
    version="0.1.0",
    description="FinBERT sentiment inference and yfinance market data.",
)

# Model loading is CPU-bound and slow; keep it off the event loop.
_loader = ThreadPoolExecutor(max_workers=1, thread_name_prefix="finbert-load")


@app.on_event("startup")
async def warm_up() -> None:
    """Optionally pre-load the model in the background.

    Off by default: this service exists mainly for stock data, and the scoring
    pipeline runs in nlp-worker, so an eager copy here just holds ~1.3 GB idle.
    /analyze still works either way — it loads on first call and blocks on the
    same lock, so early requests are correct, only slower.
    """
    if settings.finbert_eager_load:
        _loader.submit(analyzer.load)
    else:
        log.info("FinBERT will load on first /analyze call (set FINBERT_EAGER_LOAD=true to preload)")


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        model=settings.finbert_model,
        modelLoaded=analyzer.ready,
    )


@app.post("/analyze", response_model=SentimentPayload)
async def analyze(payload: AnalyzeRequest) -> SentimentPayload:
    result = await run_in_threadpool(sentiment.analyze, payload.text, payload.lang)
    return SentimentPayload(**result.as_dict(), score=round(result.score, 6))


@app.post("/analyze/batch", response_model=list[SentimentPayload])
async def analyze_batch(payload: BatchAnalyzeRequest) -> list[SentimentPayload]:
    results = await run_in_threadpool(sentiment.analyze_batch, payload.texts, payload.lang)
    return [SentimentPayload(**r.as_dict(), score=round(r.score, 6)) for r in results]


@app.get("/market/stocks/{symbol}/candles", response_model=list[Candle])
async def stock_candles(
    symbol: str,
    interval: str = Query("1d"),
    limit: int = Query(500, ge=1, le=2000),
) -> list[Candle]:
    try:
        candles = await run_in_threadpool(market.fetch_candles, symbol, interval, limit)
    except market.UnknownIntervalError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except market.NoDataError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - upstream Yahoo failures
        log.exception("yfinance candles failed for %s", symbol)
        raise HTTPException(status_code=502, detail="upstream market data error") from exc
    return [Candle(**c) for c in candles]


@app.get("/market/stocks/{symbol}/quote", response_model=Quote)
async def stock_quote(symbol: str) -> Quote:
    try:
        quote = await run_in_threadpool(market.fetch_quote, symbol)
    except market.NoDataError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        log.exception("yfinance quote failed for %s", symbol)
        raise HTTPException(status_code=502, detail="upstream market data error") from exc
    return Quote(**quote)
