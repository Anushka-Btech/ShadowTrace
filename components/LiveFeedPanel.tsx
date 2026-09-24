'use client'

import { useCallback, useEffect, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Claim {
  id:           string
  title:        string
  summary:      string
  url:          string
  published:    string
  source:       string
  source_color: string
  language:     string
  ai_score:     number | null
  risk_level:   'HIGH' | 'MED' | 'LOW' | null
  keywords:     string[]
}

interface FeedPayload {
  items:        Claim[]
  last_updated: string
  total_count:  number
  sources:      string[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FONT: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono, "Fira Code", monospace)',
}
const BORDER = '1px solid #1E2D4A'

const SOURCE_COLOR: Record<string, string> = {
  red:    '#EF4444',
  yellow: '#F59E0B',
  blue:   '#3B82F6',
  purple: '#7C3AED',
}

const RISK_COLOR: Record<string, string> = {
  HIGH: '#EF4444',
  MED:  '#F59E0B',
  LOW:  '#00D4AA',
}

function scoreColor(score: number): string {
  if (score < 40) return '#22C55E'
  if (score <= 70) return '#F59E0B'
  return '#EF4444'
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LiveFeedPanel() {
  const [feed,    setFeed]    = useState<FeedPayload | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch('/api/live-feed')
      if (res.ok) setFeed((await res.json()) as FeedPayload)
    } catch {
      // keep whatever we had — never show errors
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchFeed()
  }, [fetchFeed])

  function refresh() {
    setLoading(true)
    void fetchFeed()
  }

  return (
    <div
      style={{
        display:         'flex',
        flexDirection:   'column',
        height:          '100%',
        backgroundColor: '#0D1526',
        overflow:        'hidden',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          ...FONT,
          display:        'flex',
          alignItems:     'center',
          gap:            '8px',
          height:         '36px',
          flexShrink:     0,
          padding:        '0 16px',
          borderBottom:   BORDER,
          fontSize:       '10px',
          letterSpacing:  '0.1em',
          color:          '#4A5568',
        }}
      >
        <span
          className="st-pulse-dot"
          style={{
            display:         'inline-block',
            width:           '6px',
            height:          '6px',
            borderRadius:    '50%',
            backgroundColor: '#22C55E',
            flexShrink:      0,
          }}
        />
        <span style={{ color: '#8B9AB5' }}>LIVE — FACT-CHECKER FEED</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '14px' }}>
          {feed && <span>LAST UPDATED: {formatTime(feed.last_updated)}</span>}
          <button
            onClick={refresh}
            disabled={loading}
            style={{
              ...FONT,
              fontSize:        '10px',
              letterSpacing:   '0.06em',
              color:           '#00D4AA',
              backgroundColor: 'transparent',
              border:          BORDER,
              padding:         '2px 8px',
              cursor:          loading ? 'wait' : 'pointer',
            }}
          >
            ↻ REFRESH
          </button>
        </div>
      </div>

      {/* ── Claim list ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && !feed && (
          <div
            className="st-skeleton"
            style={{ ...FONT, padding: '32px 16px', fontSize: '11px', color: '#4A5568', textAlign: 'center' }}
          >
            Fetching live claims from AltNews · Boom · FactChecker...
          </div>
        )}

        {feed?.items.map(claim => (
          <div
            key={claim.id}
            className="hover:bg-[#111D35]"
            style={{
              borderLeft:   `2px solid ${RISK_COLOR[claim.risk_level ?? 'MED']}`,
              borderBottom: BORDER,
              padding:      '12px 16px',
              transition:   'background-color 0.15s ease',
            }}
          >
            {/* Source pill + published */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span
                style={{
                  ...FONT,
                  fontSize:      '9px',
                  fontWeight:    700,
                  letterSpacing: '0.08em',
                  color:         SOURCE_COLOR[claim.source_color] ?? '#8B9AB5',
                  border:        `1px solid ${SOURCE_COLOR[claim.source_color] ?? '#8B9AB5'}`,
                  borderRadius:  '999px',
                  padding:       '1px 8px',
                }}
              >
                {claim.source.toUpperCase()}
              </span>
            </div>

            {/* Headline */}
            <div style={{ fontSize: '13px', color: '#FFFFFF', lineHeight: 1.5, marginBottom: '10px' }}>
              {claim.title}
            </div>

            {/* AI score bar */}
            {claim.ai_score !== null && (
              <>
                <div style={{ height: '4px', backgroundColor: '#080E1A', border: BORDER, marginBottom: '6px' }}>
                  <div
                    style={{
                      height:          '100%',
                      width:           `${claim.ai_score}%`,
                      backgroundColor: scoreColor(claim.ai_score),
                      opacity:         0.85,
                    }}
                  />
                </div>
                <div style={{ ...FONT, fontSize: '9px', letterSpacing: '0.08em', color: '#4A5568', marginBottom: '8px' }}>
                  AI SCORE: {claim.ai_score} — {claim.risk_level}
                </div>
              </>
            )}

            {/* Keywords */}
            {claim.keywords.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                {claim.keywords.map(kw => (
                  <span
                    key={kw}
                    style={{
                      ...FONT,
                      fontSize:        '8px',
                      letterSpacing:   '0.06em',
                      color:           '#8B9AB5',
                      backgroundColor: '#111D35',
                      border:          BORDER,
                      padding:         '1px 6px',
                    }}
                  >
                    {kw}
                  </span>
                ))}
              </div>
            )}

            {/* Footer: link + timestamp */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <a
                href={claim.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...FONT,
                  fontSize:       '9px',
                  fontWeight:     700,
                  letterSpacing:  '0.08em',
                  color:          '#00D4AA',
                  textDecoration: 'none',
                }}
              >
                VIEW FACT-CHECK →
              </a>
              <span style={{ ...FONT, fontSize: '9px', color: '#4A5568' }}>
                {formatTime(claim.published)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Source attribution strip ───────────────────────────────────────── */}
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          '8px',
          flexShrink:   0,
          padding:      '8px 16px',
          borderTop:    BORDER,
        }}
      >
        <span style={{ ...FONT, fontSize: '8px', letterSpacing: '0.1em', color: '#4A5568' }}>SOURCES</span>
        {[
          { name: 'AltNews',     color: SOURCE_COLOR.red },
          { name: 'Boom',        color: SOURCE_COLOR.yellow },
          { name: 'FactChecker', color: SOURCE_COLOR.blue },
          { name: 'TheQuint',    color: SOURCE_COLOR.purple },
        ].map(s => (
          <span
            key={s.name}
            style={{
              ...FONT,
              fontSize:      '8px',
              fontWeight:    700,
              letterSpacing: '0.08em',
              color:         s.color,
              border:        `1px solid ${s.color}`,
              padding:       '1px 6px',
              opacity:       0.8,
            }}
          >
            {s.name.toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  )
}
