# ShadowTrace — Technical Documentation

*10 agents, a Neo4j AuraDB graph substrate, and live ingestion from Bluesky and Indian fact-checker feeds.*

---

## 1. Project Overview

ShadowTrace is a multi-agent threat-intelligence system for **coordinated misinformation campaigns**. Unlike fact-checkers, which evaluate individual posts, ShadowTrace analyses the **infrastructure** behind misinformation — mapping account graphs, materialising coordination edges, clustering synchronised amplifiers, and generating structured threat assessments.

**Live Deployment:** https://shadowtrace-bay.vercel.app
**Source Code:** https://github.com/uttampreet-dev/ShadowTrace

### How the system evolved

Our first build was four agents over an in-memory NetworkX graph, with a BERT-tiny classifier and synthetic data only. What ships is a different system:

| | First build | What ships |
|---|---|---|
| **Agents** | 4 (+1 standby) | **10, all live** |
| **Graph** | NetworkX, in-memory | **Neo4j AuraDB** (NetworkX is now the fallback) |
| **Content scoring** | HuggingFace BERT-tiny | **Groq LLaMA-3.3-70B** blended with a lexical scorer |
| **Data** | Synthetic only | **Live Bluesky accounts + live fact-checker RSS**, plus synthetic sets |
| **Coordination** | Recomputed per request | **`COORDINATES_WITH` edge, materialised at ingest** |
| **Deepfake** | STANDBY | **Live** — ELA + EXIF + 3-model HF ensemble |
| **Backend** | Local only | **Deployed on Render** |
| **Languages** | English | **English / Hindi / Hinglish** (Sarvam `text-lid`) |

---

## 2. Problem Statement

Misinformation in India spreads faster than fact-checks can publish. The core problem is not individual false posts — it is **coordinated networks of accounts amplifying false narratives in synchronised bursts**. No tool available to Indian journalists, fact-checkers, or government bodies maps those networks in real time.

Gaps in existing solutions:

- Fact-checkers examine posts in isolation, missing the campaign behind them
- AI-generated media is indistinguishable to human moderators
- Bot clusters amplify in timing-coordinated waves with no detection layer
- By the time a correction publishes, the false narrative has already reached millions

---

## 3. System Architecture

```
DATA SOURCES
Bluesky (live) · Fact-checker RSS (live) · WhatsApp forwards · Image URLs · Synthetic sets
                          │
                          ▼
              INGESTION ──► Neo4j AuraDB
                          │   Account · Post · Campaign
                          │   SHARED · PART_OF · INTERACTS · COORDINATES_WITH
                          │
   ┌──────────────────────┴──────────────────────────────────┐
   ▼            ▼             ▼             ▼            ▼
Content     Deepfake      Network       Campaign      Threat
Analyzer    Detector      Mapper        Detector      Classifier
(Groq 70B)  (ELA + HF)    (Cypher)      (LangGraph)   (Groq 70B)
   │            │             │             │            │
   ▼            ▼             ▼             ▼            ▼
WhatsApp   Temporal    Linguistic     AI-Operation    Sarvam
Analyzer   Coordinator Fingerprinter  Detector        Language ID
   └──────────────────────┬──────────────────────────────────┘
                          ▼
                MISSION CONTROL DASHBOARD
   Network · Account Intel · Image Forensics · WhatsApp · Live Feed · Alerts
```

### Architecture Decisions

**Why Neo4j AuraDB — and why NetworkX is now the fallback.**
Our first build argued NetworkX was sufficient for a hackathon MVP. That was true right up until coordination became the product. A bot's tell is not *what* it says but *that it said it 12 seconds after forty other accounts* — and that is a relationship, not a property. In AuraDB, `COORDINATES_WITH` is materialised once at ingest, so synchronised amplification becomes a **one-hop traversal** instead of an O(n²) rescan on every request. Bot scores and cluster IDs are computed in Cypher and **persisted onto the nodes**. NetworkX survives as an in-memory fallback for arbitrary payloads posted to `/analyze-network` and for when AuraDB is unreachable.

**Why Groq LLaMA-3.3-70B replaced BERT.**
Render's free tier caps at 512MB. `torch` + `transformers` OOM on load. Rather than pay for a larger box, we removed local model weights entirely: ContentAnalyzer is now an API call to a 70B model, blended `0.85 * llm + 0.15 * lexical`, with the deterministic lexical scorer doubling as the offline fallback. The whole backend runs in under 100MB — and a 70B model comfortably outperforms a fine-tuned BERT-tiny at Hinglish misinformation judgement. The constraint made the system both lighter and more accurate.

