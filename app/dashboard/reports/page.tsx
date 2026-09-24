'use client'

import { useRouter } from 'next/navigation'

// ─── Types & data ─────────────────────────────────────────────────────────────

const FONT: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono, "Fira Code", monospace)',
}
const BORDER = '1px solid #1E2D4A'

interface Report {
  campaignName:  string
  threat:        'HIGH' | 'MED'
  threatColor:   string
  color:         string
  accounts:      number
  duration:      string
  peak:          string
  confidence:    number
  narrative:     string
  activityHours: number[]
}

const REPORTS: Report[] = [
  {
    campaignName:  'Operation Pulse',
    threat:        'HIGH',
    threatColor:   '#EF4444',
    color:         '#EF4444',
    accounts:      847,
    duration:      '38 days',
    peak:          '14:00–16:00 UTC',
    confidence:    94,
    narrative:     'Coordinated election misinformation campaign targeting voter turnout in Maharashtra and Gujarat. False claims about EVM tampering and polling date changes amplified through bot networks seeded from three state-level coordination hubs.',
    activityHours: [2,3,4,9,10,13,14,15,20,21,22,23],
  },
  {
    campaignName:  'MedFear',
    threat:        'HIGH',
    threatColor:   '#EF4444',
    color:         '#F59E0B',
    accounts:      312,
    duration:      '20 days',
    peak:          '09:00–11:00 UTC',
    confidence:    91,
    narrative:     'Anti-vaccine misinformation operation spreading fabricated WHO adverse-effect reports and deepfake audio attributed to medical professionals. Targets routine childhood vaccination programmes across tier-2 cities.',
    activityHours: [8,9,10,11,14,15,16,17,19],
  },
  {
    campaignName:  'ReviewStorm',
    threat:        'MED',
    threatColor:   '#F59E0B',
    color:         '#3B82F6',
    accounts:      156,
    duration:      '11 days',
    peak:          '06:00–08:00 UTC',
    confidence:    82,
    narrative:     'Coordinated fake product review network artificially inflating ratings for substandard consumer electronics while flooding competitor listings with negative sentiment. Active across Flipkart, Amazon IN, and Meesho.',
    activityHours: [0,1,6,7,8,12,13,18,20,21],
  },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function ThreatBadge({ level, color }: { level: string; color: string }) {
  return (
    <span
      style={{
        ...FONT,
        fontSize:        '9px',
        fontWeight:      700,
        letterSpacing:   '0.1em',
        padding:         '2px 8px',
        backgroundColor: color,
        color:           '#080E1A',
      }}
    >
      {level}
    </span>
  )
}

function StatCell({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ borderRight: last ? 'none' : BORDER, padding: '12px 20px' }}>
      <div style={{ ...FONT, fontSize: '10px', color: '#4A5568', letterSpacing: '0.08em', marginBottom: '5px' }}>
        {label}
      </div>
      <div style={{ ...FONT, fontSize: '14px', fontWeight: 700, color: '#E2E8F0' }}>
        {value}
      </div>
    </div>
  )
}

