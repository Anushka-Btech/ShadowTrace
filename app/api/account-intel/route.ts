import { NextResponse } from 'next/server'

// Allow up to 60s so a cold-starting free-tier backend still returns real data
export const maxDuration = 60

const BACKEND = process.env.BACKEND_API_URL ?? 'http://localhost:8000'

// ─── Shapes the dashboard components consume ──────────────────────────────────

export interface AccountIntelResult {
  status:            'complete'
  source:            'backend' | 'mock'
  /** Per-handle data provenance from ingestion: 'graph' | 'bluesky' | 'none' (no posts found). */
  data_sources?:     Record<string, string>
  accounts_analyzed: number
  temporal: {
    score:                number
    flagged_pairs:        number
    median_delay_seconds: number
    timeline: {
      account: string
      posts:   { timestamp: number; text_preview: string }[]
    }[]
  }
  linguistic: {
    score:    number
    clusters: number
    accounts: {
      handle:         string
      cluster_id:     number
      ai_probability: number
      features: {
        avg_sentence_length:  number
        vocabulary_diversity: number
        punctuation_density:  number
        emoji_frequency:      number
      }
    }[]
    similarity_matrix: number[][]
  }
  ai_operation: {
    score: number
    accounts: {
      handle:   string
      ai_score: number
      signals: {
        burstiness:           number
        perplexity_score:     number
        semantic_consistency: number
        topic_drift:          number
      }
      verdict: 'LIKELY_AI' | 'POSSIBLY_AI' | 'LIKELY_HUMAN'
    }[]
  }
  verdict:    'HIGH' | 'MED' | 'LOW'
  confidence: number
  summary:    string
}

// ─── Backend response shapes (backend/api/schemas.py) ─────────────────────────

interface BackendResponse {
  temporal: {
    score:                number
    confidence:           number
    flagged_pairs:        number
    median_delay_seconds: number
    timeline: { account: string; posts: { timestamp: number; text_preview: string }[] }[]
  }
  linguistic: {
    score:             number
    clusters:          number[]
    accounts:          string[]
    similarity_matrix: number[][]
    profiles: {
      account:                 string
      average_sentence_length: number
      vocabulary_diversity:    number
      punctuation_density:     number
      emoji_frequency:         number
    }[]
  }
  ai_operation: {
    score: number
    signals: {
      account:              string
      burstiness:           number
      perplexity:           number
      semantic_consistency: number
      topic_drift:          number
      post_count?:          number
    }[]
    verdict: 'LIKELY_AI' | 'POSSIBLY_AI' | 'LIKELY_HUMAN'
  }
  sources?: Record<string, string>
}

// ─── Transform backend response → component shapes ────────────────────────────

function aiVerdict(score: number): 'LIKELY_AI' | 'POSSIBLY_AI' | 'LIKELY_HUMAN' {
  if (score >= 75) return 'LIKELY_AI'
  if (score >= 45) return 'POSSIBLY_AI'
  return 'LIKELY_HUMAN'
}

// Mirrors AIOperationDetector._score_signal so per-account scores match the
// backend's aggregate score. Each component is 0-100 AI-evidence.
function signalComponents(s: BackendResponse['ai_operation']['signals'][number]) {
  return {
    regularity:     Math.max(0, (1 - s.burstiness)) * 100,
    lowPerplexity:  Math.max(0, Math.min(100, (150 - s.perplexity) / 1.5)),
    consistency:    Math.min(100, s.semantic_consistency * 200),
    lowDrift:       Math.max(0, (1 - s.topic_drift)) * 100,
  }
}

function scoreSignal(s: BackendResponse['ai_operation']['signals'][number]): number {
  if ((s.post_count ?? 0) < 3) return 25 // insufficient data — neutral
  const c = signalComponents(s)
  return 0.25 * c.regularity + 0.25 * c.lowPerplexity + 0.25 * c.consistency + 0.25 * c.lowDrift
}

