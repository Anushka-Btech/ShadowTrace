'use client'

import { useEffect, useState } from 'react'
import type { AccountIntelResult } from '@/app/api/account-intel/route'
import TemporalHeatmap from '@/components/account-intel/TemporalHeatmap'
import FingerprintCluster from '@/components/account-intel/FingerprintCluster'
import AIOperationScores from '@/components/account-intel/AIOperationScores'
import VerdictPanel from '@/components/account-intel/VerdictPanel'

// ─── Constants ────────────────────────────────────────────────────────────────

const FONT: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono, "Fira Code", monospace)',
}
const BORDER = '1px solid #1E2D4A'
const MAX_ACCOUNTS = 10

const QUICK_SETS = [
  {
    label:   'Load: Election Accounts',
    handles: ['@TruthVoter2024', '@ElectionWatchIN', '@PatriotPulse_', '@VoteFactsNow', '@DemAlertDaily'],
  },
  {
    label:   'Load: Health Misinfo Accounts',
    handles: ['@NaturalCureMom', '@WellnessTruther', '@VaxFactsExposed', '@HolisticHealer7'],
  },
  {
    label:   'Load: Review Bomb Accounts',
    handles: ['@DealHunter_Raj', '@BestBuysToday', '@HonestReviews99', '@ShopSmartNow_', '@TopPicksDaily', '@GadgetGuru_IN'],
  },
]

