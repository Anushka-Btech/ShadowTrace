from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class AnalyzeTextRequest(BaseModel):
    text: str = Field(..., min_length=1)


class AnalyzeTextResponse(BaseModel):
    misinformation_score: int
    confidence: float
    signals: dict[str, float]


class AnalyzeNetworkRequest(BaseModel):
    campaign: dict[str, Any]


class AnalyzeNetworkResponse(BaseModel):
    nodes: int
    edges: int
    cluster_count: int
    communities: list[list[str]]
    density: float
    bot_indicators: list[dict[str, Any]]


class DetectCampaignRequest(BaseModel):
    campaign: dict[str, Any]


class DetectCampaignResponse(BaseModel):
    campaign_detected: bool
    confidence_score: float
    cluster_count: int
    narrative_similarity: float
    graph_behavior_score: float
    content_risk_score: float


class ThreatClassifierRequest(BaseModel):
    payload: dict[str, Any]


class ThreatClassifierResponse(BaseModel):
    threat_type: Literal["Organic Misinformation", "Coordinated Inauthentic Behavior", "Possible State-Level Operation"]
    severity: str
    explanation: str
    structured_alert: dict[str, Any]


class AccountIntelAnalyzeRequest(BaseModel):
    handles: list[str] = Field(..., min_length=1)


class TimelinePostModel(BaseModel):
    timestamp: int
    text_preview: str


class AccountTimelineModel(BaseModel):
    account: str
    posts: list[TimelinePostModel]


class TemporalCoordinationResponse(BaseModel):
    score: int
    confidence: float
    flagged_pairs: int
    median_delay_seconds: float
    timeline: list[AccountTimelineModel]


class LinguisticFingerprintProfileModel(BaseModel):
    account: str
    average_sentence_length: float
    vocabulary_diversity: float
    punctuation_density: float
    emoji_frequency: float


class LinguisticFingerprintResponse(BaseModel):
    score: float
    clusters: list[int]
    accounts: list[str]
    similarity_matrix: list[list[float]]
    profiles: list[LinguisticFingerprintProfileModel]


class AIOperationResponseSignal(BaseModel):
    account: str
    burstiness: float
    perplexity: float
    semantic_consistency: float
    topic_drift: float
    post_count: int = 0


class AIOperationResponse(BaseModel):
    score: float
    signals: list[AIOperationResponseSignal]
    verdict: Literal["LIKELY_AI", "POSSIBLY_AI", "LIKELY_HUMAN"]


class AccountIntelResponse(BaseModel):
    temporal: TemporalCoordinationResponse
    linguistic: LinguisticFingerprintResponse
    ai_operation: AIOperationResponse
    # Per-handle data provenance: "graph" (seeded/previously ingested),
    # "bluesky" (live-fetched this request), or "none"
    sources: dict[str, str] = {}


class DeepfakeAnalyzeRequest(BaseModel):
    image_url: str = Field(..., min_length=1)


class DeepfakeAnalyzeResponse(BaseModel):
    manipulation_probability: float
    ela_image_base64: str
    metadata_summary: dict[str, Any]
    ai_generated_probability: float | None = None
    ai_model_used: str | None = None


class LanguageDetectRequest(BaseModel):
    text: str = Field(..., min_length=1)


class LanguageDetectResponse(BaseModel):
    language: str
    confidence: float
