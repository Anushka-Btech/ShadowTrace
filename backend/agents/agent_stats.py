"""In-process agent activity tracker.

Every route records which agents did real work so /agents/status reports
genuine task counts and last-active times instead of demo numbers.
"""

from __future__ import annotations

import threading
import time

_lock = threading.Lock()
_stats: dict[str, dict[str, float | int]] = {}

AGENT_ROSTER = [
    "ContentAnalyzer",
    "DeepfakeDetector",
    "NetworkMapper",
    "ThreatClassifier",
    "CampaignDetector",
    "WhatsAppAnalyzer",
    "TemporalCoordinator",
    "LinguisticFingerprinter",
    "AIOperationDetector",
    "SarvamLanguageDetector",
]


def record(agent_name: str) -> None:
    with _lock:
        entry = _stats.setdefault(agent_name, {"tasks": 0, "last_active": 0.0})
        entry["tasks"] = int(entry["tasks"]) + 1
        entry["last_active"] = time.time()


def snapshot() -> list[dict]:
    now = time.time()
    with _lock:
        out = []
        for name in AGENT_ROSTER:
            entry = _stats.get(name)
            # Every roster agent is loaded in this process and callable, so
            # ONLINE is always truthful; task counts are the live part
            if entry is None:
                out.append({"name": name, "status": "ONLINE", "tasks": 0, "seconds_since_active": None})
                continue
            idle_for = int(now - float(entry["last_active"]))
            out.append(
                {
                    "name": name,
                    "status": "ONLINE",
                    "tasks": int(entry["tasks"]),
                    "seconds_since_active": idle_for,
                }
            )
        return out