**Why an ensemble for AI-image detection.**
Single-model AI-image detection is not safe. Every classifier we tested confidently mislabels some family of real photographs. Details in §4.6.

**Why FastAPI.**
Async request handling for concurrent agent execution, plus automatic OpenAPI docs that made debugging agent handoffs tractable.

**Why LangGraph over CrewAI.**
Explicit state management between steps, making intermediate results inspectable. It is an orchestration convenience, not a dependency — the pipeline runs synchronously if LangGraph is absent.

**Why D3.js.**
The force-directed graph needs low-level SVG and custom force simulation. Recharts and Chart.js support neither.

---

## 4. Agent Pipeline — Detailed

Ten agents are registered in `AGENT_ROSTER` (`backend/agents/agent_stats.py`). Every route calls `record_agent()`, so `/agents/status` reports **genuine task counts and last-active times**, not demo numbers.

### 4.1 ContentAnalyzer
**File:** `backend/agents/content_analyzer.py`

Scores text 0–100 for misinformation likelihood. Primary signal is a **Groq LLaMA-3.3-70B** judgment prompted specifically for Indian social media (English, Hindi, Hinglish), returning strict JSON at `temperature=0.1`. A deterministic lexical scorer is blended in and also serves as the offline fallback.

```python
score = 0.15 * lexical_score + 0.85 * llm_score
confidence = min(0.99, 0.4 + abs(score - 50) / 100)
```

Confidence rises with distance from the 50 midpoint — the model is most confident when the verdict is least ambiguous, and never claims certainty.

**Lexical signals:** suspicious-phrase hits (`share before deleted`, `they don't want you to know`, `false flag`…), uppercase ratio, exclamation/question density, URL count, numeric-claim density, short-text penalty, urgency tokens.

**Output:** `ContentAnalysisResult(misinformation_score, confidence, signals)`

### 4.2 NetworkMapper
**File:** `backend/agents/network_mapper.py`

Two execution paths. Seeded campaigns are analysed **entirely from AuraDB**; arbitrary payloads fall back to the legacy NetworkX pipeline.

**AuraDB path (primary):** runs Cypher bot scoring, runs label-propagation community detection, then pulls every account with its degree and post timestamps to compute the composite score. Graph density is derived from the live node/edge counts.

**NetworkX path (fallback):** builds an in-memory graph, enriches nodes with PageRank (α=0.85), betweenness centrality, and clustering coefficient, then applies greedy-modularity community detection.

**Output:** `NetworkAnalysisResult(nodes, edges, cluster_count, communities, bot_indicators, density)`

### 4.3 CampaignDetector
**File:** `backend/agents/campaign_detector.py`

LangGraph state machine: **`load → analyze → finalize`**. Fuses three independent views of the same campaign:

```python
graph_behavior = min(100, 35*cluster_count + 300*density + 0.35*bot_pressure)
confidence     = 0.35*content_risk + 0.25*narrative_similarity + 0.40*graph_behavior
campaign_detected = confidence >= 55
```

Note the coefficients: **graph behaviour (0.40) outweighs content risk (0.35)**. That is the system's core thesis expressed numerically — how a narrative *moved* matters more than what it *said*.

Narrative similarity uses `sentence-transformers/all-MiniLM-L6-v2` cosine similarity, lazily imported behind `lru_cache` so torch never loads at startup. If unavailable, it degrades to Jaccard token overlap.

**Output:** `CampaignDetectionResult(campaign_detected, confidence_score, cluster_count, narrative_similarity, graph_behavior_score, content_risk_score)`

### 4.4 ThreatClassifier
**File:** `backend/agents/threat_classifier.py`

Final classification via **Groq LLaMA-3.3-70B**, with a deterministic rule ladder as fallback:

| Condition | Threat type | Severity |
|---|---|---|
| `bot_pressure > 70` **or** (campaign ∧ clusters > 2 ∧ confidence > 70) | Possible State-Level Operation | `critical` |
| campaign detected ∧ `bot_pressure > 40` | Coordinated Inauthentic Behavior | `high` |
| otherwise, `content_risk > 50` | Organic Misinformation | `medium` |
| otherwise | Organic Misinformation | `low` |