function transform(backend: BackendResponse, handles: string[]): AccountIntelResult {
  const labels = backend.linguistic.clusters
  const clusterCount = new Set(labels.filter(label => label >= 0)).size

  // DBSCAN noise points (-1) become singleton clusters so the graph can color them
  let nextNoiseId = labels.reduce((max, label) => Math.max(max, label), -1) + 1
  const clusterIds = labels.map(label => (label >= 0 ? label : nextNoiseId++))

  const aiAccounts = backend.ai_operation.signals.map(signal => {
    const ai_score = Math.round(scoreSignal(signal))
    const c = signalComponents(signal)
    return {
      handle:   signal.account,
      ai_score,
      // Each bar is 0-100 AI-evidence for that dimension
      signals: {
        burstiness:           Math.round(c.regularity),
        perplexity_score:     Math.round(c.lowPerplexity),
        semantic_consistency: Math.round(c.consistency),
        topic_drift:          Math.round(c.lowDrift),
      },
      verdict: aiVerdict(ai_score),
    }
  })
  const aiScoreByHandle = new Map(aiAccounts.map(a => [a.handle, a.ai_score]))

  const fingerprintAccounts = backend.linguistic.profiles.map((profile, i) => ({
    handle:         profile.account,
    cluster_id:     clusterIds[i] ?? 0,
    ai_probability: (aiScoreByHandle.get(profile.account) ?? 0) / 100,
    features: {
      avg_sentence_length:  profile.average_sentence_length,
      vocabulary_diversity: profile.vocabulary_diversity,
      punctuation_density:  profile.punctuation_density,
      emoji_frequency:      profile.emoji_frequency,
    },
  }))

  const overall =
    (backend.temporal.score + backend.linguistic.score + backend.ai_operation.score) / 3
  const verdict = overall >= 70 ? 'HIGH' : overall >= 40 ? 'MED' : 'LOW'
  const confidence = Math.round(
    Math.max(backend.temporal.confidence, overall / 100) * 100,
  ) / 100
  const summary =
    verdict === 'HIGH'
      ? 'Strong evidence of coordinated inauthentic behavior across the analyzed accounts.'
      : verdict === 'MED'
        ? 'Some coordination signals detected; evidence is not conclusive.'
        : 'No significant coordination signals detected across the analyzed accounts.'

  return {
    status:            'complete',
    source:            'backend',
    data_sources:      backend.sources ?? {},
    accounts_analyzed: handles.length,
    temporal: {
      score:                backend.temporal.score,
      flagged_pairs:        backend.temporal.flagged_pairs,
      median_delay_seconds: backend.temporal.median_delay_seconds,
      // backend sends epoch seconds; the heatmap works in milliseconds
      timeline: backend.temporal.timeline.map(entry => ({
        account: entry.account,
        posts:   entry.posts.map(post => ({ ...post, timestamp: post.timestamp * 1000 })),
      })),
    },
    linguistic: {
      score:             backend.linguistic.score,
      clusters:          clusterCount,
      accounts:          fingerprintAccounts,
      similarity_matrix: backend.linguistic.similarity_matrix,
    },
    ai_operation: {
      score:    backend.ai_operation.score,
      accounts: aiAccounts,
    },
    verdict,
    confidence,
    summary,
  }
}

// ─── Mock fallback (used when the backend is unreachable) ─────────────────────

function mockResult(handles: string[]): AccountIntelResult {
  return {
    status:            'complete',
    source:            'mock',
    accounts_analyzed: handles.length,
    temporal:   { score: 73, flagged_pairs: 4, median_delay_seconds: 8.3, timeline: [] },
    linguistic: { score: 81, clusters: 2, accounts: [], similarity_matrix: [] },
    ai_operation: { score: 67, accounts: [] },
    verdict:    'HIGH',
    confidence: 0.84,
    summary:    'Strong evidence of coordinated inauthentic behavior',
  }
}

export async function POST(request: Request) {
  const body = await request.json()
  const { handles } = body as { handles?: string[] }

  if (!Array.isArray(handles) || handles.length < 2) {
    return Response.json({ error: 'at least 2 handles are required' }, { status: 400 })
  }
  if (handles.length > 10) {
    return Response.json({ error: 'maximum 10 handles' }, { status: 400 })
  }

  try {
    const response = await fetch(`${BACKEND}/account-intel/analyze`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ handles }),
      signal:  AbortSignal.timeout(55000),
    })
    if (!response.ok) throw new Error('Backend unavailable')
    const backend = (await response.json()) as BackendResponse
    return NextResponse.json(transform(backend, handles))
  } catch {
    return NextResponse.json(mockResult(handles))
  }
}