function normalizeHandle(raw: string): string {
  const trimmed = raw.trim().replace(/^@+/, '')
  return trimmed ? `@${trimmed}` : ''
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountIntelPage() {
  const [handles,   setHandles]   = useState<string[]>([])
  const [draft,     setDraft]     = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [result,    setResult]    = useState<AccountIntelResult | null>(null)
  const [analyzed,  setAnalyzed]  = useState<string[]>([])
  const [error,     setError]     = useState<string | null>(null)

  // Handles handed over from Mission Control's investigation panel
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('st-handles')
      if (!raw) return
      sessionStorage.removeItem('st-handles')
      const list = (JSON.parse(raw) as unknown[]).filter((h): h is string => typeof h === 'string')
      setHandles(list.map(normalizeHandle).filter(Boolean).slice(0, MAX_ACCOUNTS))
    } catch { /* ignore malformed handoff */ }
  }, [])

  function addHandle(raw: string) {
    const handle = normalizeHandle(raw)
    if (!handle) return
    setHandles(prev =>
      prev.length >= MAX_ACCOUNTS || prev.includes(handle) ? prev : [...prev, handle],
    )
    setDraft('')
  }

  function removeHandle(handle: string) {
    setHandles(prev => prev.filter(h => h !== handle))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addHandle(draft)
    } else if (e.key === 'Backspace' && !draft && handles.length > 0) {
      removeHandle(handles[handles.length - 1])
    }
  }

  async function runAnalysis() {
    if (handles.length < 2 || analyzing) return
    setAnalyzing(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/account-intel', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ handles }),
      })
      if (!res.ok) throw new Error('request failed')
      const data = (await res.json()) as AccountIntelResult
      setResult(data)
      setAnalyzed(handles)
    } catch {
      setError('Analysis failed. Check API configuration.')
    } finally {
      setAnalyzing(false)
    }
  }

  const canRun = handles.length >= 2 && !analyzing

  return (
    <div style={{ borderTop: BORDER, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <style>{'@keyframes ai-spin { to { transform: rotate(360deg); } }'}</style>

      {/* ── Section 1 — Account Input Panel ─────────────────────────────────── */}
      <div style={{ border: BORDER, backgroundColor: '#0D1526', padding: '20px' }}>
        <div
          style={{
            ...FONT,
            fontSize:      '13px',
            fontWeight:    700,
            letterSpacing: '0.18em',
            color:         '#E2E8F0',
            marginBottom:  '4px',
          }}
        >
          ACCOUNT INTELLIGENCE
        </div>
        <div style={{ ...FONT, fontSize: '11px', color: '#4A5568', marginBottom: '16px' }}>
          Analyze whether a set of accounts is operated by the same entity
        </div>

        {/* Tag-style input */}
        <div
          onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}
          style={{
            display:         'flex',
            flexWrap:        'wrap',
            alignItems:      'center',
            gap:             '6px',
            border:          BORDER,
            backgroundColor: '#080E1A',
            padding:         '8px',
            cursor:          'text',
            marginBottom:    '12px',
          }}
        >
          {handles.map(handle => (
            <span
              key={handle}
              style={{
                ...FONT,
                display:         'inline-flex',
                alignItems:      'center',
                gap:             '6px',
                fontSize:        '11px',
                color:           '#E2E8F0',
                backgroundColor: '#111D35',
                border:          BORDER,
                padding:         '3px 8px',
              }}
            >
              {handle}
              <button
                onClick={() => removeHandle(handle)}
                aria-label={`Remove ${handle}`}
                style={{
                  ...FONT,
                  background: 'none',
                  border:     'none',
                  color:      '#4A5568',
                  cursor:     'pointer',
                  fontSize:   '11px',
                  padding:    0,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </span>
          ))}
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={handles.length >= MAX_ACCOUNTS}
            placeholder={
              handles.length >= MAX_ACCOUNTS
                ? 'Maximum 10 accounts'
                : 'Type a handle and press Enter…'
            }
            style={{
              ...FONT,
              flex:            1,
              minWidth:        '180px',
              fontSize:        '12px',
              color:           '#E2E8F0',
              backgroundColor: 'transparent',
              border:          'none',
              outline:         'none',
              padding:         '4px',
            }}
          />
        </div>

        {/* Counter */}
        <div style={{ ...FONT, fontSize: '10px', color: '#4A5568', marginBottom: '12px' }}>
          {handles.length} / {MAX_ACCOUNTS} accounts
        </div>

        {/* Quick-load buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {QUICK_SETS.map(set => (
            <button
              key={set.label}
              onClick={() => { setHandles(set.handles.slice(0, MAX_ACCOUNTS)); setResult(null); setError(null) }}
              style={{
                ...FONT,
                fontSize:        '10px',
                letterSpacing:   '0.06em',
                color:           '#8B9AB5',
                backgroundColor: 'transparent',
                border:          BORDER,
                padding:         '6px 12px',
                cursor:          'pointer',
              }}
            >
              {set.label}
            </button>
          ))}
        </div>

        {/* Run button */}
        <button
          onClick={runAnalysis}
          disabled={!canRun}
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
            color:           canRun || analyzing ? '#080E1A' : '#4A5568',
            backgroundColor: canRun || analyzing ? '#00D4AA' : '#111D35',
            border:          'none',
            padding:         '12px',
            cursor:          canRun ? 'pointer' : 'not-allowed',
          }}
        >
          {analyzing ? (
            <>
              ANALYZING...
              <span
                style={{
                  display:          'inline-block',
                  width:            '12px',
                  height:           '12px',
                  border:           '2px solid #080E1A',
                  borderTopColor:   'transparent',
                  borderRadius:     '50%',
                  animation:        'ai-spin 0.7s linear infinite',
                }}
              />
            </>
          ) : (
            'RUN ANALYSIS →'
          )}
        </button>

        {error && (
          <div style={{ ...FONT, fontSize: '11px', color: '#EF4444', marginTop: '10px' }}>
            {error}
          </div>
        )}
      </div>

      {/* ── Section 2 — Results ─────────────────────────────────────────────── */}
      {result && (
        <div
          style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap:                 '16px',
          }}
        >
          <TemporalHeatmap
            data={result.temporal}
            accounts={analyzed}
          />
          <FingerprintCluster
            data={result.linguistic}
            accounts={analyzed}
          />
          <AIOperationScores
            data={result.ai_operation}
            accounts={analyzed}
          />
        </div>
      )}

      {/* ── Section 3 — Verdict Panel ───────────────────────────────────────── */}
      {result && (
        <VerdictPanel
          data={{
            verdict:            result.verdict === 'MED' ? 'MEDIUM' : result.verdict,
            confidence:         result.confidence,
            summary:            result.summary,
            temporal_score:     result.temporal.score,
            linguistic_score:   result.linguistic.score,
            ai_operation_score: result.ai_operation.score,
            accounts_analyzed:  result.accounts_analyzed,
            flagged_accounts:   result.ai_operation.accounts.length > 0
              ? result.ai_operation.accounts.filter(a => a.verdict !== 'LIKELY_HUMAN').length
              : Math.min(result.accounts_analyzed, Math.ceil(result.accounts_analyzed * 0.7)),
          }}
          accounts={analyzed}
          clusters={result.linguistic.clusters}
          sections={{
            temporal_coordination:  result.temporal,
            linguistic_fingerprint: result.linguistic,
            ai_operation:           result.ai_operation,
          }}
        />
      )}
    </div>
  )
}
