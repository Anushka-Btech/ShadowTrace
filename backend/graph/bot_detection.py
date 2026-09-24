from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class BotScore:
    score: float
    indicators: dict[str, float]


def calculate_bot_scores_neo4j(campaign_id: str) -> list[dict[str, Any]]:
    """Score every account in a campaign via Cypher and store it on the node.

    Primary scoring path — runs entirely inside AuraDB and persists
    a.bot_score back onto each Account node.
    """
    from db.neo4j_client import run_query

    return run_query(
        """
        MATCH (a:Account)-[:PART_OF]->(c:Campaign {id: $campaign_id})
        SET a.bot_score = (
          CASE WHEN a.post_count > 50 THEN 0.25 ELSE 0 END +
          CASE WHEN a.age_days < 30 THEN 0.20 ELSE 0 END +
          CASE WHEN a.following > a.followers * 10 THEN 0.20 ELSE 0 END
        )
        RETURN a.handle AS handle, a.bot_score AS bot_score
        ORDER BY a.bot_score DESC
        """,
        {"campaign_id": campaign_id},
    )


def calculate_bot_score(metadata: dict[str, Any], posting_frequency: float, connectivity: float) -> BotScore:
    """Estimate bot likelihood from metadata and graph behavior."""

    age_days = float(metadata.get("account_age_days", 365))
    verified = bool(metadata.get("verified", False))
    followers = float(metadata.get("followers", 0))
    following = float(metadata.get("following", 1))
    ratio = followers / max(1.0, following)

    age_signal = max(0.0, 1.0 - min(age_days / 365.0, 1.0))
    freq_signal = min(posting_frequency / 20.0, 1.0)
    conn_signal = min(connectivity / 10.0, 1.0)
    ratio_signal = 1.0 if ratio < 0.3 else 0.45 if ratio < 1.0 else 0.15
    verified_signal = 0.0 if verified else 0.15
    pagerank_signal = min(float(metadata.get("pagerank", 0.0)) * 25.0, 1.0)
    betweenness_signal = min(float(metadata.get("betweenness", 0.0)) * 20.0, 1.0)
    clustering_signal = 1.0 - min(float(metadata.get("clustering", 0.0)), 1.0)

    score = 100.0 * min(
        1.0,
        0.22 * age_signal
        + 0.18 * freq_signal
        + 0.14 * conn_signal
        + 0.12 * ratio_signal
        + 0.08 * pagerank_signal
        + 0.1 * betweenness_signal
        + 0.1 * clustering_signal
        + verified_signal,
    )
    return BotScore(round(score, 2), {
        "age_signal": round(age_signal, 3),
        "frequency_signal": round(freq_signal, 3),
        "connectivity_signal": round(conn_signal, 3),
        "ratio_signal": round(ratio_signal, 3),
        "pagerank_signal": round(pagerank_signal, 3),
        "betweenness_signal": round(betweenness_signal, 3),
        "clustering_signal": round(clustering_signal, 3),
        "verified_signal": round(verified_signal, 3),
    })
