'use client'

import { useEffect, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VerdictData {
  verdict:            'HIGH' | 'MEDIUM' | 'LOW'
  confidence:         number
  summary:            string
  temporal_score:     number
  linguistic_score:   number
  ai_operation_score: number
  accounts_analyzed:  number
  flagged_accounts:   number
}

interface Props {
  data: VerdictData
  /** Handles analyzed — embedded in the exported report */
  accounts?: string[]
  /** Linguistic cluster count — used in the narrative text */
  clusters?: number
  /** Raw analysis sections — embedded verbatim in the exported report */
  sections?: {
    temporal_coordination?: unknown
    linguistic_fingerprint?: unknown
    ai_operation?: unknown
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FONT: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono, "Fira Code", monospace)',
}
const BORDER = '1px solid #1E2D4A'

const VERDICT_COLOR: Record<VerdictData['verdict'], string> = {
  HIGH:   '#EF4444',
  MEDIUM: '#F59E0B',
  LOW:    '#00D4AA',
}

function scoreColor(score: number): string {
  if (score < 40) return '#22C55E'
  if (score <= 70) return '#F59E0B'
  return '#EF4444'
}

// ─── Score arc (matches the dashboard overview threat-score gauges) ───────────

function ScoreArc({ score, name }: { score: number; name: string }) {
  const R = 32
  const C = 2 * Math.PI * R
  const filled = (score / 100) * C
  const color = scoreColor(score)

  return (
    <div
      style={{
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        flex:          1,
        padding:       '8px',
      }}
    >
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={R} fill="none" stroke="#1E2D4A" strokeWidth="4" />
        <circle
          cx="40" cy="40" r={R}
          fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${filled} ${C - filled}`}
          strokeLinecap="butt"
          transform="rotate(-90 40 40)"
        />
        <text
          x="40" y="38" textAnchor="middle"
          fill="#E2E8F0" fontSize="16" fontWeight="700"
          fontFamily='var(--font-jetbrains-mono,"Fira Code",monospace)'
        >
          {score}
        </text>
        <text
          x="40" y="52" textAnchor="middle"
          fill="#4A5568" fontSize="8"
          fontFamily='var(--font-jetbrains-mono,"Fira Code",monospace)'
        >
          /100
        </text>
      </svg>
      <div style={{ ...FONT, fontSize: '9px', letterSpacing: '0.1em', color: '#4A5568', textAlign: 'center', marginTop: '8px' }}>
        {name}
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VerdictPanel({ data, accounts, clusters, sections }: Props) {
  const [exported, setExported] = useState(false)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const color = VERDICT_COLOR[data.verdict]

  const narrative = [
    data.summary.replace(/\.?$/, '.'),
    `${data.flagged_accounts} of ${data.accounts_analyzed} accounts show synchronized posting patterns,` +
      ` shared linguistic fingerprints across ${clusters ?? 2} cluster${(clusters ?? 2) === 1 ? '' : 's'},` +
      ' and LLM-generated content signatures.',
  ].join(' ')

  function handleExport() {
    const report = {
      report_id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
      generated_at: new Date().toISOString(),
      generated_by: 'ShadowTrace v2.0',
      accounts_analyzed: accounts ?? [],
      temporal_coordination: sections?.temporal_coordination ?? { score: data.temporal_score },
      linguistic_fingerprint: sections?.linguistic_fingerprint ?? { score: data.linguistic_score },
      ai_operation: sections?.ai_operation ?? { score: data.ai_operation_score },
      verdict: data.verdict,
      confidence: data.confidence,
      summary: data.summary,
    }

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `shadowtrace-coordination-report-${report.report_id.slice(0, 8)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)

    setExported(true)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setExported(false), 3000)
  }

  return (
    <div
      style={{
        border:          `1px solid ${color}`,
        backgroundColor: '#0D1526',
        padding:         '20px',
      }}
    >
      <div
        style={{
          display:  'flex',
          gap:      '24px',
          flexWrap: 'wrap',
        }}
      >
        {/* Left — verdict + narrative */}
        <div style={{ flex: '1 1 340px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <span
              style={{
                ...FONT,
                fontSize:      '11px',
                fontWeight:    700,
                letterSpacing: '0.18em',
                color:         '#8B9AB5',
              }}
            >
              COORDINATION VERDICT
            </span>
            <span style={{ ...FONT, fontSize: '22px', fontWeight: 700, color, lineHeight: 1 }}>
              {data.verdict}
            </span>
            <span style={{ ...FONT, fontSize: '11px', letterSpacing: '0.1em', color: '#E2E8F0' }}>
              CONFIDENCE: {Math.round(data.confidence * 100)}%
            </span>
          </div>
          <div style={{ ...FONT, fontSize: '12px', color: '#8B9AB5', lineHeight: 1.7, maxWidth: '560px' }}>
            {narrative}
          </div>
        </div>

        {/* Right — three circular score indicators */}
        <div style={{ display: 'flex', flex: '0 1 320px', minWidth: '280px' }}>
          <ScoreArc score={data.temporal_score}     name="TEMPORAL" />
          <ScoreArc score={data.linguistic_score}   name="LINGUISTIC" />
          <ScoreArc score={data.ai_operation_score} name="AI OPERATION" />
        </div>
      </div>

      {/* Bottom — export */}
      <div
        style={{
          display:        'flex',
          justifyContent: 'flex-end',
          borderTop:      BORDER,
          marginTop:      '16px',
          paddingTop:     '16px',
        }}
      >
        <button
          onClick={handleExport}
          style={{
            ...FONT,
            fontSize:        '10px',
            fontWeight:      700,
            letterSpacing:   '0.1em',
            color:           '#080E1A',
            backgroundColor: '#00D4AA',
            border:          'none',
            padding:         '10px 18px',
            cursor:          'pointer',
          }}
        >
          EXPORT COORDINATION REPORT →
        </button>
      </div>

      {/* Toast */}
      {exported && (
        <div
          style={{
            ...FONT,
            position:        'fixed',
            right:           '24px',
            bottom:          '24px',
            backgroundColor: '#080E1A',
            border:          '1px solid #00D4AA',
            color:           '#00D4AA',
            fontSize:        '11px',
            letterSpacing:   '0.08em',
            padding:         '12px 18px',
            zIndex:          100,
          }}
        >
          ✓ Report exported
        </div>
      )}
    </div>
  )
}
