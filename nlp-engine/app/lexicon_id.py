"""Financial sentiment lexicon for Indonesian market headlines.

FinBERT is English-only and collapses Indonesian text to `neutral` with high
confidence — measured on 60 real CNBC Indonesia headlines it returned neutral
for 59 of them, i.e. no signal at all. Off-the-shelf Indonesian sentiment
models (IndoBERT, indonesian-roberta) fail the same way for a different
reason: they are trained on general sentiment, where "IHSG naik 0,75%" is an
emotionally neutral statement of fact rather than a bullish market signal.

Indonesian market headlines are, however, highly formulaic — a small set of
verbs carries almost all of the directional meaning. Scoring those directly
beats both alternatives here at zero memory cost and no inference latency.

Weights are rough magnitudes, not probabilities: "anjlok" (crashed) is a
stronger claim than "turun" (fell).
"""

from __future__ import annotations

import re

BULLISH: dict[str, float] = {
    "naik": 1.0, "menguat": 1.0, "melonjak": 1.3, "meroket": 1.5, "melesat": 1.3,
    "melaju": 1.0, "hijau": 1.0, "untung": 1.0, "laba": 0.8,
    # "rekor" is ambiguous: a record profit is bullish, a record bond yield
    # is not. Kept low so a genuine signal in the same headline outweighs it.
    "rekor": 0.5,
    "cuan": 1.2, "rally": 1.2, "reli": 1.2, "ditopang": 0.7, "positif": 0.8,
    "tumbuh": 0.9, "lonjakan": 1.1, "borong": 0.9, "diborong": 0.9,
    "net buy": 1.1, "perkasa": 1.1, "bangkit": 1.0, "kinclong": 1.2,
    "terbang": 1.3, "sentuh": 0.6, "optimis": 0.9, "pulih": 1.0,
}

BEARISH: dict[str, float] = {
    "turun": 1.0, "melemah": 1.0, "anjlok": 1.5, "ambles": 1.5, "ambruk": 1.5,
    "merosot": 1.2, "jeblok": 1.4, "berguguran": 1.4, "merah": 1.0, "rugi": 1.1,
    "tertekan": 1.0, "koreksi": 0.9, "longsor": 1.4, "net sell": 1.1,
    "negatif": 0.8, "lesu": 1.0, "terpuruk": 1.3, "boncos": 1.3, "terjun": 1.3,
    "seret": 1.0, "kabur": 0.9, "jatuh": 1.2, "tergelincir": 1.1, "loyo": 1.0,
    "pesimis": 0.9, "waspada": 0.6,
    # Risk-off / geopolitical, absent from the first pass: without these a
    # headline like "Trump Ancam Bom Oman ... Tembus Rekor" scored bullish.
    "ancam": 1.1, "ngeri": 0.9, "perang": 1.1, "krisis": 1.2, "konflik": 0.9,
    "serangan": 1.0, "bom": 1.0, "sanksi": 0.9, "resesi": 1.3, "gagal": 1.0,
    "bangkrut": 1.4, "phk": 1.1, "inflasi": 0.6, "tarif": 0.6, "khawatir": 0.9,
}

# Precompiled so scoring a batch does not rebuild the same patterns per article.
_BULL_PATTERNS = [(re.compile(rf"\b{re.escape(k)}\b"), w) for k, w in BULLISH.items()]
_BEAR_PATTERNS = [(re.compile(rf"\b{re.escape(k)}\b"), w) for k, w in BEARISH.items()]

MODEL_NAME = "id-financial-lexicon-v1"

# Matched weight at which the reading is treated as fully confident. Two
# average terms ("IHSG naik ... ditopang") is already a clear signal.
_SATURATION = 2.0

# Ceiling on how strongly a directional reading may be stated.
_MAX_CONFIDENCE = 0.85


def score(text: str) -> tuple[float, float, float]:
    """Return (positive, negative, neutral), summing to 1.

    The magnitude term keeps a headline with a single weak match from reading
    as strongly as one stacking several terms.
    """
    haystack = text.lower()

    bull = sum(w for pattern, w in _BULL_PATTERNS if pattern.search(haystack))
    bear = sum(w for pattern, w in _BEAR_PATTERNS if pattern.search(haystack))
    total = bull + bear

    if total == 0:
        return 0.0, 0.0, 1.0

    direction = (bull - bear) / total          # -1 .. 1
    magnitude = min(1.0, total / _SATURATION)  # 0 .. 1
    signed = direction * magnitude

    # A lexicon cannot justify a 1.00 reading the way a calibrated model can,
    # and the UI shows this number next to FinBERT's. Cap it so the two are
    # not read as equally certain.
    signed = max(-_MAX_CONFIDENCE, min(_MAX_CONFIDENCE, signed))

    return max(signed, 0.0), max(-signed, 0.0), 1.0 - abs(signed)
