# ShadowTrace — Architecture Diagram

*A 10-agent pipeline on a Neo4j AuraDB graph substrate, with live ingestion from Bluesky and Indian fact-checker feeds.*

---

## 1. System Architecture Overview

```mermaid
flowchart TD
    subgraph SOURCES["📡  DATA SOURCES"]
        BS["🦋 Bluesky Public API<br/>LIVE — any real handle"]
        RSS["📰 Fact-Checker RSS<br/>LIVE — AltNews · BOOM<br/>FactChecker · The Quint"]
        WA["💬 WhatsApp Forwards<br/>EN / HI / Hinglish"]
        IMG["🖼 Image URLs<br/>ELA + EXIF + AI classifiers"]
        SEED["🗂 Synthetic Campaign Sets<br/>Operation Pulse · MedFear · ReviewStorm"]
    end

    subgraph INGEST["⚡  INGESTION LAYER"]
        ING["FastAPI Ingestion<br/>bluesky_ingestion · fact_checker_ingestion · seed"]
    end

    GRAPH[("🕸  Neo4j AuraDB<br/>Account · Post · Campaign<br/>SHARED · PART_OF<br/>INTERACTS · COORDINATES_WITH")]

    subgraph AGENTS["🤖  10-AGENT PIPELINE"]
        direction LR
        subgraph CORE["Core Detection"]
            CA["ContentAnalyzer<br/>──────────────<br/>Groq LLaMA-3.3-70B<br/>+ lexical blend"]
            NM["NetworkMapper<br/>──────────────<br/>Cypher bot scoring<br/>PageRank · Betweenness"]
            CD["CampaignDetector<br/>──────────────<br/>LangGraph state machine"]
            TC["ThreatClassifier<br/>──────────────<br/>Groq LLaMA-3.3-70B<br/>Rule-based fallback"]
        end
        subgraph ACCT["Account Intelligence"]
            TCO["TemporalCoordinator<br/>──────────────<br/>60s coordination windows"]
            LF["LinguisticFingerprinter<br/>──────────────<br/>DBSCAN stylometry"]
            AIO["AIOperationDetector<br/>──────────────<br/>Perplexity · Burstiness<br/>Topic drift"]
        end
        subgraph MEDIA["Media & Language"]
            DD["DeepfakeDetector<br/>──────────────<br/>ELA + EXIF<br/>+ HF ensemble"]
            WAA["WhatsAppAnalyzer<br/>──────────────<br/>Forward-chain patterns"]
            SLD["SarvamLanguageDetector<br/>──────────────<br/>Indian-language ID"]
        end
    end

    subgraph DASH["🖥  MISSION CONTROL DASHBOARD"]
        NG["Network Graph<br/>D3.js Force-Directed"]
        AI2["Account Intel<br/>Coordination · Clusters"]
        IF["Image Forensics<br/>ELA Heatmap"]
        WI["WhatsApp Intel<br/>5-Agent Investigation"]
        LFEED["Live Feed<br/>Debunked Claims"]
        AF["Alert Feed<br/>Severity Classified"]
        AS["Agent Monitor<br/>Real Task Counts"]
    end

    BS & RSS & WA & IMG & SEED --> ING
    ING --> GRAPH
    GRAPH --> CA & NM & CD & TC
    GRAPH --> TCO & LF & AIO
    ING --> DD & WAA & SLD
    CA & NM & CD & TC & TCO & LF & AIO & DD & WAA & SLD --> DASH

    style SOURCES fill:#0f172a,stroke:#3b82f6,color:#e2e8f0
    style INGEST fill:#0f172a,stroke:#7c3aed,color:#e2e8f0
    style AGENTS fill:#0f172a,stroke:#a855f7,color:#e2e8f0
    style CORE fill:#1a1a2e,stroke:#c084fc,color:#e2e8f0
    style ACCT fill:#1a1a2e,stroke:#c084fc,color:#e2e8f0
    style MEDIA fill:#1a1a2e,stroke:#c084fc,color:#e2e8f0
    style DASH fill:#0f172a,stroke:#f59e0b,color:#e2e8f0

    classDef sourceNode fill:#1e3a5f,stroke:#3b82f6,color:#e2e8f0
    classDef agentNode fill:#2e1065,stroke:#a855f7,color:#e2e8f0
    classDef threatNode fill:#450a0a,stroke:#ef4444,color:#e2e8f0
    classDef dbNode fill:#052e16,stroke:#22c55e,color:#a7f3d0
    classDef dashNode fill:#1c1917,stroke:#f59e0b,color:#e2e8f0

    class BS,RSS,WA,IMG,SEED sourceNode
    class ING agentNode
    class CA,NM,CD,TCO,LF,AIO,DD,WAA,SLD agentNode
    class TC threatNode
    class GRAPH dbNode
    class NG,AI2,IF,WI,LFEED,AF,AS dashNode
```

