from __future__ import annotations

from dataclasses import dataclass

import networkx as nx


@dataclass(slots=True)
class CommunityResult:
    cluster_count: int
    communities: list[list[str]]


def detect_communities_neo4j(campaign_id: str) -> CommunityResult:
    """Community detection from AuraDB relationship patterns.

    AuraDB free tier has no GDS library, so edges are fetched with plain
    MATCH queries (COORDINATES_WITH + INTERACTS) and grouped with label
    propagation; the resulting cluster_id is stored back on each Account.
    """
    from db.neo4j_client import run_query

    accounts = run_query(
        """
        MATCH (a:Account)-[:PART_OF]->(c:Campaign {id: $campaign_id})
        RETURN a.key AS key, a.id AS id ORDER BY a.id
        """,
        {"campaign_id": campaign_id},
    )
    edges = run_query(
        """
        MATCH (a1:Account)-[r:COORDINATES_WITH|INTERACTS]-(a2:Account)
        WHERE a1.campaign_id = $campaign_id AND a2.campaign_id = $campaign_id
        RETURN DISTINCT a1.id AS source, a2.id AS target
        """,
        {"campaign_id": campaign_id},
    )
    if not accounts:
        return CommunityResult(0, [])

    ids = [row["id"] for row in accounts]
    neighbors: dict[str, set[str]] = {node_id: set() for node_id in ids}
    for edge in edges:
        if edge["source"] in neighbors and edge["target"] in neighbors:
            neighbors[edge["source"]].add(edge["target"])
            neighbors[edge["target"]].add(edge["source"])

    # Label propagation: every node adopts its neighborhood's dominant label
    labels = {node_id: node_id for node_id in ids}
    for _ in range(10):
        changed = False
        for node_id in ids:
            if not neighbors[node_id]:
                continue
            tally: dict[str, int] = {}
            for other in neighbors[node_id]:
                tally[labels[other]] = tally.get(labels[other], 0) + 1
            best = min(sorted(tally), key=lambda lab: -tally[lab])
            if best != labels[node_id]:
                labels[node_id] = best
                changed = True
        if not changed:
            break

    groups: dict[str, list[str]] = {}
    for node_id in ids:
        groups.setdefault(labels[node_id], []).append(node_id)
    communities = sorted((sorted(members) for members in groups.values()), key=lambda g: (-len(g), g[0]))

    cluster_of = {node_id: idx for idx, group in enumerate(communities) for node_id in group}
    run_query(
        """
        UNWIND $assignments AS row
        MATCH (a:Account {key: row.key})
        SET a.cluster_id = row.cluster_id
        """,
        {
            "assignments": [
                {"key": row["key"], "cluster_id": cluster_of[row["id"]]} for row in accounts
            ],
        },
    )
    return CommunityResult(len(communities), communities)


def detect_communities(graph: nx.Graph) -> CommunityResult:
    """Detect communities using greedy modularity maximization."""

    if graph.number_of_nodes() == 0:
        return CommunityResult(0, [])

    try:
        from networkx.algorithms.community import greedy_modularity_communities

        communities = [sorted(list(group)) for group in greedy_modularity_communities(graph)]
        return CommunityResult(len(communities), communities)
    except Exception:
        return CommunityResult(1 if graph.number_of_nodes() else 0, [sorted(list(graph.nodes()))])
