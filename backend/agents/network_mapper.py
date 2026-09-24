from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import json

from graph.bot_detection import calculate_bot_score, calculate_bot_scores_neo4j
from graph.community_detection import detect_communities, detect_communities_neo4j

# JSON file campaign ids → Campaign node ids in AuraDB
_DB_ID_MAP = {
    "campaign_1": "campaign-001",
    "campaign_2": "campaign-002",
    "campaign_3": "campaign-003",
}


@dataclass(slots=True)
class NodeAnalysis:
    node_id: str
    bot_score: float
    indicators: dict[str, float]


@dataclass(slots=True)
class NetworkAnalysisResult:
    nodes: int
    edges: int
    cluster_count: int
    communities: list[list[str]]
    bot_indicators: list[NodeAnalysis]
    density: float


class NetworkMapper:
    """Network analysis backed by Neo4j AuraDB.

    Seeded campaigns are analyzed entirely from AuraDB (primary path);
    arbitrary campaign payloads sent to /analyze-network fall back to the
    legacy in-memory NetworkX pipeline so no existing behavior breaks.
    """

    def load_campaign(self, source: str | Path | dict[str, Any]) -> dict[str, Any]:
        if isinstance(source, dict):
            return source
        path = Path(source)
        return json.loads(path.read_text(encoding="utf-8"))

    def analyze(self, source: str | Path | dict[str, Any]) -> NetworkAnalysisResult:
        campaign = self.load_campaign(source)
        db_id = self._campaign_db_id(campaign)
        if db_id:
            try:
                return self._analyze_from_neo4j(db_id)
            except Exception:
                pass  # Neo4j unreachable — legacy path below keeps the API up
        return self._analyze_networkx(campaign)

    # ── Primary: AuraDB ────────────────────────────────────────────────────────

    @staticmethod
    def _campaign_db_id(campaign: dict[str, Any]) -> str | None:
        raw_id = str(campaign.get("campaign_id") or campaign.get("id") or "")
        if raw_id in _DB_ID_MAP:
            return _DB_ID_MAP[raw_id]
        if raw_id.startswith("campaign-"):
            return raw_id
        return None

    def _analyze_from_neo4j(self, campaign_id: str) -> NetworkAnalysisResult:
        from db.neo4j_client import run_query

        # Cypher bot scoring — persists a.bot_score onto each Account node
        calculate_bot_scores_neo4j(campaign_id)
        communities = detect_communities_neo4j(campaign_id)

        accounts = run_query(
            """
            MATCH (a:Account)-[:PART_OF]->(c:Campaign {id: $cid})
            OPTIONAL MATCH (a)-[r:INTERACTS]-(:Account)
            WITH a, count(r) AS degree
            OPTIONAL MATCH (a)-[:SHARED]->(p:Post)
            RETURN a.id AS id, a.age_days AS age_days, a.followers AS followers,
                   a.following AS following, a.verified AS verified,
                   degree, collect(p.timestamp) AS timestamps
            """,
            {"cid": campaign_id},
        )
        edge_count = run_query(
            """
            MATCH (a1:Account)-[r:INTERACTS]->(a2:Account)
            WHERE a1.campaign_id = $cid AND a2.campaign_id = $cid
            RETURN count(r) AS count
            """,
            {"cid": campaign_id},
        )[0]["count"]

        bot_indicators: list[NodeAnalysis] = []
        for row in accounts:
            metadata = {
                "account_age_days": row.get("age_days", 365),
                "followers":        row.get("followers", 0),
                "following":        row.get("following", 0),
                "verified":         row.get("verified", False),
            }
            frequency = self._frequency_from_timestamps(row.get("timestamps") or [])
            score = calculate_bot_score(metadata, frequency, float(row.get("degree", 0)))
            bot_indicators.append(
                NodeAnalysis(node_id=row["id"], bot_score=score.score, indicators=score.indicators)
            )
        bot_indicators.sort(key=lambda item: item.bot_score, reverse=True)

        n = len(accounts)
        density = (2.0 * edge_count) / (n * (n - 1)) if n > 1 else 0.0
        return NetworkAnalysisResult(
            nodes=n,
            edges=edge_count,
            cluster_count=communities.cluster_count,
            communities=communities.communities,
            bot_indicators=bot_indicators,
            density=round(density, 4),
        )

    # ── Fallback: legacy in-memory NetworkX pipeline ───────────────────────────

    def _analyze_networkx(self, campaign: dict[str, Any]) -> NetworkAnalysisResult:
        import networkx as nx

        graph = self.build_graph(campaign)
        self._enrich_metrics(graph)
        communities = detect_communities(graph)
        bot_indicators = self._detect_bots(graph, campaign.get("posts", []))
        density = nx.density(graph) if graph.number_of_nodes() > 1 else 0.0
        return NetworkAnalysisResult(
            nodes=graph.number_of_nodes(),
            edges=graph.number_of_edges(),
            cluster_count=communities.cluster_count,
            communities=communities.communities,
            bot_indicators=bot_indicators,
            density=round(density, 4),
        )

    def build_graph(self, campaign: dict[str, Any]):
        import networkx as nx

        graph = nx.Graph()
        for node in campaign.get("nodes", []):
            graph.add_node(node["id"], **node)
        for edge in campaign.get("edges", []):
            graph.add_edge(edge["source"], edge["target"], **edge)
        return graph

    def _detect_bots(self, graph: Any, posts: list[dict[str, Any]]) -> list[NodeAnalysis]:
        posts_by_node: dict[str, list[dict[str, Any]]] = {}
        for post in posts:
            posts_by_node.setdefault(post["author_id"], []).append(post)

        analyses: list[NodeAnalysis] = []
        for node_id, attrs in graph.nodes(data=True):
            node_posts = posts_by_node.get(node_id, [])
            posting_frequency = self._posting_frequency(node_posts)
            connectivity = float(graph.degree(node_id))
            metadata = attrs.get("metadata", attrs)
            metadata = {
                **metadata,
                "pagerank": graph.nodes[node_id].get("pagerank", 0.0),
                "betweenness": graph.nodes[node_id].get("betweenness", 0.0),
                "clustering": graph.nodes[node_id].get("clustering", 0.0),
            }
            bot_score = calculate_bot_score(metadata, posting_frequency, connectivity)
            analyses.append(NodeAnalysis(node_id=node_id, bot_score=bot_score.score, indicators=bot_score.indicators))
        return sorted(analyses, key=lambda item: item.bot_score, reverse=True)

    @staticmethod
    def _enrich_metrics(graph: Any) -> None:
        import networkx as nx

        if graph.number_of_nodes() == 0:
            return
        pagerank = nx.pagerank(graph, alpha=0.85)
        betweenness = nx.betweenness_centrality(graph, normalized=True)
        clustering = nx.clustering(graph)
        for node in graph.nodes:
            graph.nodes[node]["pagerank"] = float(pagerank.get(node, 0.0))
            graph.nodes[node]["betweenness"] = float(betweenness.get(node, 0.0))
            graph.nodes[node]["clustering"] = float(clustering.get(node, 0.0))

    @staticmethod
    def _posting_frequency(posts: list[dict[str, Any]]) -> float:
        return NetworkMapper._frequency_from_timestamps([str(post["timestamp"]) for post in posts])

    @staticmethod
    def _frequency_from_timestamps(timestamps: list[str]) -> float:
        if len(timestamps) < 2:
            return float(len(timestamps))
        parsed = sorted(
            datetime.fromisoformat(str(ts).replace("Z", "+00:00")).astimezone(timezone.utc)
            for ts in timestamps
        )
        span_hours = max(1.0, (parsed[-1] - parsed[0]).total_seconds() / 3600.0)
        return len(parsed) / span_hours