---

## 2. Neo4j AuraDB — Graph Data Model

The graph is the substrate, not a cache. Coordination is a **relationship**, so it is stored as one.

```mermaid
erDiagram
    ACCOUNT ||--o{ POST : SHARED
    ACCOUNT }o--|| CAMPAIGN : PART_OF
    POST }o--|| CAMPAIGN : PART_OF
    ACCOUNT }o--o{ ACCOUNT : INTERACTS
    ACCOUNT }o--o{ ACCOUNT : COORDINATES_WITH

    ACCOUNT {
        string key PK "campaign-scoped: cid:id"
        string id
        string handle
        string campaign_id
        int    age_days
        int    followers
        int    following
        bool   verified
        int    post_count
        float  bot_score "written by Cypher scoring"
        int    cluster_id "written by label propagation"
        string source "bluesky | seed"
    }
    POST {
        string key PK
        string id
        string text
        int    timestamp "epoch seconds"
    }
    CAMPAIGN {
        string id PK
        string name
        string threat_level
        float  confidence
        string narrative
        string start_time
    }
```

**The load-bearing edge — `COORDINATES_WITH`.**
It is *computed*, never seeded. During ingestion, every pair of posts from different accounts landing within **60 seconds** of each other materialises a coordination edge carrying `delay_seconds`. Synchronised amplification therefore stops being an O(n²) batch scan and becomes a **one-hop traversal**.

```cypher
// Bot scoring runs inside AuraDB and persists onto the node
MATCH (a:Account)-[:PART_OF]->(c:Campaign {id: $campaign_id})
SET a.bot_score = (
  CASE WHEN a.post_count > 50            THEN 0.25 ELSE 0 END +
  CASE WHEN a.age_days   < 30            THEN 0.20 ELSE 0 END +
  CASE WHEN a.following  > a.followers*10 THEN 0.20 ELSE 0 END
)
RETURN a.handle, a.bot_score ORDER BY a.bot_score DESC
```

---

## 3. Live Account Intelligence — Execution Sequence

The flow that proves ShadowTrace is not a mock: a **real handle**, ingested live, analysed by three agents through the same Cypher the seeded data uses.

```mermaid
sequenceDiagram
    actor Analyst
    participant UI as Account Intel UI
    participant GW as FastAPI Gateway
    participant BSI as bluesky_ingestion
    participant BS as Bluesky Public API
    participant DB as Neo4j AuraDB
    participant TCO as TemporalCoordinator
    participant LF as LinguisticFingerprinter
    participant AIO as AIOperationDetector

    Analyst->>UI: Enter real handle(s)
    UI->>GW: POST /account-intel/analyze

    activate GW
    GW->>BSI: ensure_account_data(handle)
    activate BSI
    BSI->>DB: MATCH (a:Account)-[:SHARED]->(p:Post) — count
    alt Graph already has posts
        DB-->>BSI: n > 0 → source = "graph"
    else Unknown handle
        BSI->>BS: getAuthorFeed (no auth, posts_no_replies)
        BS-->>BSI: up to 20 real posts
        BSI->>DB: MERGE Account · MERGE Post · MERGE SHARED
        DB-->>BSI: source = "bluesky"
    end
    BSI-->>GW: sources map
    deactivate BSI

    par Three forensic layers over the same graph
        GW->>TCO: analyze(handles)
        TCO->>DB: posts ORDER BY timestamp
        TCO-->>GW: score · flagged_pairs · median_delay · timeline
    and
        GW->>LF: analyze(handles)
        LF->>DB: posts
        LF-->>GW: DBSCAN clusters · similarity matrix · profiles
    and
        GW->>AIO: analyze(handles)
        AIO->>DB: posts
        AIO-->>GW: perplexity · burstiness · drift · verdict
    end

    GW-->>UI: AccountIntelResponse
    deactivate GW
    UI-->>Analyst: Coordination score · cluster peers · AI verdict
```