**Output:** `ThreatAlert(threat_type, severity, explanation, structured_alert)`

### 4.5 TemporalCoordinator
**File:** `backend/agents/temporal_coordinator.py`

Detects synchronised posting. Loads each account's 20 most recent posts from Neo4j (falling back to a Nitter RSS fetch), then compares **every cross-account post pair**. Any pair landing within the **60-second coordination window** is flagged.

```python
density   = flagged_pairs / total_account_pairs
score     = min(1.0, density/3) * 60  +  ((60 - median_delay)/60) * 40
confidence = 0.35 + flagged_pairs*0.08 + ((60 - median_delay)/60)*0.4
```

Both terms matter: **density** (how many pairs coordinate) and **tightness** (how fast the median reply is). Forty loosely-timed pairs is noise; three pairs at two-second delays is an operation.

**Output:** `TemporalCoordinationResult(score, confidence, flagged_pairs, median_delay_seconds, timeline)`

### 4.6 LinguisticFingerprinter
**File:** `backend/agents/linguistic_fingerprinter.py`

Finds accounts that **write like each other** — the stylometric signature of one operator behind many handles. Profiles each account on four features:

1. Average sentence length
2. Vocabulary diversity (unique / total tokens)
3. Punctuation density
4. Emoji frequency

Features are MinMax-normalised and clustered with **DBSCAN** (`eps=0.8`, `min_samples=2`); pairwise cosine similarity is computed on the raw matrix.

```python
score = cluster_bonus * 55  +  mean_within_cluster_similarity * 45
```

**Output:** `LinguisticFingerprintResult(score, clusters, accounts, similarity_matrix, profiles)`

### 4.7 AIOperationDetector
**File:** `backend/agents/ai_operation_detector.py`

Scores whether an account's posts are **LLM-authored**. Four signals, equally weighted at 0.25:

| Signal | LLM tell | Human baseline (measured on live accounts) |
|---|---|---|
| **Burstiness** | Unnaturally regular post lengths | 0.5 – 1.0 |
| **Bigram perplexity** | Low-perplexity, predictable text | 100 – 160 |
| **Semantic consistency** | High internal similarity across posts | < 0.1 |
| **Topic drift** | Minimal drift between consecutive posts | > 0.9 |

Perplexity is add-one-smoothed bigram perplexity computed from scratch. Semantic consistency uses MiniLM embeddings, degrading to Jaccard overlap when unavailable.

**Accounts with fewer than 3 posts return a neutral 25.0** — too little signal to profile, and inventing a verdict from two posts would be dishonest.

**Verdicts:** `LIKELY_AI` (≥75) · `POSSIBLY_AI` (≥45) · `LIKELY_HUMAN` (<45)

### 4.8 DeepfakeDetector
**File:** `backend/agents/deepfake_detector.py` + `backend/agents/ai_image_detector.py`

**No longer STANDBY — fully live.** Answers two separate questions, deliberately kept separate.

**A · Was it edited?** Error Level Analysis re-compresses the image at JPEG q90, diffs against the original, and amplifies the residual into a heatmap (returned as base64 PNG). EXIF is audited for missing metadata, a `Software` tag, and a missing `DateTime`.

```python
score = 0.15
if not exif:              score += 0.20   # stripped metadata
if "Software" in exif:    score += 0.15   # touched by an editor
if "DateTime" not in exif:score += 0.05
if ela_max_diff > 25:     score += 0.25   # strong recompression residue
elif ela_max_diff > 10:   score += 0.15
```

**B · Was it AI-generated?** A **three-model Hugging Face ensemble** — `Organika/sdxl-detector`, `umm-maybe/AI-image-detector`, `haywoodsloan/ai-image-detector-deploy` — queried in parallel via `ThreadPoolExecutor`.

> **The corroboration rule.** Every model we tested has a family of real photographs it confidently mislabels as AI. Taking the **max** across models means any single liar can flag an image alone. So we take the **second-highest score**: a flag requires **two independent models to agree**. If only one model responds, its score is clamped to 0.49 — below the flagging threshold — because a single uncorroborated verdict must never confidently accuse.

**Fusion — and why AI-generation cannot veto ELA.** An early build let a "not AI-generated" verdict suppress the editing forensics, silently clearing genuinely doctored photographs. A real photo edited in Photoshop is *not* AI-generated, and both facts must survive. A confident AI flag can now only ever **raise** the score:

