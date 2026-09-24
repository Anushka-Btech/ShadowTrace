'use client'

import { useState } from 'react'
import type { DeepfakeResult, DeepfakeVerdict } from '@/app/api/deepfake/route'

// ─── Constants ────────────────────────────────────────────────────────────────

const FONT: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono, "Fira Code", monospace)',
}
const BORDER = '1px solid #1E2D4A'

const QUICK_TESTS = [
  {
    label: 'Test: Authentic Photo',
    url:   'https://upload.wikimedia.org/wikipedia/commons/2/24/Screenshot_of_the_N%27Ko_Wikipedia_main_page.jpg',
  },
  {
    label: 'Test: AI-Generated',
    url:   'https://upload.wikimedia.org/wikipedia/commons/b/bb/Stable_Diffusion_-_In_the_street_-_8.jpg',
  },
  {
    label: 'Test: Edited Composite',
    url:   'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png',
  },
]

const VERDICT_META: Record<DeepfakeVerdict, { label: string; color: string }> = {
  LIKELY_MANIPULATED:   { label: 'LIKELY MANIPULATED',   color: '#EF4444' },
  POSSIBLY_MANIPULATED: { label: 'POSSIBLY MANIPULATED', color: '#F59E0B' },
  LIKELY_AUTHENTIC:     { label: 'LIKELY AUTHENTIC',     color: '#22C55E' },
  ANALYSIS_FAILED:      { label: 'ANALYSIS FAILED',      color: '#4A5568' },
}

const HIGH_SEVERITY_HINTS = ['High ELA', 'Edited with', 'likely AI-generated']

function scoreColor(score: number): string {
  if (score < 40) return '#22C55E'
  if (score <= 70) return '#F59E0B'
  return '#EF4444'
}

function signalSeverityColor(signal: string): string {
  return HIGH_SEVERITY_HINTS.some(hint => signal.includes(hint)) ? '#EF4444' : '#F59E0B'
}

// ─── Score arc (matches the dashboard threat-score gauges) ────────────────────