---

## 4. `/investigate` — The 5-Agent Chain

One WhatsApp forward, five agents, streamed step-by-step with real per-agent latency.

```mermaid
flowchart LR
    IN(["💬 Forward text"])
    S1["1 · WhatsAppAnalyzer<br/>──────────────<br/>Forward-chain patterns<br/>Claim extraction<br/>EN / HI / Hinglish"]
    S2["2 · ContentAnalyzer<br/>──────────────<br/>Groq LLaMA-3.3-70B<br/>0-100 misinfo score"]
    S3["3 · SarvamLanguageDetector<br/>──────────────<br/>Indian-language ID"]
    S4["4 · FactCheckCrossRef<br/>──────────────<br/>Token overlap vs.<br/>live debunked claims"]
    S5["5 · ThreatClassifier<br/>──────────────<br/>Groq severity + rationale"]
    OUT(["📋 Score · Risk · Red flags<br/>Debunk matches · Threat alert"])

    IN --> S1 --> S2 --> S3 --> S4 --> S5 --> OUT

    classDef step fill:#1e1b4b,stroke:#818cf8,color:#e2e8f0
    classDef io fill:#0f172a,stroke:#94a3b8,color:#e2e8f0
    class S1,S2,S3,S4,S5 step
    class IN,OUT io
```

**Score fusion.** The agents disagree by design, so the blend is explicit:

```python
if wa.forward_signals or wa.is_forward:      # forward-shaped → trust the LLM more
    final = 0.35 * pattern_score + 0.65 * llm_score
    if llm_score >= 80: final = max(final, 75)
else:                                        # plain text → trust patterns more
    final = 0.6 * pattern_score + 0.4 * llm_score

if fact_check_matches:                       # a known debunk outranks both
    final = max(final, 80)

final = min(final, 97)                       # never claim certainty
```

The cap at 97 is deliberate. A detector that reports 100% confidence is lying.

---

## 5. Bot Detection — Composite Scoring

Eight weighted behavioural signals, computed over graph metrics AuraDB and NetworkX both supply.

```mermaid
flowchart LR
    ACC(["👤 Account<br/>metadata + graph metrics"])

    subgraph SIGNALS["  Weighted Behavioural Signals  "]
        F1["Account Age<br/>(newer = worse)<br/>× 0.22"]
        F2["Posting Frequency<br/>(posts / hour)<br/>× 0.18"]
        F3["Connectivity<br/>(graph degree)<br/>× 0.14"]
        F4["Follower / Following<br/>Imbalance<br/>× 0.12"]
        F5["Betweenness Centrality<br/>(bridge accounts)<br/>× 0.10"]
        F6["Clustering Coefficient<br/>(inverted)<br/>× 0.10"]
        F7["PageRank<br/>(amplifier influence)<br/>× 0.08"]
        F8["Unverified Penalty<br/>+ 0.15"]
    end

    SCORE{{"Composite<br/>Bot Score<br/>0 – 100"}}

    BOT["🤖 BOT<br/>High composite<br/>Flagged + clustered"]
    SUS["⚠️ SUSPICIOUS<br/>Mid composite<br/>Monitored amplifier"]
    ORG["✅ ORGANIC<br/>Low composite<br/>Normal activity"]

    ACC --> F1 & F2 & F3 & F4 & F5 & F6 & F7 & F8
    F1 & F2 & F3 & F4 & F5 & F6 & F7 & F8 --> SCORE
    SCORE -->|"high"| BOT
    SCORE -->|"mid"| SUS
    SCORE -->|"low"| ORG

    classDef signal fill:#1e1b4b,stroke:#6366f1,color:#e2e8f0
    classDef bot fill:#450a0a,stroke:#ef4444,color:#fca5a5
    classDef sus fill:#431407,stroke:#f97316,color:#fed7aa
    classDef org fill:#052e16,stroke:#22c55e,color:#a7f3d0
    classDef acc fill:#0f172a,stroke:#94a3b8,color:#e2e8f0

    class F1,F2,F3,F4,F5,F6,F7,F8 signal
    class BOT bot
    class SUS sus
    class ORG org
    class ACC acc
```

Two scoring paths exist. The **Cypher path** (§2) runs inside AuraDB on a coarse three-term rule and persists `bot_score` onto the node. The **composite path** above (`graph/bot_detection.py`) enriches with PageRank, betweenness and clustering, and is what NetworkMapper reports.