function ActivityBar({ hours, color }: { hours: number[]; color: string }) {
  const HOURS = Array.from({ length: 24 }, (_, i) => i)
  return (
    <div>
      {/* Hour labels */}
      <div style={{ display: 'flex', marginBottom: '4px' }}>
        {HOURS.map(h =>
          h % 6 === 0 ? (
            <div
              key={h}
              style={{
                ...FONT,
                width:    `${(6 / 24) * 100}%`,
                fontSize: '9px',
                color:    '#4A5568',
              }}
            >
              {`${String(h).padStart(2, '0')}:00`}
            </div>
          ) : null,
        )}
      </div>
      {/* Activity cells */}
      <div style={{ display: 'flex', gap: '1px', height: '16px' }}>
        {HOURS.map(h => {
          const active = hours.includes(h)
          return (
            <div
              key={h}
              style={{
                flex:            1,
                height:          '100%',
                backgroundColor: active ? color : '#0D1526',
                opacity:         active ? 0.75 : 0.4,
                border:          active ? 'none' : '1px solid #1A2840',
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

function ReportCard({ report }: { report: Report }) {
  const router = useRouter()

  function handleViewNetwork() {
    sessionStorage.setItem('st-campaign', report.campaignName)
    router.push('/dashboard/network')
  }

  return (
    <div
      style={{
        border:          BORDER,
        backgroundColor: '#0D1526',
      }}
    >
      {/* Card header */}
      <div
        style={{
          display:       'flex',
          alignItems:    'center',
          justifyContent:'space-between',
          padding:       '14px 20px',
          borderBottom:  `2px solid ${report.color}`,
        }}
      >
        <span style={{ ...FONT, fontSize: '14px', fontWeight: 700, color: '#E2E8F0' }}>
          {report.campaignName}
        </span>
        <ThreatBadge level={report.threat} color={report.threatColor} />
      </div>

      {/* Stats row */}
      <div
        style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          borderBottom:        BORDER,
        }}
      >
        <StatCell label="ACCOUNTS INVOLVED" value={report.accounts.toLocaleString()}    />
        <StatCell label="DURATION"          value={report.duration}                     />
        <StatCell label="PEAK ACTIVITY"     value={report.peak}                         />
        <StatCell label="CONFIDENCE"        value={`${report.confidence}%`} last        />
      </div>

      {/* Narrative */}
      <div style={{ padding: '14px 20px', borderBottom: BORDER }}>
        <div style={{ ...FONT, fontSize: '10px', color: '#4A5568', letterSpacing: '0.08em', marginBottom: '7px' }}>
          CAMPAIGN NARRATIVE
        </div>
        <div style={{ ...FONT, fontSize: '11px', color: '#8B9AB5', lineHeight: 1.65 }}>
          {report.narrative}
        </div>
      </div>

      {/* 24h activity timeline */}
      <div style={{ padding: '14px 20px', borderBottom: BORDER }}>
        <div style={{ ...FONT, fontSize: '10px', color: '#4A5568', letterSpacing: '0.08em', marginBottom: '8px' }}>
          CAMPAIGN ACTIVITY — LAST 24H
        </div>
        <ActivityBar hours={report.activityHours} color={report.color} />
      </div>

      {/* Action footer */}
      <div style={{ padding: '14px 20px' }}>
        <button
          onClick={handleViewNetwork}
          style={{
            ...FONT,
            width:           '100%',
            padding:         '10px 0',
            fontSize:        '11px',
            fontWeight:      600,
            letterSpacing:   '0.1em',
            border:          `1px solid ${report.color}`,
            color:           report.color,
            backgroundColor: 'transparent',
            cursor:          'pointer',
          }}
        >
          NETWORK VISUALIZATION →
        </button>
      </div>
    </div>
  )
}

// ─── Summary strip ────────────────────────────────────────────────────────────

function SummaryStrip() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: BORDER }}>
      {[
        { label: 'TOTAL CAMPAIGNS',  value: '3',       color: '#EF4444' },
        { label: 'ACCOUNTS FLAGGED', value: '1,315',   color: '#F59E0B' },
        { label: 'AVG CONFIDENCE',   value: '89%',     color: '#E2E8F0' },
        { label: 'REPORTS GENERATED',value: '47',      color: '#E2E8F0' },
      ].map((cell, i) => (
        <div key={cell.label} style={{ padding: '14px 24px', borderRight: i < 3 ? BORDER : 'none' }}>
          <div style={{ ...FONT, fontSize: '10px', color: '#4A5568', letterSpacing: '0.1em', marginBottom: '8px' }}>
            {cell.label}
          </div>
          <div style={{ ...FONT, fontSize: '28px', fontWeight: 700, color: cell.color, lineHeight: 1 }}>
            {cell.value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  return (
    <div style={{ borderTop: BORDER }}>

      <SummaryStrip />

      {/* Page header */}
      <div style={{ padding: '24px 24px 0' }}>
        <div style={{ ...FONT, fontSize: '18px', fontWeight: 700, color: '#E2E8F0', marginBottom: '4px' }}>
          Campaign Intelligence Reports
        </div>
        <div style={{ ...FONT, fontSize: '11px', color: '#4A5568' }}>
          3 active campaigns · click a report to view its network graph
        </div>
      </div>

      {/* Report cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px 24px 24px' }}>
        {REPORTS.map(r => (
          <ReportCard key={r.campaignName} report={r} />
        ))}
      </div>

    </div>
  )
}
