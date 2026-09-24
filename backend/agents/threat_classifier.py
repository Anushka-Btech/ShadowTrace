from __future__ import annotations

from dataclasses import dataclass
import json
import os
from typing import Any

try:
    from groq import Groq
except Exception:  # pragma: no cover - optional dependency fallback
    Groq = None


@dataclass(slots=True)
class ThreatAlert:
    threat_type: str
    severity: str
    explanation: str
    structured_alert: dict[str, Any]


class ThreatClassifier:
    """Use Groq if available, otherwise deterministic rules."""

    def __init__(self, model: str = "llama-3.3-70b-versatile") -> None:
        self.model = model
        self.client = self._build_client()

    def _build_client(self):
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key or Groq is None:
            return None
        return Groq(api_key=api_key)

    def classify(self, payload: dict[str, Any]) -> ThreatAlert:
        groq_result = self._classify_with_groq(payload)
        if groq_result is not None:
            return groq_result

        campaign_detected = bool(payload.get("campaign_detected", False))
        confidence = float(payload.get("confidence_score", 0.0))
        cluster_count = int(payload.get("cluster_count", 0))
        bot_pressure = float(payload.get("bot_pressure", 0.0))
        content_risk = float(payload.get("content_risk_score", 0.0))

        if bot_pressure > 70 or (campaign_detected and cluster_count > 2 and confidence > 70):
            threat_type = "Possible State-Level Operation"
            severity = "critical"
            explanation = "High bot pressure, multiple clusters, and coordinated propagation patterns indicate a potentially state-backed operation."
        elif campaign_detected and bot_pressure > 40:
            threat_type = "Coordinated Inauthentic Behavior"
            severity = "high"
            explanation = "The network shows synchronized behavior and elevated bot indicators consistent with coordinated inauthentic activity."
        else:
            threat_type = "Organic Misinformation"
            severity = "medium" if content_risk > 50 else "low"
            explanation = "The content appears misleading, but the network behavior does not strongly indicate coordination."

        structured_alert = {
            "threat_type": threat_type,
            "severity": severity,
            "confidence": round(max(confidence, content_risk), 2),
            "signals": {
                "campaign_detected": campaign_detected,
                "cluster_count": cluster_count,
                "bot_pressure": round(bot_pressure, 2),
                "content_risk_score": round(content_risk, 2),
            },
        }
        return ThreatAlert(threat_type, severity, explanation, structured_alert)

    def _classify_with_groq(self, payload: dict[str, Any]) -> ThreatAlert | None:
        if self.client is None:
            return None
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                temperature=0.2,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You classify misinformation incidents. Return strict JSON with keys "
                            "threat_type, severity, explanation."
                        ),
                    },
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
            )
            content = response.choices[0].message.content or "{}"
            parsed = json.loads(content)
            threat_type = str(parsed.get("threat_type", "Organic Misinformation"))
            severity = str(parsed.get("severity", "medium"))
            explanation = str(parsed.get("explanation", ""))
            structured_alert = {
                "threat_type": threat_type,
                "severity": severity,
                "confidence": round(float(payload.get("confidence_score", 0.0)), 2),
                "signals": {
                    "campaign_detected": bool(payload.get("campaign_detected", False)),
                    "cluster_count": int(payload.get("cluster_count", 0)),
                    "bot_pressure": round(float(payload.get("bot_pressure", 0.0)), 2),
                    "content_risk_score": round(float(payload.get("content_risk_score", 0.0)), 2),
                },
            }
            return ThreatAlert(threat_type, severity, explanation, structured_alert)
        except Exception:
            return None