```python
if ai_probability is not None and ai_probability >= 0.5:
    manipulation = 0.6 * ai_probability + 0.4 * heuristic
else:
    manipulation = heuristic          # ELA/EXIF evidence stands on its own
```

Runs ELA-only without an `HF_API_KEY`. Requests carry a custom User-Agent — Wikimedia and most CDNs reject the default `python-requests` one.

### 4.9 WhatsAppAnalyzer
**File:** `backend/agents/whatsapp_analyzer.py`

Pattern-based forward-chain analysis across **English, Hindi and Hinglish**. Detects forward markers (`forwarded many times`, `FWD:`, `share karo`, `sabko bhejo`, 🔁, 📢) and estimates forward depth.

Six weighted misinformation signal families:

| Signal | Weight | Example patterns |
|---|---|---|
| `health_misinfo` | 25 | `cure for cancer`, `big pharma`, `gharelu nuskha` |
| `political_misinfo` | 25 | `EVMs hacked`, `election rig`, `vote kaat` |
| `unnamed_authority` | 20 | `doctors say`, `sarkar chupa rahi`, `sources say` |
| `conspiracy_markers` | 20 | `wake up`, `mainstream media won't`, `asli sach` |
| `urgency_language` | 15 | `breaking`, `abhi share karo`, `turant` |
| `share_bait` | 15 | `send to all`, `sabko dikhao`, `please forward` |

Base score 20, plus signal weights, plus `min(forward_depth * 5, 15)`, **capped at 97**. Language ID is a Devanagari-character count plus a Hinglish function-word count (`karo`, `hai`, `nahi`, `yeh`…). Claim extraction takes the first substantial sentence that is *not* forward-chain boilerplate.

**Output:** `WhatsAppAnalysisResult(is_forward, forward_depth, misinformation_score, risk_level, language_detected, forward_signals, red_flags, claim_extracted, verdict, fact_check_matches)`

### 4.10 SarvamLanguageDetector
**File:** `backend/agents/sarvam_language_detector.py`

Indian-language identification via **Sarvam AI's `text-lid`** endpoint. `text-lid` returns no confidence field, so a successfully detected language is treated as confident (1.0) and `unknown` as 0.0. Returns `unknown` without an API key — the pipeline continues on the regex heuristic.

### Ingestion Modules (not roster agents)

**`bluesky_ingestion.py`** — the live wire. `ensure_account_data(handle)` checks whether the graph already holds posts for a handle; if not, it fetches up to 20 real posts from the **Bluesky public API** (no auth, reposts and replies excluded) and `MERGE`s them into Neo4j. Returns `graph`, `bluesky`, or `none`. **Never raises** — analysis proceeds regardless. Bare handles resolve as `name.bsky.social`.

**`fact_checker_ingestion.py`** — pulls the latest 5 debunked claims from each of **Alt News, BOOM, FactChecker.in, and The Quint**, each re-scored through ContentAnalyzer. Fetched via `urllib` with an explicit 8s timeout (feedparser has no timeout and will hang the request thread) and a custom User-Agent. A dead feed is skipped silently so one outage never takes the whole feed down. Cached 300s.

---

## 5. Bot Detection — Technical Detail

Two scoring paths.

**Cypher path** (`calculate_bot_scores_neo4j`) — coarse, fast, runs inside AuraDB and **persists `bot_score` onto each Account node**:

```cypher
SET a.bot_score = (
  CASE WHEN a.post_count > 50             THEN 0.25 ELSE 0 END +
  CASE WHEN a.age_days   < 30             THEN 0.20 ELSE 0 END +
  CASE WHEN a.following  > a.followers*10 THEN 0.20 ELSE 0 END
)
```

**Composite path** (`calculate_bot_score`) — the score NetworkMapper reports, enriched with graph-topology metrics:

```python
score = 100 * min(1.0,
    0.22 * age_signal          # newer account = more suspicious
  + 0.18 * frequency_signal    # posts per hour, normalised at 20/h
  + 0.14 * connectivity_signal # graph degree, normalised at 10
  + 0.12 * ratio_signal        # follower/following imbalance
  + 0.10 * betweenness_signal  # bridge accounts linking clusters
  + 0.10 * clustering_signal   # inverted — bots have sparse neighbourhoods
  + 0.08 * pagerank_signal     # amplifier influence
  + verified_signal            # +0.15 penalty if unverified
)
```

