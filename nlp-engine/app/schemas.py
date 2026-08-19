"""Request/response models for the FastAPI surface."""

from __future__ import annotations

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    # "id" routes to the Indonesian lexicon; anything else uses FinBERT.
    lang: str = Field(default="en", max_length=8)


class BatchAnalyzeRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=64)
    lang: str = Field(default="en", max_length=8)


class SentimentPayload(BaseModel):
    label: str
    confidence: float
    positive: float
    negative: float
    neutral: float
    score: float
    model: str


class Candle(BaseModel):
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float


class Quote(BaseModel):
    symbol: str
    price: float
    previousClose: float
    change: float
    changePercent: float
    time: int


class HealthResponse(BaseModel):
    status: str
    model: str
    modelLoaded: bool
