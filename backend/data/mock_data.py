"""
Python equivalent of lib/mockData.ts.

Generates the same hub-and-spoke campaign topology using a seeded RNG.
Node IDs are deterministic (prefix-bot-{cluster}-{index}) so the frontend's
sessionStorage-based campaign lookup continues to work after switching to
backend data.
"""

import random
from typing import List, Dict, Any


def _make_rand(prefix: str):
    seed = sum(ord(c) * (i + 7) for i, c in enumerate(prefix))
    rng = random.Random(seed)
    def rand(min_val: int, max_val: int) -> int:
        return rng.randint(min_val, max_val)
    return rand


def generate_network(
    prefix: str,
    cluster_count: int,
    bots_per_cluster: int,
    amplifier_count: int,
    legitimate_count: int = 0,
) -> Dict[str, List[Dict[str, Any]]]:
    rand = _make_rand(prefix)
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []

    # Origin (C2)
    origin_id = f"{prefix}-origin"
    nodes.append({
        "id":        origin_id,
        "type":      "origin",
        "label":     "C2 Origin",
        "accountId": "COVERT-C2",
        "posts":     0,
        "followers": 0,
    })

    all_bot_ids: List[str] = []

    for c in range(cluster_count):
        cluster_bots: List[str] = []
        for b in range(bots_per_cluster):
            bot_id = f"{prefix}-bot-{c}-{b}"
            all_bot_ids.append(bot_id)
            cluster_bots.append(bot_id)
            nodes.append({
                "id":        bot_id,
                "type":      "bot",
                "label":     f"BOT-C{c + 1}-{str(b + 1).zfill(2)}",
                "accountId": f"@usr_{rand(100000, 999999)}",
                "posts":     rand(200, 5000),
                "followers": rand(50, 2000),
                "clusterId": c,
            })
        # origin → cluster hub
        edges.append({"source": origin_id, "target": cluster_bots[0], "weight": 0.9})
        # hub → rest of cluster
        for b in range(1, len(cluster_bots)):
            edges.append({"source": cluster_bots[0], "target": cluster_bots[b], "weight": 0.6})

    all_amp_ids: List[str] = []
    for a in range(amplifier_count):
        amp_id = f"{prefix}-amp-{a}"
        all_amp_ids.append(amp_id)
        nodes.append({
            "id":        amp_id,
            "type":      "amplifier",
            "label":     f"AMP-{str(a + 1).zfill(3)}",
            "accountId": f"@acc_{rand(100000, 999999)}",
            "posts":     rand(50, 500),
            "followers": rand(200, 20000),
        })
        src = all_bot_ids[rand(0, len(all_bot_ids) - 1)]
        edges.append({"source": src, "target": amp_id, "weight": round(rand(25, 55) / 100, 2)})

    for lll in range(legitimate_count):
        leg_id = f"{prefix}-leg-{lll}"
        nodes.append({
            "id":        leg_id,
            "type":      "legitimate",
            "label":     f"USER-{rand(1000, 9999)}",
            "accountId": f"@real_{rand(100000, 999999)}",
            "posts":     rand(200, 2000),
            "followers": rand(500, 50000),
        })
        src = all_amp_ids[rand(0, len(all_amp_ids) - 1)]
        edges.append({"source": src, "target": leg_id, "weight": round(rand(10, 25) / 100, 2)})

    return {"nodes": nodes, "edges": edges}


def get_campaigns() -> List[Dict[str, Any]]:
    pulse      = generate_network("pulse",   4, 8, 20, 3)   # 56 nodes
    medfear    = generate_network("medfear", 3, 6, 15, 2)   # 36 nodes
    reviewstorm= generate_network("review",  2, 5, 10, 1)   # 22 nodes

    return [
        {
            "id":            "campaign-001",
            "name":          "Operation Pulse",
            "threat_level":  "HIGH",
            "account_count": 847,
            "start_time":    "2026-05-14T02:17:00Z",
            "narrative":     (
                "Coordinated election misinformation campaign targeting voter turnout in Maharashtra "
                "and Gujarat. False claims about EVM tampering and polling date changes amplified "
                "through bot networks seeded from three state-level coordination hubs."
            ),
            "confidence":    0.94,
            "nodes":         pulse["nodes"],
            "edges":         pulse["edges"],
        },
        {
            "id":            "campaign-002",
            "name":          "MedFear",
            "threat_level":  "HIGH",
            "account_count": 312,
            "start_time":    "2026-06-01T08:45:00Z",
            "narrative":     (
                "Anti-vaccine misinformation operation spreading fabricated WHO adverse-effect reports "
                "and deepfake audio attributed to medical professionals. Targets routine childhood "
                "vaccination programmes across tier-2 cities."
            ),
            "confidence":    0.91,
            "nodes":         medfear["nodes"],
            "edges":         medfear["edges"],
        },
        {
            "id":            "campaign-003",
            "name":          "ReviewStorm",
            "threat_level":  "MED",
            "account_count": 156,
            "start_time":    "2026-06-10T16:22:00Z",
            "narrative":     (
                "Coordinated fake product review network artificially inflating ratings for substandard "
                "consumer electronics while flooding competitor listings with negative sentiment. "
                "Active across Flipkart, Amazon IN, and Meesho."
            ),
            "confidence":    0.82,
            "nodes":         reviewstorm["nodes"],
            "edges":         reviewstorm["edges"],
        },
    ]