---

## 6. Image Forensics — The Two-Model Agreement Rule

Two independent questions, deliberately never allowed to overrule each other.

```mermaid
flowchart TD
    IMG(["🖼 Image URL"])
    DL["Download<br/>(custom UA — CDNs reject python-requests)"]

    subgraph FORENSIC["  A · Was it EDITED?  "]
        ELA["Error Level Analysis<br/>Re-compress @ q90 · diff · amplify"]
        EXIF["EXIF Audit<br/>Missing metadata · Software tag<br/>Missing DateTime"]
        HEUR{{"Heuristic<br/>manipulation probability"}}
    end

    subgraph GEN["  B · Was it AI-GENERATED?  "]
        M1["Organika/sdxl-detector"]
        M2["umm-maybe/AI-image-detector"]
        M3["haywoodsloan/ai-image-detector"]
        VOTE{{"2-of-N agreement<br/>take 2nd-highest score"}}
    end

    FUSE{{"Fusion"}}
    OUT(["📊 Manipulation probability<br/>+ ELA heatmap<br/>+ AI verdict"])

    IMG --> DL
    DL --> ELA & EXIF
    ELA & EXIF --> HEUR
    DL -.->|"HF_API_KEY set"| M1 & M2 & M3
    M1 & M2 & M3 --> VOTE
    HEUR --> FUSE
    VOTE --> FUSE
    FUSE --> OUT

    classDef forensic fill:#1e1b4b,stroke:#6366f1,color:#e2e8f0
    classDef model fill:#2e1065,stroke:#a855f7,color:#e2e8f0
    classDef gate fill:#431407,stroke:#f97316,color:#fed7aa
    classDef io fill:#0f172a,stroke:#94a3b8,color:#e2e8f0

    class ELA,EXIF model
    class M1,M2,M3 model
    class HEUR,VOTE,FUSE gate
    class IMG,DL,OUT io
```

**Why the second-highest score, not the max?** Every classifier we tested has a family of real photographs it confidently mislabels. Taking the max means **any single liar can flag an image alone**. Taking the second-highest requires **two independent models to agree** — one false positive can never carry the verdict. If only one model responds, its score is clamped below the flagging threshold.

**Why AI-generation cannot veto ELA.** They answer different questions. A real photograph, doctored in Photoshop, is *not* AI-generated — and an early build let the "not AI" verdict suppress the editing evidence, silently clearing manipulated images. Now a confident AI flag can only ever **raise** the score:

```python
if ai_probability is not None and ai_probability >= 0.5:
    manipulation = 0.6 * ai_probability + 0.4 * heuristic   # AI flag raises it
else:
    manipulation = heuristic                                # ELA/EXIF stands alone
```

---

## 7. LangGraph Campaign-Detection State Machine

```mermaid
flowchart LR
    S(["▶ START"])
    LOAD["load<br/>──────────────<br/>Resolve campaign<br/>from AuraDB or payload"]
    ANA["analyze<br/>──────────────<br/>NetworkMapper → clusters, density, bot pressure<br/>ContentAnalyzer → per-post risk<br/>SentenceTransformers → narrative similarity"]
    FIN["finalize<br/>──────────────<br/>CampaignDetectionResult"]
    E(["⏹ END"])

    S -->|"source"| LOAD
    LOAD -->|"campaign state"| ANA
    ANA -->|"analysis dict"| FIN
    FIN --> E

    style S fill:#052e16,stroke:#22c55e,color:#a7f3d0
    style E fill:#450a0a,stroke:#ef4444,color:#fca5a5

    classDef stateNode fill:#1e1b4b,stroke:#818cf8,color:#e2e8f0
    class LOAD,ANA,FIN stateNode
```

Confidence fuses three independent views of the same campaign:

```python
graph_behavior = min(100, 35*cluster_count + 300*density + 0.35*bot_pressure)
confidence     = 0.35*content_risk + 0.25*narrative_similarity + 0.40*graph_behavior
campaign_detected = confidence >= 55
```

Note the weighting: **graph behaviour outranks content**. That is the thesis of the whole system expressed as a coefficient — *what* was said matters less than *how it moved*.

If LangGraph is unavailable, `_run_detection` executes the identical three steps synchronously. The state machine is an orchestration choice, never a hard dependency.

