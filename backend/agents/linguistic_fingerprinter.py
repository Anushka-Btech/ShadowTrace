from __future__ import annotations

import logging
import re
from dataclasses import asdict, dataclass
from typing import Any

import numpy as np

from db.neo4j_client import run_query

logger = logging.getLogger(__name__)

POST_LIMIT = 20


@dataclass(slots=True)
class LinguisticProfile:
    account: str
    average_sentence_length: float
    vocabulary_diversity: float
    punctuation_density: float
    emoji_frequency: float


@dataclass(slots=True)
class LinguisticFingerprintResult:
    score: float
    clusters: list[int]
    accounts: list[str]
    similarity_matrix: list[list[float]]
    profiles: list[LinguisticProfile]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _split_sentences(text: str) -> list[str]:
    pieces = re.split(r"[.!?]+", text)
    return [piece.strip() for piece in pieces if piece.strip()]


def _extract_emojis(text: str) -> int:
    return sum(1 for char in text if 0x1F300 <= ord(char) <= 0x1FAFF)


def _tokenize(text: str) -> list[str]:
    return re.findall(r"\b[\w']+\b", text.lower())


def _fetch_posts(handle: str) -> list[str]:
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

    posts: list[str] = []
    for row in rows:
        post = row.get("p") or {}
        text = str(post.get("text", "")).strip()
        if text:
            posts.append(text)
    return posts


def _profile_for_account(handle: str) -> LinguisticProfile:
    posts = _fetch_posts(handle)
    combined = " ".join(posts)
    sentences = _split_sentences(combined)
    tokens = _tokenize(combined)
    token_count = len(tokens)
    unique_count = len(set(tokens))
    average_sentence_length = float(sum(len(_tokenize(sentence)) for sentence in sentences) / max(1, len(sentences)))
    vocabulary_diversity = float(unique_count / max(1, token_count))
    punctuation_density = float(sum(1 for char in combined if char in ".,;:!?") / max(1, len(combined)))
    emoji_frequency = float(_extract_emojis(combined) / max(1, len(combined)))

    return LinguisticProfile(
        account=handle,
        average_sentence_length=round(average_sentence_length, 3),
        vocabulary_diversity=round(vocabulary_diversity, 3),
        punctuation_density=round(punctuation_density, 3),
        emoji_frequency=round(emoji_frequency, 5),
    )


def _build_feature_matrix(profiles: list[LinguisticProfile]) -> np.ndarray:
    if not profiles:
        return np.zeros((0, 4), dtype=float)
    return np.asarray(
        [
            [
                profile.average_sentence_length,
                profile.vocabulary_diversity,
                profile.punctuation_density,
                profile.emoji_frequency,
            ]
            for profile in profiles
        ],
        dtype=float,
    )


class LinguisticFingerprinter:
    def analyze(self, handles: list[str]) -> LinguisticFingerprintResult:
        profiles = [_profile_for_account(handle) for handle in handles]
        matrix = _build_feature_matrix(profiles)

        if len(profiles) == 0:
            return LinguisticFingerprintResult(0.0, [], [], [], [])

        if len(profiles) == 1:
            clusters = [0]
            similarity_matrix = [[1.0]]
            score = 0.0
        else:
            from sklearn.cluster import DBSCAN
            from sklearn.metrics.pairwise import cosine_similarity
            from sklearn.preprocessing import MinMaxScaler

            scaler = MinMaxScaler()
            features_normalized = scaler.fit_transform(matrix)
            clustering = DBSCAN(eps=0.8, min_samples=2)
            labels = clustering.fit_predict(features_normalized)
            clusters = [int(label) for label in labels]
            similarity = cosine_similarity(matrix)
            similarity_matrix = [[round(float(value), 4) for value in row] for row in similarity]
            non_noise = [label for label in labels if label >= 0]
            cluster_bonus = len(set(non_noise)) / max(1, len(profiles))
            matching_pairs = [
                similarity[i, j]
                for i in range(len(labels))
                for j in range(i + 1, len(labels))
                if labels[i] == labels[j] and labels[i] >= 0
            ]
            within_cluster = float(np.mean(matching_pairs)) if matching_pairs else 0.0
            score = min(100.0, round((cluster_bonus * 55.0) + (within_cluster * 45.0), 2))

        return LinguisticFingerprintResult(
            score=score,
            clusters=clusters,
            accounts=[profile.account for profile in profiles],
            similarity_matrix=similarity_matrix,
            profiles=profiles,
        )