The three topology signals — PageRank, betweenness, clustering — are what separate this from metadata heuristics. **Betweenness** finds the bridge accounts wiring separate clusters together, which is exactly where a campaign's coordination hubs sit.

### Community Detection

AuraDB's free tier has **no GDS library**, so clusters are found with plain Cypher plus **label propagation**: fetch all `COORDINATES_WITH|INTERACTS` edges, let every node adopt its neighbourhood's dominant label, iterate to convergence (max 10 rounds), then write `cluster_id` back onto each Account. The NetworkX fallback uses greedy modularity maximisation.

---

## 6. Graph Data Model

```cypher
(:Account)-[:SHARED]->(:Post)-[:PART_OF]->(:Campaign)
(:Account)-[:PART_OF]->(:Campaign)
(:Account)-[:INTERACTS {relation}]->(:Account)      // retweet / mention / reply
(:Account)-[:COORDINATES_WITH {delay_seconds}]->(:Account)
```

**Account keys are campaign-scoped.** Node IDs repeat across the seed files (`a01…a20` in every campaign), so the `MERGE` key is `"{campaign_id}:{node_id}"` — without this, three campaigns would collapse into one graph.

**`COORDINATES_WITH` is computed at ingest, never seeded.** `_coordination_pairs()` compares every post pair in a campaign; any two accounts posting within **60 seconds** get an edge carrying the tightest observed `delay_seconds`.

**Live accounts** are merged with `source: 'bluesky'` and key `live:{handle}`, so they coexist with seeded campaign accounts and are analysed by the exact same Cypher.

---

## 7. API Reference

Base URL (local): `http://localhost:8000` · Production: FastAPI on Render, proxied via Next.js API routes.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Health check |
| `GET` | `/campaigns` | All campaigns + node/edge data (Cypher → AuraDB) |
| `GET` | `/campaigns/{id}` | Single campaign |
| `POST` | `/analyze-text` | Groq LLaMA-3.3-70B misinformation scoring |
| `POST` | `/analyze-network` | Composite bot scoring over an account graph |
| `POST` | `/detect-campaign` | LangGraph campaign-detection pipeline |
| `POST` | `/generate-alert` | Groq threat classification |
| `POST` | `/investigate` | Full 5-agent investigation of one message |
| `POST` | `/whatsapp/analyze` | WhatsApp forward analysis (patterns + LLM) |
| `POST` | `/account-intel/analyze` | Temporal + stylometric + AI-operation analysis, with live Bluesky ingestion |
| `GET` | `/account-intel/accounts/{handle}` | Same, single handle |
| `POST` | `/deepfake/analyze` | ELA forensics + two-model AI-image verdict |
| `POST` | `/language/detect` | Sarvam Indian-language identification |
| `GET` | `/live-feed` | Live debunked claims from fact-checker RSS (300s cache) |
| `GET` | `/agents/status` | Real per-agent task counts from the running process |

### Request / Response Examples

**POST `/analyze-text`**
```json
Request:  { "text": "BREAKING: EVMs hacked — share before deleted" }

Response: {
  "misinformation_score": 87,
  "confidence": 0.87,
  "signals": { "lexical_score": 0.34, "model_score": 0.95, "score_blend": 0.87 }
}
```

**POST `/account-intel/analyze`**
```json
Request:  { "handles": ["someone.bsky.social", "another.bsky.social"] }

Response: {
  "temporal":  { "score": 72, "confidence": 0.81, "flagged_pairs": 6,
                 "median_delay_seconds": 14.5, "timeline": [...] },
  "linguistic":{ "score": 68.4, "clusters": [0, 0], "accounts": [...],
                 "similarity_matrix": [[1.0, 0.97], [0.97, 1.0]], "profiles": [...] },
  "ai_operation": { "score": 81.2, "verdict": "LIKELY_AI", "signals": [...] },
  "sources": { "someone.bsky.social": "bluesky", "another.bsky.social": "graph" }
}
```

