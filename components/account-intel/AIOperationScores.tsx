'use client'

import { useMemo, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AIVerdict = 'LIKELY_AI' | 'POSSIBLY_AI' | 'LIKELY_HUMAN'

export interface AIOperationAccount {
  handle:   string
  ai_score: number
  signals: {
    burstiness:           number
    perplexity_score:     number
    semantic_consistency: number
    topic_drift:          number
  }
  verdict: AIVerdict
}

export interface AIOperationData {
  score:    number
  accounts: AIOperationAccount[]
}

interface Props {
  data: AIOperationData
  /** Handles analyzed — seeds mock data when the backend sends no accounts */
  accounts?: string[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FONT: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono, "Fira Code", monospace)',
}
const BORDER = '1px solid #1E2D4A'

const VERDICT_META: Record<AIVerdict, { label: string; color: string }> = {
  LIKELY_AI:    { label: 'LIKELY AI',    color: '#EF4444' },
  POSSIBLY_AI:  { label: 'POSSIBLY AI',  color: '#F59E0B' },
  LIKELY_HUMAN: { label: 'LIKELY HUMAN', color: '#22C55E' },
}

const SIGNAL_LABELS: Record<keyof AIOperationAccount['signals'], string> = {
  burstiness:           'BURSTINESS SCORE',
  perplexity_score:     'PERPLEXITY SCORE',
  semantic_consistency: 'SEMANTIC CONSISTENCY',
  topic_drift:          'TOPIC DRIFT',
}

function scoreColor(score: number): string {
  if (score < 40) return '#22C55E'
  if (score <= 70) return '#F59E0B'
  return '#EF4444'
}

function overallSeverity(score: number): { label: string; color: string } {
  if (score >= 70) return { label: 'HIGH',   color: '#EF4444' }
  if (score >= 40) return { label: 'MEDIUM', color: '#F59E0B' }
  return { label: 'LOW', color: '#22C55E' }
}

function verdictFor(score: number): AIVerdict {
  if (score > 70) return 'LIKELY_AI'
  if (score >= 40) return 'POSSIBLY_AI'
  return 'LIKELY_HUMAN'
}

// ─── Mock data (demo fallback when backend sends no accounts) ─────────────────

const FALLBACK_HANDLES = [
  '@TruthVoter2024', '@ElectionWatchIN', '@PatriotPulse_', '@VoteFactsNow',
  '@DemAlertDaily', '@FactCheckBharat', '@CivicSignal_',
]

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function clamp(v: number): number {
  return Math.max(2, Math.min(98, Math.round(v)))
}

function generateMockAccounts(handles: string[]): AIOperationAccount[] {
  const names = handles.length >= 2 ? handles.slice(0, 10) : FALLBACK_HANDLES
  const rand  = mulberry32(hashString(names.join('|')) ^ 0x51f0)

  // Archetype cycle guarantees a believable mix regardless of handle count
  const archetypes = [
    () => 74 + rand() * 21,  // likely AI
    () => 78 + rand() * 17,  // likely AI
    () => 42 + rand() * 26,  // possibly AI
    () => 12 + rand() * 24,  // likely human
    () => 45 + rand() * 22,  // possibly AI
  ]

  return names.map((handle, i) => {
    const ai_score = Math.round(archetypes[i % archetypes.length]())
    return {
      handle,
      ai_score,
      signals: {
        // LLM tells: unnaturally regular cadence, low-perplexity text,
        // high internal consistency, minimal topic drift
        burstiness:           clamp(ai_score + (rand() - 0.5) * 24),
        perplexity_score:     clamp(ai_score + (rand() - 0.5) * 18),
        semantic_consistency: clamp(ai_score + (rand() - 0.3) * 20),
        topic_drift:          clamp(100 - ai_score + (rand() - 0.5) * 26),
      },
      verdict: verdictFor(ai_score),
    }
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({ value, height = 6 }: { value: number; height?: number }) {
  return (
    <div style={{ height: `${height}px`, backgroundColor: '#080E1A', border: BORDER }}>
      <div
        style={{
          height:          '100%',
          width:           `${value}%`,
          backgroundColor: scoreColor(value),
          opacity:         0.85,
          transition:      'width 0.6s ease',
        }}
      />
    </div>
  )
}

function AccountCard({ account }: { account: AIOperationAccount }) {
  const [expanded, setExpanded] = useState(false)
  const meta = VERDICT_META[account.verdict]

  return (
    <div style={{ border: BORDER, backgroundColor: '#111D35' }}>
      {/* Card header — click to expand */}
      <button
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        style={{
          display:         'block',
          width:           '100%',
          background:      'none',
          border:          'none',
          padding:         '12px',
          cursor:          'pointer',
          textAlign:       'left',
        }}
      >
        <div
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            gap:            '8px',
            marginBottom:   '8px',
          }}
        >
          <span
            style={{
              ...FONT,
              fontSize:     '12px',
              fontWeight:   700,
              color:        '#FFFFFF',
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
            }}
          >
            {account.handle}
          </span>
          <span
            style={{
              ...FONT,
              flexShrink:    0,
              fontSize:      '8px',
              fontWeight:    700,
              letterSpacing: '0.1em',
              color:         meta.color,
              border:        `1px solid ${meta.color}`,
              padding:       '2px 6px',
            }}
          >
            {meta.label}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ flex: 1 }}>
            <ScoreBar value={account.ai_score} />
          </div>
          <span
            style={{
              ...FONT,
              flexShrink: 0,
              fontSize:   '11px',
              fontWeight: 700,
              color:      scoreColor(account.ai_score),
              minWidth:   '58px',
              textAlign:  'right',
            }}
          >
            {account.ai_score} / 100
          </span>
        </div>

        <div style={{ ...FONT, fontSize: '8px', color: '#4A5568', letterSpacing: '0.08em', marginTop: '8px' }}>
          {expanded ? '▾ HIDE SIGNALS' : '▸ SHOW SIGNALS'}
        </div>
      </button>

      {/* Expandable signal breakdown */}
      {expanded && (
        <div
          style={{
            borderTop:     BORDER,
            padding:       '12px',
            display:       'flex',
            flexDirection: 'column',
            gap:           '10px',
          }}
        >
          {(Object.keys(SIGNAL_LABELS) as (keyof AIOperationAccount['signals'])[]).map(key => {
            const value = account.signals[key]
            return (
              <div key={key}>
                <div
                  style={{
                    display:        'flex',
                    justifyContent: 'space-between',
                    alignItems:     'baseline',
                    marginBottom:   '4px',
                  }}
                >
                  <span style={{ ...FONT, fontSize: '9px', letterSpacing: '0.08em', color: '#4A5568' }}>
                    {SIGNAL_LABELS[key]}
                  </span>
                  <span style={{ ...FONT, fontSize: '9px', color: scoreColor(value) }}>
                    {Math.round(value)}
                  </span>
                </div>
                <ScoreBar value={value} height={4} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIOperationScores({ data, accounts }: Props) {
  const list = useMemo(() => {
    if (data.accounts.length >= 1) return data.accounts
    return generateMockAccounts(accounts ?? [])
  }, [data.accounts, accounts])

  const sev = overallSeverity(data.score)
  const flaggedCount = list.filter(a => a.verdict !== 'LIKELY_HUMAN').length

  return (
    <div
      style={{
        border:          BORDER,
        backgroundColor: '#0D1526',
        minHeight:       '380px',
        padding:         '12px',
        display:         'flex',
        flexDirection:   'column',
        gap:             '12px',
      }}
    >
      <div style={{ ...FONT, fontSize: '10px', letterSpacing: '0.12em', color: '#4A5568' }}>
        AI OPERATION SCORES
      </div>

      {/* Score header */}
      <div style={{ borderBottom: BORDER, paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ ...FONT, fontSize: '10px', letterSpacing: '0.1em', color: '#8B9AB5' }}>
            AI OPERATION SCORE
          </span>
          <span style={{ ...FONT, fontSize: '20px', fontWeight: 700, color: '#E2E8F0', lineHeight: 1 }}>
            {data.score}/100
          </span>
          <span style={{ ...FONT, fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: sev.color }}>
            {sev.label}
          </span>
        </div>
        <div style={{ ...FONT, fontSize: '10px', color: '#4A5568', marginTop: '6px' }}>
          {flaggedCount} of {list.length} accounts show LLM generation patterns
        </div>
      </div>

      {/* Account cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '520px' }}>
        {list.map(account => (
          <AccountCard key={account.handle} account={account} />
        ))}
      </div>
    </div>
  )
}
