"""FinBERT sentiment inference.

ProsusAI/finbert emits positive / negative / neutral over financial text. We
surface those as bullish / bearish / neutral, which is what the chart overlay
and the rest of the platform speak.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, asdict
from typing import Any

from . import lexicon_id
from .config import settings

log = logging.getLogger(__name__)

# FinBERT's own label vocabulary -> ours.
_LABEL_MAP = {
    "positive": "bullish",
    "negative": "bearish",
    "neutral": "neutral",
}

# FinBERT is a BERT-base model: anything past 512 tokens is dropped anyway, and
# a headline plus lede is well inside that.
_MAX_LENGTH = 512


@dataclass(frozen=True)
class SentimentResult:
    label: str
    confidence: float
    positive: float
    negative: float
    neutral: float
    model: str

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)

    @property
    def score(self) -> float:
        """Signed sentiment in [-1, 1], for plotting a continuous line."""
        return self.positive - self.negative


class SentimentAnalyzer:
    """Lazily-loaded FinBERT classifier.

    Weights are ~440 MB and take a while to pull on first run, so loading is
    deferred until the first inference instead of blocking process startup.
    """

    def __init__(self, model_name: str | None = None, device: str | None = None) -> None:
        self.model_name = model_name or settings.finbert_model
        self.device = device or settings.finbert_device
        self._pipeline = None
        self._lock = threading.Lock()

    @property
    def ready(self) -> bool:
        return self._pipeline is not None

    def load(self) -> None:
        """Load the model. Safe to call from multiple threads."""
        if self._pipeline is not None:
            return
        with self._lock:
            if self._pipeline is not None:
                return
            # Imported here so the scraper process never pays the torch import cost.
            import torch
            from transformers import pipeline

            # Must be set before the first inference, and it caps the thread
            # pool for this whole process.
            torch.set_num_threads(settings.torch_threads)

            log.info(
                "loading FinBERT model %s on %s (%d torch threads)",
                self.model_name,
                self.device,
                settings.torch_threads,
            )
            self._pipeline = pipeline(
                task="text-classification",
                model=self.model_name,
                tokenizer=self.model_name,
                device=-1 if self.device == "cpu" else 0,
                top_k=None,  # return the full distribution, not just the argmax
                truncation=True,
                max_length=_MAX_LENGTH,
            )
            log.info("FinBERT ready")

    def analyze(self, text: str) -> SentimentResult:
        return self.analyze_batch([text])[0]

    def analyze_batch(self, texts: list[str]) -> list[SentimentResult]:
        if not texts:
            return []
        self.load()

        # Empty strings make the tokenizer unhappy; a space is harmless filler.
        cleaned = [t.strip() or " " for t in texts]
        raw_batches = self._pipeline(cleaned)

        results: list[SentimentResult] = []
        for scores in raw_batches:
            dist = {_LABEL_MAP[s["label"].lower()]: float(s["score"]) for s in scores}
            top = max(dist.items(), key=lambda kv: kv[1])
            results.append(
                SentimentResult(
                    label=top[0],
                    confidence=round(top[1], 6),
                    positive=round(dist.get("bullish", 0.0), 6),
                    negative=round(dist.get("bearish", 0.0), 6),
                    neutral=round(dist.get("neutral", 0.0), 6),
                    model=self.model_name,
                )
            )
        return results


analyzer = SentimentAnalyzer()


def _from_distribution(
    positive: float, negative: float, neutral: float, model: str
) -> SentimentResult:
    """Build a result from an already-normalised distribution."""
    dist = {"bullish": positive, "bearish": negative, "neutral": neutral}
    label, confidence = max(dist.items(), key=lambda kv: kv[1])
    return SentimentResult(
        label=label,
        confidence=round(confidence, 6),
        positive=round(positive, 6),
        negative=round(negative, 6),
        neutral=round(neutral, 6),
        model=model,
    )


def analyze(text: str, lang: str = "en") -> SentimentResult:
    """Score one article, routed to whatever actually works for its language.

    Indonesian goes to the lexicon rather than FinBERT — see lexicon_id for the
    measurements behind that. Anything else falls through to FinBERT.
    """
    if lang == "id":
        positive, negative, neutral = lexicon_id.score(text)
        return _from_distribution(positive, negative, neutral, lexicon_id.MODEL_NAME)
    return analyzer.analyze(text)


def analyze_batch(texts: list[str], lang: str = "en") -> list[SentimentResult]:
    if lang == "id":
        return [analyze(t, lang) for t in texts]
    return analyzer.analyze_batch(texts)