function ScoreArc({ score }: { score: number }) {
  const R = 44
  const C = 2 * Math.PI * R
  const filled = (score / 100) * C
  const color = scoreColor(score)

  return (
    <div style={{ position: 'relative', width: '120px', height: '120px' }}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={R} fill="none" stroke="#111D35" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${filled} ${C - filled}`}
          strokeDashoffset={C / 4}
          strokeLinecap="butt"
        />
      </svg>
      <div
        style={{
          position:       'absolute',
          inset:          0,
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ ...FONT, fontSize: '28px', fontWeight: 700, color }}>{score}</span>
        <span style={{ ...FONT, fontSize: '8px', letterSpacing: '0.14em', color: '#4A5568' }}>
          MANIPULATION
        </span>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DeepfakeAnalyzer() {
  const [url,       setUrl]       = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [result,    setResult]    = useState<DeepfakeResult | null>(null)
  const [error,     setError]     = useState<string | null>(null)

  async function runAnalysis(targetUrl?: string) {
    const imageUrl = (targetUrl ?? url).trim()
    if (!imageUrl || analyzing) return
    setAnalyzing(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/deepfake', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ image_url: imageUrl }),
      })
      if (!res.ok) throw new Error('request failed')
      const data = (await res.json()) as DeepfakeResult
      setResult(data)
      if (data.verdict === 'ANALYSIS_FAILED') {
        setError(data.analysis_summary || 'Analysis failed for this image.')
      }
    } catch {
      setError('Analysis failed. Check API configuration.')
    } finally {
      setAnalyzing(false)
    }
  }

  const verdictMeta = result ? VERDICT_META[result.verdict] : null
  const showResults = result !== null && result.verdict !== 'ANALYSIS_FAILED'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <style>{'@keyframes df-spin { to { transform: rotate(360deg); } }'}</style>

      {/* ── Input panel ─────────────────────────────────────────────────────── */}
      <div style={{ border: BORDER, backgroundColor: '#0D1526', padding: '20px' }}>
        <div
          style={{
            display:        'flex',
            justifyContent: 'space-between',
            alignItems:     'baseline',
            flexWrap:       'wrap',
            gap:            '8px',
            marginBottom:   '4px',
          }}
        >
          <span
            style={{
              ...FONT,
              fontSize:      '13px',
              fontWeight:    700,
              letterSpacing: '0.18em',
              color:         '#E2E8F0',
            }}
          >
            DEEPFAKE &amp; IMAGE MANIPULATION DETECTOR
          </span>
          <span style={{ ...FONT, fontSize: '10px', color: '#4A5568' }}>
            Powered by Error Level Analysis
          </span>
        </div>
        <div style={{ ...FONT, fontSize: '11px', color: '#4A5568', marginBottom: '16px' }}>
          ELA forensics + EXIF metadata analysis on any public image URL
        </div>

        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') runAnalysis() }}
          placeholder="Paste image URL to analyze (jpg, png, webp)..."
          style={{
            ...FONT,
            width:           '100%',
            boxSizing:       'border-box',
            fontSize:        '12px',
            color:           '#E2E8F0',
            backgroundColor: '#080E1A',
            border:          BORDER,
            outline:         'none',
            padding:         '10px 12px',
            marginBottom:    '12px',
          }}
        />

        {/* Quick-test buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {QUICK_TESTS.map(test => (
            <button
              key={test.label}
              onClick={() => { setUrl(test.url); runAnalysis(test.url) }}
              disabled={analyzing}
              style={{
                ...FONT,
                fontSize:        '10px',
                letterSpacing:   '0.06em',
                color:           '#8B9AB5',
                backgroundColor: 'transparent',
                border:          BORDER,
                padding:         '6px 12px',
                cursor:          analyzing ? 'not-allowed' : 'pointer',
              }}
            >
              {test.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => runAnalysis()}
          disabled={!url.trim() || analyzing}
          style={{
            ...FONT,
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            gap:             '8px',
            width:           '100%',
            fontSize:        '12px',
            fontWeight:      700,
            letterSpacing:   '0.12em',
            color:           url.trim() || analyzing ? '#080E1A' : '#4A5568',
            backgroundColor: url.trim() || analyzing ? '#00D4AA' : '#111D35',
            border:          'none',
            padding:         '12px',
            cursor:          url.trim() && !analyzing ? 'pointer' : 'not-allowed',
          }}
        >
          {analyzing ? (
            <>
              RUNNING ELA FORENSICS...
              <span
                style={{
                  display:        'inline-block',
                  width:          '12px',
                  height:         '12px',
                  border:         '2px solid #080E1A',
                  borderTopColor: 'transparent',
                  borderRadius:   '50%',
                  animation:      'df-spin 0.7s linear infinite',
                }}
              />
            </>
          ) : (
            'RUN FORENSIC ANALYSIS →'
          )}
        </button>

        {error && (
          <div style={{ ...FONT, fontSize: '11px', color: '#EF4444', marginTop: '10px' }}>
            {error}
          </div>
        )}
      </div>

      {/* ── Results ─────────────────────────────────────────────────────────── */}
      {showResults && result && verdictMeta && (
        <div className="df-results" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <style>{`
            @media (max-width: 900px) {
              .df-results { grid-template-columns: 1fr !important; }
            }
          `}</style>

          {/* Left — ELA heatmap */}
          <div style={{ border: BORDER, backgroundColor: '#0D1526', padding: '20px' }}>
            <div
              style={{
                ...FONT,
                fontSize:      '11px',
                letterSpacing: '0.18em',
                color:         '#4A5568',
                marginBottom:  '12px',
              }}
            >
              ELA HEATMAP
            </div>
            {result.ela_image_base64 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/png;base64,${result.ela_image_base64}`}
                alt="Error Level Analysis heatmap"
                style={{ width: '100%', border: BORDER, display: 'block' }}
              />
            ) : (
              <div
                style={{
                  ...FONT,
                  display:         'flex',
                  alignItems:      'center',
                  justifyContent:  'center',
                  height:          '240px',
                  border:          BORDER,
                  backgroundColor: '#080E1A',
                  fontSize:        '11px',
                  color:           '#4A5568',
                }}
              >
                ELA visualization unavailable
              </div>
            )}
            <div style={{ ...FONT, fontSize: '10px', color: '#4A5568', marginTop: '12px', lineHeight: 1.6 }}>
              Bright areas indicate potential editing. Uniform compression = authentic.
              High variance = manipulated.
            </div>
          </div>

          {/* Right — score, verdict, signals */}
          <div style={{ border: BORDER, backgroundColor: '#0D1526', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <ScoreArc score={result.manipulation_score} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span
                  style={{
                    ...FONT,
                    fontSize:        '11px',
                    fontWeight:      700,
                    letterSpacing:   '0.12em',
                    color:           '#080E1A',
                    backgroundColor: verdictMeta.color,
                    padding:         '4px 10px',
                    alignSelf:       'flex-start',
                  }}
                >
                  {verdictMeta.label}
                </span>
                <span style={{ ...FONT, fontSize: '11px', color: '#8B9AB5' }}>
                  CONFIDENCE: {Math.round(result.confidence * 100)}%
                </span>
                {result.source === 'mock' && (
                  <span style={{ ...FONT, fontSize: '9px', color: '#F59E0B' }}>
                    MOCK DATA — BACKEND UNREACHABLE
                  </span>
                )}
              </div>
            </div>

            {result.signals.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div
                  style={{
                    ...FONT,
                    fontSize:      '11px',
                    letterSpacing: '0.18em',
                    color:         '#4A5568',
                    marginBottom:  '8px',
                  }}
                >
                  FORENSIC SIGNALS
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {result.signals.map(signal => (
                    <div
                      key={signal}
                      style={{
                        ...FONT,
                        fontSize:        '11px',
                        color:           '#E2E8F0',
                        backgroundColor: '#080E1A',
                        borderLeft:      `2px solid ${signalSeverityColor(signal)}`,
                        padding:         '8px 10px',
                        lineHeight:      1.5,
                      }}
                    >
                      {signal}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.metadata_flags.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div
                  style={{
                    ...FONT,
                    fontSize:      '11px',
                    letterSpacing: '0.18em',
                    color:         '#4A5568',
                    marginBottom:  '8px',
                  }}
                >
                  METADATA FLAGS
                </div>
                {result.metadata_flags.map(flag => (
                  <div key={flag} style={{ ...FONT, fontSize: '11px', color: '#8B9AB5', padding: '2px 0' }}>
                    • {flag}
                  </div>
                ))}
              </div>
            )}

            <div style={{ ...FONT, fontSize: '11px', color: '#8B9AB5', lineHeight: 1.7 }}>
              {result.analysis_summary}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
