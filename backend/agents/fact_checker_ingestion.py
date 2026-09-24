from __future__ import annotations

import hashlib
import re
import urllib.request
from typing import Dict, List

import feedparser

FACT_CHECKER_FEEDS = [
    {"name": "AltNews",     "url": "https://www.altnews.in/feed/",                "color": "red"},
    # boomlive.in/feed/ serves an empty RSS shell; the fact-check section feed is the live one
    {"name": "Boom",        "url": "https://www.boomlive.in/fact-check/feed",     "color": "yellow"},
    {"name": "FactChecker", "url": "https://www.factchecker.in/feed/",            "color": "blue"},
    {"name": "TheQuint",    "url": "https://www.thequint.com/news/webqoof/feed",  "color": "purple"},
]

_FETCH_TIMEOUT_SECONDS = 8
_TAG_RE = re.compile(r"<[^>]+>")


def _clean(html: str) -> str:
    return _TAG_RE.sub("", html or "").strip()


def _fetch_feed(url: str):
    # feedparser.parse(url) has no timeout and can hang the request thread on a
    # slow feed; fetch with urllib (timeout + explicit UA, some feeds block the
    # default one) and parse the bytes instead.
    req = urllib.request.Request(url, headers={"User-Agent": "ShadowTrace/1.0 (+fact-check monitor)"})
    with urllib.request.urlopen(req, timeout=_FETCH_TIMEOUT_SECONDS) as resp:
        return feedparser.parse(resp.read())


def fetch_live_claims() -> List[Dict]:
    """
    Fetch latest debunked claims from all fact-checker RSS feeds.
    Returns list of claims with metadata. A dead feed is skipped silently
    so one outage never takes down the whole feed.
    """
    claims = []
    for feed_source in FACT_CHECKER_FEEDS:
        try:
            feed = _fetch_feed(feed_source["url"])
            for entry in feed.entries[:5]:  # last 5 per source
                claim = {
                    "id": hashlib.md5(entry.get("link", "").encode()).hexdigest()[:8],
                    "title": _clean(entry.get("title", "")),
                    "summary": _clean(entry.get("summary", ""))[:300],
                    "url": entry.get("link", ""),
                    "published": entry.get("published", ""),
                    "source": feed_source["name"],
                    "source_color": feed_source["color"],
                    "language": "en",
                    "ai_score": None,  # filled by ContentAnalyzer
                    "risk_level": None,
                    "keywords": [],
                }
                claims.append(claim)
        except Exception as e:
            print(f"Failed to fetch {feed_source['name']}: {e}")
            continue
    return claims
