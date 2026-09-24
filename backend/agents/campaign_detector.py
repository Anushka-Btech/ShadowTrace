from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

try:
    from langgraph.graph import END, StateGraph
except Exception:  # pragma: no cover - optional dependency fallback
    END = None
    StateGraph = None

from agents.content_analyzer import ContentAnalyzer
from agents.network_mapper import NetworkMapper
import numpy as np


@dataclass(slots=True)
class CampaignDetectionResult:
    campaign_detected: bool
    confidence_score: float
    cluster_count: int
    narrative_similarity: float
    graph_behavior_score: float
    content_risk_score: float


class CampaignDetector:
    def __init__(self, content_analyzer: ContentAnalyzer | None = None, network_mapper: NetworkMapper | None = None) -> None:
        self.content_analyzer = content_analyzer or ContentAnalyzer()
        self.network_mapper = network_mapper or NetworkMapper()
        self._workflow = self._build_workflow()
        self._sentence_model = self._load_sentence_model()

    def detect(self, source: str | Path | dict[str, Any]) -> CampaignDetectionResult:
        state = {"source": source}
        result = self._workflow.invoke(state) if self._workflow is not None else self._run_detection(state)
        return result["result"]

    def _build_workflow(self):
        if StateGraph is None:
            return None

        workflow = StateGraph(dict)
        workflow.add_node("load", self._load_campaign_state)
        workflow.add_node("analyze", self._analyze_state)
        workflow.add_node("finalize", self._finalize_state)
        workflow.set_entry_point("load")
        workflow.add_edge("load", "analyze")
        workflow.add_edge("analyze", "finalize")
        workflow.add_edge("finalize", END)
        return workflow.compile()

    def _run_detection(self, state: dict[str, Any]) -> dict[str, Any]:
        state = self._load_campaign_state(state)
        state = self._analyze_state(state)
        state = self._finalize_state(state)
        return state

    def _load_campaign_state(self, state: dict[str, Any]) -> dict[str, Any]:
        state = dict(state)
        state["campaign"] = self.network_mapper.load_campaign(state["source"])
        return state

    def _analyze_state(self, state: dict[str, Any]) -> dict[str, Any]:
        campaign = state["campaign"]
        network = self.network_mapper.analyze(campaign)
        narratives = campaign.get("narratives", [])
        posts = campaign.get("posts", [])

        content_scores = [self.content_analyzer.analyze(post.get("text", "")).misinformation_score for post in posts]
        content_risk = sum(content_scores) / max(1, len(content_scores))
        narrative_similarity = self._narrative_similarity(narratives, posts)
        bot_pressure = sum(node.bot_score for node in network.bot_indicators) / max(1, len(network.bot_indicators))
        graph_behavior = min(100.0, 35.0 * network.cluster_count + 30.0 * network.density * 10.0 + 0.35 * bot_pressure)
        confidence = min(99.0, 0.35 * content_risk + 0.25 * narrative_similarity + 0.4 * graph_behavior)

        state["analysis"] = {
            "campaign_detected": confidence >= 55.0,
            "confidence_score": round(confidence, 2),
            "cluster_count": network.cluster_count,
            "narrative_similarity": round(narrative_similarity, 2),
            "graph_behavior_score": round(graph_behavior, 2),
            "content_risk_score": round(content_risk, 2),
        }
        return state

    def _finalize_state(self, state: dict[str, Any]) -> dict[str, Any]:
        analysis = state["analysis"]
        state["result"] = CampaignDetectionResult(**analysis)
        return state

    @staticmethod
    def _narrative_similarity(narratives: list[str], posts: list[dict[str, Any]]) -> float:
        if not narratives or not posts:
            return 0.0
        model = CampaignDetector._shared_sentence_model()
        if model is None:
            return CampaignDetector._fallback_similarity(narratives, posts)
        try:
            narrative_text = " ".join(narratives)
            post_texts = [str(post.get("text", "")) for post in posts]
            narrative_embedding = model.encode([narrative_text], normalize_embeddings=True)
            post_embeddings = model.encode(post_texts, normalize_embeddings=True)
            if narrative_embedding is None or post_embeddings is None:
                return CampaignDetector._fallback_similarity(narratives, posts)
            scores = np.asarray(post_embeddings) @ np.asarray(narrative_embedding).T
            return float(np.clip(scores.mean() * 100.0, 0.0, 100.0))
        except Exception:
            return CampaignDetector._fallback_similarity(narratives, posts)

    @staticmethod
    def _fallback_similarity(narratives: list[str], posts: list[dict[str, Any]]) -> float:
        narrative_terms = set(" ".join(narratives).lower().split())
        overlap = 0.0
        for post in posts:
            terms = set(str(post.get("text", "")).lower().split())
            overlap += len(narrative_terms & terms) / max(1, len(narrative_terms))
        return min(100.0, 100.0 * overlap / len(posts))

    @staticmethod
    @lru_cache(maxsize=1)
    def _shared_sentence_model():
        # Lazy import: sentence-transformers pulls in torch, which must not
        # load at startup on Render's 512MB free tier.
        try:
            from sentence_transformers import SentenceTransformer
        except Exception:  # pragma: no cover - optional dependency fallback
            return None
        try:
            return SentenceTransformer("all-MiniLM-L6-v2")
        except Exception:
            return None

    def _load_sentence_model(self):
        return self._shared_sentence_model()