**POST `/investigate`**
```json
Response: {
  "steps": [
    { "agent": "WhatsAppAnalyzer",       "duration_ms": 3,   "summary": "Forward detected — 3 pattern red flags, claim extracted" },
    { "agent": "ContentAnalyzer",        "duration_ms": 812, "summary": "Groq LLM misinformation score: 91/100" },
    { "agent": "SarvamLanguageDetector", "duration_ms": 240, "summary": "Language: hi (100% confidence)" },
    { "agent": "FactCheckCrossRef",      "duration_ms": 6,   "summary": "1 related debunked claim(s) in live fact-checker feed" },
    { "agent": "ThreatClassifier",       "duration_ms": 690, "summary": "Coordinated Inauthentic Behavior — severity HIGH" }
  ],
  "misinformation_score": 88,
  "risk_level": "HIGH",
  "language": "hi",
  "claim_extracted": "...",
  "red_flags": ["Uses urgency language to pressure sharing", "..."],
  "fact_check_matches": [...],
  "threat_alert": { ... }
}
```

---

## 8. `/investigate` — Score Fusion

Five agents disagree by design. The blend is explicit rather than averaged:

```python
if wa.forward_signals or wa.is_forward:      # forward-shaped → trust the LLM more
    final = 0.35 * pattern_score + 0.65 * llm_score
    if llm_score >= 80:
        final = max(final, 75)               # a confident LLM can't be diluted away
else:                                        # plain text → trust patterns more
    final = 0.6 * pattern_score + 0.4 * llm_score

if fact_check_matches:
    final = max(final, 80)                   # a known debunk outranks both models

final = min(final, 97)                       # never claim certainty
```

Fact-check cross-reference is token-overlap matching of the extracted claim against the live debunked-claim feed, returning the top 3 matches.

---

## 9. Frontend Architecture

**Framework:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4
**State:** React hooks — no external state library needed at this scale.

### Key Components

**`NetworkGraph.tsx`** — D3 force simulation (link, charge, center, collision forces), SVG rendering, drag behaviour, hover tooltips as absolutely-positioned React divs, campaign switching with opacity transition on simulation restart. Nodes and edges are a **direct projection of AuraDB**, served by `GET /campaigns`.

**Account Intel** (`app/dashboard/account-intel/`) — `TemporalHeatmap`, `FingerprintCluster`, `AIOperationScores`, `VerdictPanel`. Post timestamps are stored as **epoch seconds** in Neo4j and converted to milliseconds for the heatmap.

**Image Forensics** (`app/dashboard/image-forensics/`) — renders the base64 ELA heatmap alongside the EXIF table and the two-model AI verdict.

**WhatsApp Intel** (`app/dashboard/whatsapp/`) — pattern analysis plus the one-click 5-agent investigation, streaming each step with its real measured latency.

**`AlertFeed.tsx`** — severity-classified alerts with campaign attribution and one-click pivot into the network graph.

### Next.js API Routes (Proxy Layer)

All backend calls route through `/api/*` to hide the backend URL, handle CORS in production, transform FastAPI response shapes into frontend TypeScript interfaces, and fall back to mock data when the backend is unreachable.

---

## 10. Data Layer

**Neo4j AuraDB (primary).** Accounts, posts, campaigns, interaction and coordination edges. Seeded on FastAPI startup by `seed_database()`; failure is caught and logged so the API still boots.

**Supabase (PostgreSQL + pgvector).** Retained for campaign/alert persistence and vector search headroom.

```sql
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  threat_level TEXT NOT NULL,
  account_count INTEGER,
  confidence FLOAT,
  narrative TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id TEXT REFERENCES campaigns(id),
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  recommendation TEXT
);
```

---

## 11. Deployment

```
User Browser
     │
     ▼
Vercel Edge Network (CDN) ── Next.js 16
     │                        ├── Static assets
     │                        ├── Server components
     └── /api/* proxy ────────┘
                │
                ▼
        Render — FastAPI + Uvicorn (free tier, 512MB)
                │
    ┌───────────┼───────────┬──────────┬────────────┐
    ▼           ▼           ▼          ▼            ▼
Neo4j AuraDB  Groq      Sarvam AI  HuggingFace  Bluesky API
(primary)     LLaMA-70B  text-lid   classifiers  (live posts)
```

**The 512MB constraint is load-bearing.** It is why there are no local model weights, why `sentence-transformers` is lazily imported behind `lru_cache`, and why `TOKENIZERS_PARALLELISM=false` is set before any import. Backend config lives in `render.yaml`.

---

## 12. Campaign Datasets

Three **synthetic** datasets emulating coordinated inauthentic behaviour patterns documented in public research on influence operations.

