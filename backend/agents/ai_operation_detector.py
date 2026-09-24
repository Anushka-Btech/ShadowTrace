from __future__ import annotations

import logging
import math
import re
from collections import Counter
from dataclasses import asdict, dataclass
from typing import Any

import numpy as np

from db.neo4j_client import run_query

logger = logging.getLogger(__name__)

POST_LIMIT = 20


@dataclass(slots=True)
class AISignal:
    account: str
    burstiness: float
    perplexity: float
    semantic_consistency: float
    topic_drift: float
    post_count: int = 0


@dataclass(slots=True)
class AIOperationDetectionResult:
    score: float
    signals: list[AISignal]
    verdict: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _tokenize(text: str) -> list[str]:
    return re.findall(r"\b[\w']+\b", text.lower())


def _sentence_split(text: str) -> list[str]:
    parts = re.split(r"[.!?]+", text)
    return [part.strip() for part in parts if part.strip()]


def _fetch_posts(handle: str) -> list[dict[str, Any]]:
    try:
        rows = run_query(
            """
            MATCH (a:Account {handle:$handle})-[:SHARED]->(p:Post)
            RETURN p
            ORDER BY p.timestamp DESC
            LIMIT $limit
            """,
            {"handle": handle, "limit": POST_LIMIT},
        )
    except Exception as exc:
        logger.warning("Neo4j lookup failed for %s: %s", handle, exc)
        return []
    return [row.get("p") or {} for row in rows]


def _bigram_perplexity(texts: list[str]) -> float:
    tokens = []
    for text in texts:
        tokens.extend(_tokenize(text))
    if len(tokens) < 2:
        return 1.0

    bigrams = Counter(zip(tokens, tokens[1:]))
    unigrams = Counter(tokens)
    vocabulary = len(unigrams)
    log_prob_sum = 0.0
    count = 0
    for left, right in zip(tokens, tokens[1:]):
        numerator = bigrams[(left, right)] + 1
        denominator = unigrams[left] + vocabulary
        log_prob_sum += -math.log(numerator / denominator)
        count += 1
    return float(math.exp(log_prob_sum / max(1, count)))


def _load_sentence_model():
    try:
        from sentence_transformers import SentenceTransformer
    except Exception:  # pragma: no cover - optional dependency fallback
        return None
    try:
        return SentenceTransformer("all-MiniLM-L6-v2")
    except Exception:
        return None


class AIOperationDetector:
    def __init__(self) -> None:
        self._sentence_model = _load_sentence_model()

    def analyze(self, handles: list[str]) -> AIOperationDetectionResult:
        signals: list[AISignal] = []
        for handle in handles:
            posts = _fetch_posts(handle)
            texts = [str(post.get("text", "")) for post in posts if str(post.get("text", "")).strip()]
            signal = self._analyze_account(handle, texts)
            signals.append(signal)

        if not signals:
            return AIOperationDetectionResult(score=0.0, signals=[], verdict="LIKELY_HUMAN")

        score = float(np.mean([self._score_signal(signal) for signal in signals]))
        if score >= 75:
            verdict = "LIKELY_AI"
        elif score >= 45:
            verdict = "POSSIBLY_AI"
        else:
            verdict = "LIKELY_HUMAN"
        return AIOperationDetectionResult(score=round(score, 2), signals=signals, verdict=verdict)

    def _analyze_account(self, handle: str, texts: list[str]) -> AISignal:
        burstiness = self._burstiness(texts)
        perplexity = _bigram_perplexity(texts)
        semantic_consistency = self._semantic_consistency(texts)
        topic_drift = self._topic_drift(texts)
        return AISignal(
            account=handle,
            burstiness=round(burstiness, 4),
            perplexity=round(perplexity, 4),
            semantic_consistency=round(semantic_consistency, 4),
            topic_drift=round(topic_drift, 4),
            post_count=len(texts),
        )

    @staticmethod
    def _burstiness(texts: list[str]) -> float:
        if len(texts) < 2:
            return 0.0
        lengths = [len(_tokenize(text)) for text in texts]
        mean = float(np.mean(lengths))
        std = float(np.std(lengths))
        return std / max(1.0, mean)

    def _semantic_consistency(self, texts: list[str]) -> float:
        if len(texts) < 2:
            return 1.0
        model = self._sentence_model
        if model is None:
            return self._lexical_consistency(texts)
        try:
            embeddings = model.encode(texts, normalize_embeddings=True)
            similarity = np.asarray(embeddings) @ np.asarray(embeddings).T
            upper = similarity[np.triu_indices(len(texts), k=1)]
            return float(np.clip(np.mean(upper), 0.0, 1.0)) if upper.size else 1.0
        except Exception:
            return self._lexical_consistency(texts)

    @staticmethod
    def _lexical_consistency(texts: list[str]) -> float:
        if len(texts) < 2:
            return 1.0
        token_sets = [set(_tokenize(text)) for text in texts]
        scores = []
        for i in range(len(token_sets)):
            for j in range(i + 1, len(token_sets)):
                union = token_sets[i] | token_sets[j]
                scores.append(len(token_sets[i] & token_sets[j]) / max(1, len(union)))
        return float(np.mean(scores)) if scores else 1.0

    @staticmethod
    def _topic_drift(texts: list[str]) -> float:
        if len(texts) < 2:
            return 0.0
        token_sets = [set(_tokenize(text)) for text in texts]
        drift_scores = []
        for i in range(1, len(token_sets)):
            prev = token_sets[i - 1]
            curr = token_sets[i]
            union = prev | curr
            drift_scores.append(1.0 - (len(prev & curr) / max(1, len(union))))
        return float(np.mean(drift_scores)) if drift_scores else 0.0

    @staticmethod
    def _score_signal(signal: AISignal) -> float:
        # Too few posts to profile — return a low-confidence neutral score
        if signal.post_count < 3:
            return 25.0
        # LLM tells: unnaturally regular post lengths, low-perplexity text,
        # high internal similarity, minimal topic drift. Human baselines from
        # live accounts: burstiness 0.5-1.0, perplexity 100-160,
        # consistency <0.1, drift >0.9.
        regularity_score = max(0.0, (1.0 - signal.burstiness)) * 100.0
        low_perplexity_score = max(0.0, min(100.0, (150.0 - signal.perplexity) / 1.5))
        consistency_score = min(100.0, signal.semantic_consistency * 200.0)
        low_drift_score = max(0.0, (1.0 - signal.topic_drift)) * 100.0
        return 0.25 * regularity_score + 0.25 * low_perplexity_score + 0.25 * consistency_score + 0.25 * low_drift_score
