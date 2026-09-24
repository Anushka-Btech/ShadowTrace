"""Live account ingestion from the Bluesky public API.

Fetches any real account's recent posts (no auth required) and merges them
into the Neo4j graph, so the temporal/linguistic/AI-operation agents analyze
live internet accounts through the exact same queries they use for seeded data.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import requests

from db.neo4j_client import run_query

logger = logging.getLogger(__name__)

BLUESKY_FEED_URL = "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed"
REQUEST_TIMEOUT = 12
POST_LIMIT = 20


def _normalize_handle(handle: str) -> str:
    cleaned = handle.strip().lstrip("@").lower()
    # Bare names like "jay" resolve as jay.bsky.social
    if cleaned and "." not in cleaned:
        cleaned = f"{cleaned}.bsky.social"
    return cleaned


def _iso_to_epoch(value: str) -> int:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return int(dt.astimezone(timezone.utc).timestamp())


def fetch_bluesky_posts(handle: str) -> list[dict]:
    """Fetch the account's own recent posts (reposts and replies excluded)."""
    actor = _normalize_handle(handle)
    if not actor:
        return []
    response = requests.get(
        BLUESKY_FEED_URL,
        params={"actor": actor, "limit": 50, "filter": "posts_no_replies"},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    feed = response.json().get("feed", [])

    posts: list[dict] = []
    for item in feed:
        post = item.get("post") or {}
        record = post.get("record") or {}
        author = (post.get("author") or {}).get("handle", "")
        # Skip reposts of other accounts
        if item.get("reason") is not None or author != actor:
            continue
        text = str(record.get("text", "")).strip()
        created = record.get("createdAt")
        if not text or not created:
            continue
        try:
            timestamp = _iso_to_epoch(str(created))
        except Exception:
            continue
        posts.append({"id": post.get("uri") or f"bsky:{actor}:{timestamp}", "text": text, "timestamp": timestamp})
        if len(posts) >= POST_LIMIT:
            break
    return posts


def _graph_post_count(handle: str) -> int:
    rows = run_query(
        "MATCH (a:Account {handle:$handle})-[:SHARED]->(p:Post) RETURN count(p) AS n",
        {"handle": handle},
    )
    return int(rows[0]["n"]) if rows else 0


def _ingest_posts(handle: str, posts: list[dict]) -> None:
    run_query(
        """
        MERGE (a:Account {handle:$handle})
        ON CREATE SET a.key = 'live:' + $handle, a.source = 'bluesky'
        WITH a
        UNWIND $posts AS post
        MERGE (p:Post {id: post.id})
        SET p.text = post.text, p.timestamp = post.timestamp
        MERGE (a)-[:SHARED]->(p)
        """,
        {"handle": handle, "posts": posts},
    )


def ensure_account_data(handle: str) -> str:
    """Make sure the graph has posts for this handle before analysis runs.

    Returns 'graph' if seeded/previously ingested data exists, 'bluesky' if
    live posts were fetched and ingested, 'none' if no data could be found.
    Never raises — analysis proceeds either way.
    """
    try:
        if _graph_post_count(handle) > 0:
            return "graph"
    except Exception as exc:
        logger.warning("Neo4j lookup failed for %s: %s", handle, exc)
        return "none"

    try:
        posts = fetch_bluesky_posts(handle)
    except Exception as exc:
        logger.info("Bluesky fetch failed for %s: %s", handle, exc)
        return "none"
    if not posts:
        return "none"

    try:
        _ingest_posts(handle, posts)
        logger.info("Ingested %d live Bluesky posts for %s", len(posts), handle)
        return "bluesky"
    except Exception as exc:
        logger.warning("Neo4j ingest failed for %s: %s", handle, exc)
        return "none"