| Campaign | ID | Threat Level | Seed Confidence | Emulates |
|---|---|---|---|---|
| **Operation Pulse** | `campaign-001` | HIGH | 0.92 | Election misinformation — EVM tampering claims amplified by bot networks |
| **MedFear** | `campaign-002` | MED | 0.65 | Anti-vaccine narrative with fabricated adverse-effect reports |
| **ReviewStorm** | `campaign-003` | LOW | 0.35 | Coordinated fake review bombing on e-commerce platforms |

Account data, network topology, and narrative content are all generated. **No real user data is used in the seed sets.** Live analysis (Bluesky, fact-checker feeds) operates on real public data.

---

## 13. Degradation Behaviour

Every external dependency has a defined failure mode. Nothing hard-fails.

| Failure | Fallback |
|---|---|
| Neo4j unreachable | JSON campaign fallback → in-memory NetworkX pipeline |
| Groq unavailable | Deterministic lexical scorer + rule-based threat classifier |
| No `HF_API_KEY` | ELA + EXIF forensics only; AI verdict omitted |
| No `SARVAM_API_KEY` | Regex EN/HI/Hinglish heuristic |
| Bluesky fetch fails | `source: "none"`; seeded graph data still analysed |
| A fact-checker feed is down | Skipped silently; remaining feeds still served |
| LangGraph missing | Identical three steps executed synchronously |
| `sentence-transformers` missing | Jaccard token-overlap similarity |
| Only one HF model responds | Score clamped to 0.49 — cannot flag alone |

---

## 14. Scalability Considerations

**Horizontal scaling.** Each agent is a stateless function, deployable as an independent service behind a load balancer.

**Graph scaling.** AuraDB free tier has no GDS, so community detection is hand-rolled label propagation. A paid tier unlocks GDS Louvain/Leiden and native PageRank, replacing both the Python fallback and the label-propagation loop with in-database calls.

**Live ingestion.** Bluesky and fact-checker RSS are live today. Telegram (Telethon) and Mastodon connectors extend the same `ensure_account_data` path.

**Caching.** The live feed is cached 300s. A Redis layer between FastAPI and the agents would deduplicate repeated analysis of identical content.

**Vector search.** Supabase pgvector is integrated for semantic similarity at scale.

---

## 15. Local Setup

### Prerequisites
- Node.js 18+ · Python 3.11+
- Neo4j AuraDB instance (free) · Groq API key (free at console.groq.com)
- Optional: Sarvam AI key, Hugging Face token, Supabase project

### Installation

```bash
git clone https://github.com/uttampreet-dev/ShadowTrace.git
cd ShadowTrace

npm install
pip install -r backend/requirements.txt
```

`.env.local` (project root):
```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GROQ_API_KEY=...
BACKEND_API_URL=http://localhost:8000
NEXT_PUBLIC_API_URL=http://localhost:8000
```

`backend/.env`:
```env
GROQ_API_KEY=...
NEO4J_URI=neo4j+s://xxxxxxxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=...
SARVAM_API_KEY=...        # optional
HF_API_KEY=...            # optional
```

### Running

```bash
# Terminal 1 — AI backend (seeds AuraDB on startup)
uvicorn backend.main:app --reload --port 8000

# Terminal 2 — Frontend
npm run dev
```

Open `http://localhost:3000`. To see the live path immediately: **Account Intel → enter any real Bluesky handle**.

---

## 16. Known Limitations

- **AuraDB free tier has no GDS library** — community detection is label propagation in Python rather than in-database Louvain. Correct, but it does not scale to millions of nodes.
- **Temporal coordination is O(n²) in posts per account pair.** Fine at 20 posts × a handful of handles; needs windowed bucketing at scale.
- **AI-image classifiers are general-purpose**, not trained on Indian misinformation imagery. The two-model agreement rule limits false positives but a purpose-trained detector would be materially better.
- **Twitter/X ingestion is unavailable.** Nitter is effectively dead; `NITTER_BASE_URL` remains configurable but the live path is Bluesky. Official API access is the migration route.
- **Seed campaign datasets are synthetic** and labelled as such throughout. Live analysis paths (Bluesky, fact-checker RSS) use real public data.
- **Sarvam `text-lid` returns no confidence score** — a detected language is treated as confident, which slightly overstates certainty on very short text.
- **Render free tier cold-starts.** The first request after idle can take several seconds to wake the backend.

---

*ShadowTrace — Detect. Trace. Neutralize.*
