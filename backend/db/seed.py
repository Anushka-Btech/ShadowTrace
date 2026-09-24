from __future__ import annotations

import json
from datetime import datetime, timezone
from itertools import combinations
from pathlib import Path
from typing import Any

from db.neo4j_client import run_query
from db.seed_demo import seed_demo_accounts

DATA_DIR = Path(__file__).parent.parent / "data"

# Maps teammate's JSON files onto the campaign identities the frontend uses
CAMPAIGN_META = {
    "campaign_1.json": {"id": "campaign-001", "name": "Operation Pulse", "threat_level": "HIGH", "confidence": 0.92},
    "campaign_2.json": {"id": "campaign-002", "name": "MedFear",         "threat_level": "MED",  "confidence": 0.65},
    "campaign_3.json": {"id": "campaign-003", "name": "ReviewStorm",     "threat_level": "LOW",  "confidence": 0.35},
}

# Two accounts posting within this window count as coordinating
COORDINATION_WINDOW_SECONDS = 60


def _ts(value: str) -> datetime:
    return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)


def _coordination_pairs(posts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Account pairs whose posts land within the coordination window."""
    pairs: dict[tuple[str, str], float] = {}
    parsed = [(p["author_id"], _ts(p["timestamp"])) for p in posts]
    for (author_a, ts_a), (author_b, ts_b) in combinations(parsed, 2):
        if author_a == author_b:
            continue
        delay = abs((ts_a - ts_b).total_seconds())
        if delay <= COORDINATION_WINDOW_SECONDS:
            key = tuple(sorted((author_a, author_b)))
            if key not in pairs or delay < pairs[key]:
                pairs[key] = delay
    return [{"a": a, "b": b, "delay": round(delay, 1)} for (a, b), delay in pairs.items()]


def seed_campaign(path: Path, meta: dict[str, Any]) -> None:
    raw = json.loads(path.read_text(encoding="utf-8"))
    cid = meta["id"]
    timestamps = raw.get("timestamps") or []
    posts = raw.get("posts", [])

    post_count: dict[str, int] = {}
    for p in posts:
        post_count[p["author_id"]] = post_count.get(p["author_id"], 0) + 1

    # Campaign node
    run_query(
        """
        MERGE (c:Campaign {id: $id})
        SET c.name = $name,
            c.title = $title,
            c.threat_level = $threat_level,
            c.confidence = $confidence,
            c.narrative = $narrative,
            c.start_time = $start_time,
            c.source_file = $source_file
        """,
        {
            **meta,
            "title":       raw.get("title", ""),
            "narrative":   raw.get("account_metadata", {}).get("description", raw.get("title", "")),
            "start_time":  timestamps[0] if timestamps else "2026-06-20T08:00:00Z",
            "source_file": path.name,
        },
    )

    # Account nodes (+ PART_OF campaign). Node ids repeat across campaigns
    # (a01…a20 in every file) so the MERGE key is campaign-scoped.
    run_query(
        """
        UNWIND $accounts AS row
        MATCH (c:Campaign {id: $cid})
        MERGE (a:Account {key: row.key})
        SET a.id = row.id,
            a.handle = row.handle,
            a.campaign_id = $cid,
            a.age_days = row.age_days,
            a.followers = row.followers,
            a.following = row.following,
            a.verified = row.verified,
            a.post_count = row.post_count
        MERGE (a)-[:PART_OF]->(c)
        """,
        {
            "cid": cid,
            "accounts": [
                {
                    "key":        f"{cid}:{n['id']}",
                    "id":         n["id"],
                    "handle":     f"@usr_{n['id']}",
                    "age_days":   n.get("metadata", {}).get("account_age_days", 365),
                    "followers":  n.get("metadata", {}).get("followers", 0),
                    "following":  n.get("metadata", {}).get("following", 0),
                    "verified":   n.get("metadata", {}).get("verified", False),
                    "post_count": post_count.get(n["id"], 0),
                }
                for n in raw.get("nodes", [])
            ],
        },
    )

    # Post nodes, SHARED (account→post) and PART_OF (post→campaign)
    run_query(
        """
        UNWIND $posts AS row
        MATCH (c:Campaign {id: $cid})
        MATCH (a:Account {key: row.author_key})
        MERGE (p:Post {key: row.key})
        SET p.id = row.id,
            p.text = row.text,
            p.timestamp = row.timestamp
        MERGE (a)-[:SHARED]->(p)
        MERGE (p)-[:PART_OF]->(c)
        """,
        {
            "cid": cid,
            "posts": [
                {
                    "key":        f"{cid}:{p['id']}",
                    "author_key": f"{cid}:{p['author_id']}",
                    "id":         p["id"],
                    "text":       p.get("text", ""),
                    "timestamp":  p.get("timestamp", ""),
                }
                for p in posts
            ],
        },
    )

    # Interaction edges from the JSON (retweet/mention/reply) — the D3 graph edges
    run_query(
        """
        UNWIND $edges AS row
        MATCH (a1:Account {key: row.source_key})
        MATCH (a2:Account {key: row.target_key})
        MERGE (a1)-[r:INTERACTS {relation: row.relation}]->(a2)
        """,
        {
            "edges": [
                {
                    "source_key": f"{cid}:{e['source']}",
                    "target_key": f"{cid}:{e['target']}",
                    "relation":   e.get("relation", "mention"),
                }
                for e in raw.get("edges", [])
            ],
        },
    )

    # COORDINATES_WITH between accounts posting within the timing window
    run_query(
        """
        UNWIND $pairs AS row
        MATCH (a1:Account {key: $cid + ':' + row.a})
        MATCH (a2:Account {key: $cid + ':' + row.b})
        MERGE (a1)-[r:COORDINATES_WITH]->(a2)
        SET r.delay_seconds = row.delay
        """,
        {"cid": cid, "pairs": _coordination_pairs(posts)},
    )


def seed_database() -> None:
    for fname, meta in CAMPAIGN_META.items():
        path = DATA_DIR / fname
        if path.exists():
            seed_campaign(path, meta)

    seed_demo_accounts()

    counts = run_query(
        "MATCH (n) RETURN labels(n)[0] AS label, count(n) AS count ORDER BY label"
    )
    rels = run_query(
        "MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS count ORDER BY type"
    )
    print("Neo4j seed complete:")
    for row in counts:
        print(f"  {row['label']}: {row['count']} nodes")
    for row in rels:
        print(f"  {row['type']}: {row['count']} relationships")


if __name__ == "__main__":
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).parent.parent / ".env")
    seed_database()
