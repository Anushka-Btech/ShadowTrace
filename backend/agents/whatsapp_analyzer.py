from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List


@dataclass
class WhatsAppAnalysisResult:
    is_forward: bool
    forward_depth: int            # how many times forwarded
    misinformation_score: int     # 0-100
    risk_level: str               # HIGH/MED/LOW
    language_detected: str        # en/hi/hinglish
    forward_signals: List[str]    # detected pattern names
    red_flags: List[str]          # human readable red flags
    claim_extracted: str          # the core claim being made
    verdict: str                  # one line verdict
    fact_check_matches: List[Dict] = field(default_factory=list)


class WhatsAppForwardAnalyzer:
    """Pattern-based analyzer for WhatsApp forwards (English/Hindi/Hinglish)."""

    # Forward chain indicators
    FORWARD_PATTERNS = [
        r"forwarded\s+many\s+times",
        r"forwarded",
        r"FWD\s*:",
        r"fwd\s*:",
        r"forward\s+karo",
        r"share\s+karo",
        r"sabko\s+bhejo",
        r"🔁",
        r"📢",
        r"⚠️.*urgent",
    ]

    # Misinformation signal patterns
    MISINFO_SIGNALS = {
        "urgency_language": [
            r"urgent", r"breaking", r"just\s+in", r"share\s+immediately",
            r"share\s+before\s+delet", r"spread\s+the\s+word",
            r"abhi\s+share\s+karo", r"turant", r"tatkal",
        ],
        "unnamed_authority": [
            r"doctors\s+say", r"scientists\s+confirm", r"government\s+hiding",
            r"sources\s+say", r"insiders\s+reveal", r"leaked",
            r"doctors\s+ne\s+(bataya|confirm)", r"(sarkar|government)\s+chupa\s+rahi",
        ],
        "conspiracy_markers": [
            r"mainstream\s+media\s+won'?t", r"they\s+don'?t\s+want\s+you",
            r"wake\s+up", r"open\s+your\s+eyes", r"truth\s+about",
            r"sach\s+batata\s+hoon", r"asli\s+sach",
        ],
        "health_misinfo": [
            r"cure\s+for\s+cancer", r"doctors\s+hate", r"big\s+pharma",
            r"vaccine\s+cause", r"natural\s+cure", r"gharelu\s+nuskha",
            r"cancer.{0,30}(theek|thik|cure)", r"(cures?|theek)\s+(cancer|diabetes)",
        ],
        "political_misinfo": [
            r"EVMs?\s+(were\s+|is\s+|are\s+)?(hack|rig)", r"election\s+rig", r"vote\s+kaat",
            r"fake\s+vote", r"ballot\s+stuff",
        ],
        "share_bait": [
            r"share\s+this\s+with\s+\d+", r"send\s+to\s+all",
            r"don'?t\s+ignore", r"must\s+read", r"please\s+share",
            r"please\s+forward", r"sabko\s+dikhao", r"share\s+karo\s+sabko",
        ],
    }

    SIGNAL_WEIGHTS = {
        "urgency_language": (15, "Uses urgency language to pressure sharing"),
        "unnamed_authority": (20, "Cites unnamed authorities or experts"),
        "conspiracy_markers": (20, "Contains conspiracy framing"),
        "health_misinfo": (25, "Contains health misinformation patterns"),
        "political_misinfo": (25, "Contains political misinformation patterns"),
        "share_bait": (15, "Designed to maximize viral sharing"),
    }

    def analyze(self, text: str) -> WhatsAppAnalysisResult:
        text_lower = text.lower()

        # Detect if it's a forward
        is_forward = any(
            re.search(p, text, re.IGNORECASE)
            for p in self.FORWARD_PATTERNS
        )

        # Estimate forward depth from "Forwarded many times" indicators
        forward_depth = 0
        if "forwarded many times" in text_lower:
            forward_depth = 5
        elif re.search(r"fwd.*fwd", text_lower):
            forward_depth = 3
        elif is_forward:
            forward_depth = 1

        # Detect language
        hindi_chars = len(re.findall(r"[ऀ-ॿ]", text))
        hinglish_words = len(re.findall(
            r"\b(karo|hai|hain|nahi|aur|yeh|woh|bhi|se|ko|ka|ki|ke)\b",
            text_lower,
        ))
        if hindi_chars > 10:
            language = "hi"
        elif hinglish_words > 2:
            language = "hinglish"
        else:
            language = "en"

        # Score misinformation signals
        detected_signals = []
        red_flags = []
        score = 20  # base score

        for signal_name, patterns in self.MISINFO_SIGNALS.items():
            if any(re.search(p, text, re.IGNORECASE) for p in patterns):
                weight, description = self.SIGNAL_WEIGHTS[signal_name]
                score += weight
                detected_signals.append(signal_name)
                red_flags.append(description)

        # Forward depth adds to score
        score += min(forward_depth * 5, 15)

        # Cap at 97
        score = min(score, 97)

        # Risk level
        if score > 70:
            risk_level = "HIGH"
        elif score > 40:
            risk_level = "MED"
        else:
            risk_level = "LOW"

        # Extract core claim (first substantial sentence or first 100 chars);
        # skip forward-chain boilerplate like "Forwarded as received"
        sentences = re.split(r"[.!?।\n]", text.strip())
        claim = next(
            (
                s.strip() for s in sentences
                if len(s.strip()) > 20
                and not any(re.search(p, s, re.IGNORECASE) for p in self.FORWARD_PATTERNS)
            ),
            next((s.strip() for s in sentences if len(s.strip()) > 20), text[:100]),
        )

        # Generate verdict
        if score > 70:
            verdict = f"High probability of misinformation. {len(red_flags)} red flags detected."
        elif score > 40:
            verdict = f"Suspicious content. {len(red_flags)} warning signals detected."
        else:
            verdict = "Low misinformation indicators. Content appears relatively benign."

        return WhatsAppAnalysisResult(
            is_forward=is_forward,
            forward_depth=forward_depth,
            misinformation_score=score,
            risk_level=risk_level,
            language_detected=language,
            forward_signals=detected_signals,
            red_flags=red_flags,
            claim_extracted=claim,
            verdict=verdict,
            fact_check_matches=[],
        )