---

## 8. Deployment Architecture

```mermaid
flowchart TD
    USER(["👤 Analyst"])

    subgraph CDN["🌐  Vercel Edge Network — Global CDN"]
        subgraph NEXT["▲  Next.js 16 · App Router"]
            STATIC["Static<br/>Landing · OutbreakCanvas"]
            SC["Server Components<br/>Dashboard shell"]
            PROXY["API Routes /api/*<br/>Proxy · CORS · Fallback"]
        end
    end

    subgraph RENDER["🐍  Render — FastAPI Agent Backend"]
        FASTAPI["FastAPI + Uvicorn<br/>seed_database() on startup"]
        subgraph PIPE["10-Agent Pipeline"]
            P1["Core: Content · Network<br/>Campaign · Threat"]
            P2["Account: Temporal<br/>Linguistic · AI-Operation"]
            P3["Media: Deepfake<br/>WhatsApp · Sarvam"]
        end
    end

    subgraph EXT["☁  External Services"]
        AURA[("Neo4j AuraDB<br/>Primary graph store")]
        GROQ["Groq<br/>LLaMA-3.3-70B"]
        SARVAM["Sarvam AI<br/>text-lid"]
        HF["Hugging Face<br/>Image classifiers"]
        BSKY["Bluesky<br/>Public API"]
        SB[("Supabase<br/>Postgres")]
    end

    USER --> CDN
    STATIC & SC --> USER
    PROXY -->|"HTTPS"| FASTAPI
    FASTAPI --> P1 & P2 & P3
    P1 & P2 --> AURA
    P1 & P3 --> GROQ
    P3 --> SARVAM & HF
    P2 --> BSKY
    FASTAPI --> SB
    AURA --> FASTAPI --> PROXY

    style CDN fill:#0f172a,stroke:#6366f1,color:#e2e8f0
    style NEXT fill:#1a1a2e,stroke:#818cf8,color:#e2e8f0
    style RENDER fill:#0f172a,stroke:#f97316,color:#e2e8f0
    style PIPE fill:#1a1a2e,stroke:#fb923c,color:#e2e8f0
    style EXT fill:#0f172a,stroke:#22c55e,color:#e2e8f0

    classDef userNode fill:#1e3a5f,stroke:#3b82f6,color:#e2e8f0
    classDef agentNode fill:#2e1065,stroke:#a855f7,color:#e2e8f0
    classDef dbNode fill:#052e16,stroke:#22c55e,color:#a7f3d0
    classDef svcNode fill:#1c1917,stroke:#f59e0b,color:#e2e8f0

    class USER userNode
    class P1,P2,P3 agentNode
    class AURA,SB dbNode
    class GROQ,SARVAM,HF,BSKY svcNode
```

**Memory constraint drove real architecture.** Render's free tier caps at 512MB. `torch` + `transformers` OOM on load, which is why ContentAnalyzer is a **Groq API call with a deterministic lexical blend** rather than a local BERT checkpoint, and why `sentence-transformers` is lazily imported behind `lru_cache` instead of loaded at startup. The constraint made the system lighter *and* better: a 70B model beats a fine-tuned BERT-tiny at this task.

---

## 9. Degradation Behaviour

Every external dependency has a defined failure mode. Nothing in the pipeline hard-fails.

```mermaid
flowchart LR
    subgraph DEG["  Failure → Fallback  "]
        D1["Neo4j unreachable<br/>→ JSON campaign fallback<br/>→ NetworkX in-memory graph"]
        D2["Groq unavailable<br/>→ Deterministic lexical scorer<br/>→ Rule-based threat classifier"]
        D3["No HF_API_KEY<br/>→ ELA + EXIF forensics only"]
        D4["No SARVAM_API_KEY<br/>→ Regex EN/HI/Hinglish heuristic"]
        D5["Bluesky fetch fails<br/>→ source='none', seeded graph still analysed"]
        D6["Fact-checker feed down<br/>→ Skipped silently, others still served"]
        D7["LangGraph missing<br/>→ Synchronous 3-step execution"]
        D8["sentence-transformers missing<br/>→ Jaccard lexical similarity"]
    end

    classDef deg fill:#1c1917,stroke:#f59e0b,color:#fed7aa
    class D1,D2,D3,D4,D5,D6,D7,D8 deg
```

---

*ShadowTrace — Detect. Trace. Neutralize.*
