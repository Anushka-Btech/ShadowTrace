from __future__ import annotations

import logging
import os
import statistics
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from itertools import combinations
from typing import Any

import feedparser
import requests

from db.neo4j_client import run_query

logger = logging.getLogger(__name__)

NITTER_BASE = os.getenv("NITTER_BASE_URL", "https://nitter.poast.org")
NITTER_RSS_URL = f"{NITTER_BASE}/{{handle}}/rss"
REQUEST_TIMEOUT = 10
COORDINATION_WINDOW_SECONDS = 60
POST_LIMIT = 20


@dataclass(slots=True)
class TimelinePost:
    timestamp: int
    text_preview: str


@dataclass(slots=True)
class AccountTimeline:
    account: str
    posts: list[TimelinePost]


@dataclass(slots=True)
class TemporalCoordinationResult:
    score: int
    confidence: float
    flagged_pairs: int
    median_delay_seconds: float
    timeline: list[AccountTimeline]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _clean_text(text: str) -> str:
    try:
        from bs4 import BeautifulSoup

        cleaned = BeautifulSoup(text or "", "html.parser").get_text(" ", strip=True)
    except ImportError:
        cleaned = text or ""
    return " ".join(cleaned.split())


def _parse_timestamp(value: str | None) -> int:
    if not value:
        raise ValueError("missing timestamp")
    try:
        parsed_dt = parsedate_to_datetime(value)
        if parsed_dt.tzinfo is None:
            parsed_dt = parsed_dt.replace(tzinfo=timezone.utc)
        return int(parsed_dt.astimezone(timezone.utc).timestamp())
    except Exception:
        parsed_dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return int(parsed_dt.astimezone(timezone.utc).timestamp())


def _normalize_timestamp(value: Any) -> int:
    if value is None:
        raise ValueError("missing timestamp")
    if isinstance(value, (int, float)):
        dt = datetime.fromtimestamp(float(value), tz=timezone.utc)
        return int(dt.timestamp())
    text = str(value)
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return int(dt.astimezone(timezone.utc).timestamp())
    except Exception:
        return _parse_timestamp(text)


def _fetch_posts_from_neo4j(handle: str) -> list[TimelinePost]:
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

    posts: list[TimelinePost] = []
    for row in rows:
        post = row.get("p") or {}
        try:
            timestamp = _normalize_timestamp(post.get("timestamp"))
        except Exception:
            continue
        posts.append(
            TimelinePost(
                timestamp=timestamp,
                text_preview=_clean_text(str(post.get("text", "")))[:120],
            )
        )
    return posts


def _fetch_posts_from_nitter(handle: str) -> list[TimelinePost]:
    try:
        url = NITTER_RSS_URL.format(handle=handle.lstrip("@"))
        response = requests.get(url, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        feed = feedparser.parse(response.text)

        posts: list[TimelinePost] = []
        for entry in feed.entries[:POST_LIMIT]:
            try:
                timestamp = _normalize_timestamp(
                    entry.get("published") or entry.get("updated") or entry.get("created")
                )
            except Exception:
                continue
            text = _clean_text(str(entry.get("title", "")))
            posts.append(TimelinePost(timestamp=timestamp, text_preview=text[:120]))
        return posts
    except Exception as exc:
        logger.warning("Unable to fetch %s from Nitter: %s", handle, exc)
        return []


def _load_account_timeline(handle: str) -> AccountTimeline:
    posts = _fetch_posts_from_neo4j(handle)
    if not posts:
        posts = _fetch_posts_from_nitter(handle)
    return AccountTimeline(account=handle, posts=posts)


def _calculate_coordination(timelines: list[AccountTimeline]) -> tuple[int, float, int, float]:
    delays: list[float] = []
    flagged_pairs = 0

    for left, right in combinations(timelines, 2):
        for p1 in left.posts:
            for p2 in right.posts:
                delay = abs(p1.timestamp - p2.timestamp)
                if delay <= COORDINATION_WINDOW_SECONDS:
                    flagged_pairs += 1
                    delays.append(float(delay))

    if not delays:
        return 0, 0.0, 0, 0.0

    median_delay = float(statistics.median(delays))
    pair_count = max(1, len(timelines) * (len(timelines) - 1) // 2)
    density = flagged_pairs / pair_count
    score = int(
        min(
            100,
            round(
                min(1.0, density / 3.0) * 60
                + max(0.0, (COORDINATION_WINDOW_SECONDS - median_delay) / COORDINATION_WINDOW_SECONDS) * 40
            ),
        )
    )
    confidence = round(min(1.0, 0.35 + (flagged_pairs * 0.08) + ((COORDINATION_WINDOW_SECONDS - median_delay) / COORDINATION_WINDOW_SECONDS) * 0.4), 2)
    return score, confidence, flagged_pairs, round(median_delay, 2)


class TemporalCoordinator:
    def analyze(self, handles: list[str]) -> TemporalCoordinationResult:
        timelines = [_load_account_timeline(handle) for handle in handles]
        score, confidence, flagged_pairs, median_delay = _calculate_coordination(timelines)
        return TemporalCoordinationResult(
            score=score,
            confidence=confidence,
            flagged_pairs=flagged_pairs,
            median_delay_seconds=median_delay,
            timeline=timelines,
        )
