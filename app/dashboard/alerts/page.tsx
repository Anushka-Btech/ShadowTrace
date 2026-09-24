'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = 'HIGH' | 'MED' | 'LOW'
type CampaignName = 'Operation Pulse' | 'MedFear' | 'ReviewStorm'

interface AlertItem {
  id:       string
  severity: Severity
  campaign: CampaignName
  time:     string
  message:  string
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const FONT: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono, "Fira Code", monospace)',
}
const BORDER = '1px solid #1E2D4A'

const SEV_COLOR: Record<Severity, string> = {
  HIGH: '#EF4444',
  MED:  '#F59E0B',
  LOW:  '#3B82F6',
}

const CAMP_COLOR: Record<CampaignName, string> = {
  'Operation Pulse': '#EF4444',
  'MedFear':         '#F59E0B',
  'ReviewStorm':     '#3B82F6',
}

// ─── Alert data (12 alerts, 4 per campaign, 4 per severity) ──────────────────

const ALL_ALERTS: AlertItem[] = [
  {
    id: 'a01', severity: 'HIGH', campaign: 'Operation Pulse', time: '2m ago',
    message: 'Coordinated narrative burst confirmed — 847 accounts posted identical text within a 4-minute window at 14:19 UTC. Cross-platform amplification detected simultaneously on Twitter/X, WhatsApp, and Telegram. Estimated organic reach suppression: 34%.',
  },
  {
    id: 'a02', severity: 'MED', campaign: 'Operation Pulse', time: '7m ago',
    message: 'New amplifier cluster activated — 12 previously dormant accounts joined the network at 14:21 UTC. All accounts were created within the same 3-day window in April 2026, consistent with pre-provisioned bot infrastructure. Cluster ID: PULSE-C5.',
  },
  {
    id: 'a03', severity: 'HIGH', campaign: 'MedFear', time: '11m ago',
    message: 'Deepfake audio attributed to AIIMS Director General detected with 89% GAN synthesis confidence. Audio clip circulating across 312 accounts in Maharashtra; 2,400 organic reshares recorded in under 18 minutes. Content flagged for regulatory escalation.',
  },
  {
    id: 'a04', severity: 'HIGH', campaign: 'Operation Pulse', time: '23m ago',
    message: 'State-actor attribution confidence elevated to 94%. Bot cluster infrastructure fingerprint overlaps with documented APT-42 patterns from Q1 2026 incidents. Three origin nodes traced to autonomous system AS-47764. Recommend immediate escalation to CERT-In.',
  },
  {
    id: 'a05', severity: 'MED', campaign: 'ReviewStorm', time: '38m ago',
    message: 'Negative review bombing detected — 78 coordinated 1-star reviews submitted across Flipkart, Amazon IN, and Meesho within a 45-minute window. Linguistic analysis shows 87% text similarity. All accounts registered within a 2-week period in May 2026.',
  },
  {
    id: 'a06', severity: 'MED', campaign: 'MedFear', time: '45m ago',
    message: 'Geographic expansion confirmed — vaccine misinformation narrative spread to 4 new Maharashtra districts within 30 minutes. Network cluster now active in Pune, Nagpur, Nashik, and Aurangabad. 23% growth rate exceeds the 30-minute baseline threshold.',
  },
  {
    id: 'a07', severity: 'LOW', campaign: 'ReviewStorm', time: '1h ago',
    message: 'Bot cluster dormancy cycle observed — 22 accounts suspended all posting activity simultaneously at 13:14 UTC. Historical pattern analysis across 6 prior campaigns indicates reactivation likely within 48–72 hours. Passive monitoring maintained.',
  },
  {
    id: 'a08', severity: 'LOW', campaign: 'Operation Pulse', time: '1h 8m ago',
    message: 'Cross-platform echo chamber forming — identical narrative detected on 3 platforms with 23% verbatim content overlap. Activity level currently below critical classification threshold. Monitoring frequency elevated from 15-min to 5-min intervals.',
  },
  {
    id: 'a09', severity: 'HIGH', campaign: 'ReviewStorm', time: '1h 12m ago',
    message: 'Rating manipulation confirmed — TechPro X200 product listing inflated from 2.1 to 4.7 stars via 156 coordinated 5-star reviews submitted within a 6-hour window on Flipkart. Primary seller account linked to 7 other manipulated product listings.',
  },
  {
    id: 'a10', severity: 'MED', campaign: 'MedFear', time: '1h 30m ago',
    message: 'Fabricated WHO adverse-event statistics detected in 4 circulating PDF documents. File metadata analysis traces all document variants to a single origin device with 91% forensic confidence. Cumulative download count: 1,847 across monitored platforms.',
  },
  {
    id: 'a11', severity: 'LOW', campaign: 'MedFear', time: '2h 15m ago',
    message: 'Fact-check suppression pattern identified — 15 verified debunking articles mass-reported for platform content removal within a 2-hour window. Reports originate from 8 accounts exhibiting coordinated timing at 67% confidence. Standard counter-narrative procedure initiated.',
  },
  {
    id: 'a12', severity: 'LOW', campaign: 'ReviewStorm', time: '2h 45m ago',
    message: 'Cross-seller account reuse detected — 34 accounts appearing across 7 different product listings with statistically identical review submission timing signatures. Attribution confidence: 67%. Observation window extended to 72 hours pending additional correlation data.',
  },
]

// ─── Evidence export payload ───────────────────────────────────────────────────

function buildExportPayload(alerts: AlertItem[]) {
  return {
    export_timestamp: new Date().toISOString(),
    generated_by:    'ShadowTrace v1.0',
    campaigns: [
      { id: 'campaign-001', name: 'Operation Pulse', threat_level: 'HIGH', confidence: 0.94, accounts_flagged: 847,  start_time: '2026-05-14T02:17:00Z' },
      { id: 'campaign-002', name: 'MedFear',         threat_level: 'HIGH', confidence: 0.91, accounts_flagged: 312,  start_time: '2026-06-01T08:45:00Z' },
      { id: 'campaign-003', name: 'ReviewStorm',     threat_level: 'MED',  confidence: 0.82, accounts_flagged: 156,  start_time: '2026-06-10T16:22:00Z' },
    ],
    alerts: alerts.map(a => ({
      id:        a.id,
      severity:  a.severity,
      campaign:  a.campaign,
      timestamp: a.time,
      message:   a.message,
    })),
    network_summary: {
      total_accounts: 1247,
      bot_clusters:   9,
      origin_nodes:   3,
    },
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterPill({
  label,
  active,
  color,
  onClick,
}: {
  label:   string
  active:  boolean
  color?:  string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`st-tab ${active ? 'st-tab-active' : ''}`}
      style={{
        ...FONT,
        padding:         '4px 12px',
        fontSize:        '10px',
        fontWeight:      active ? 600 : 400,
        letterSpacing:   '0.08em',
        border:          active ? 'none' : BORDER,
        backgroundColor: active ? (color ?? '#00D4AA') : 'transparent',
        color:           active ? '#080E1A' : '#4A5568',
      }}
    >
      {label}
    </button>
  )
}

function AlertCard({ alert }: { alert: AlertItem }) {
  const router = useRouter()

  function viewNetwork() {
    sessionStorage.setItem('st-campaign', alert.campaign)
    router.push('/dashboard/network')
  }

  return (
    <div
      className={`st-alert-card sev-${alert.severity}`}
      style={{
        backgroundColor: '#111D35',
        borderBottom:    BORDER,
        padding:         '14px 20px',
      }}
    >
      {/* Row 1: severity badge + campaign badge + timestamp */}
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          '8px',
          marginBottom: '8px',
        }}
      >
        <span
          style={{
            ...FONT,
            fontSize:        '9px',
            fontWeight:      700,
            letterSpacing:   '0.1em',
            padding:         '2px 7px',
            backgroundColor: SEV_COLOR[alert.severity],
            color:           '#080E1A',
            flexShrink:      0,
          }}
        >
          {alert.severity}
        </span>

        <span
          style={{
            ...FONT,
            fontSize:   '10px',
            color:      CAMP_COLOR[alert.campaign],
            letterSpacing: '0.04em',
          }}
        >
          {alert.campaign}
        </span>

        <span style={{ ...FONT, fontSize: '10px', color: '#4A5568', marginLeft: 'auto', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {alert.time}
        </span>
      </div>

      {/* Row 2: message */}
      <div style={{ ...FONT, fontSize: '12px', color: '#E2E8F0', lineHeight: 1.65, marginBottom: '10px' }}>
        {alert.message}
      </div>

      {/* Row 3: actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={viewNetwork}
          style={{
            ...FONT,
            padding:         '4px 14px',
            fontSize:        '10px',
            fontWeight:      600,
            letterSpacing:   '0.08em',
            border:          `1px solid ${CAMP_COLOR[alert.campaign]}`,
            color:           CAMP_COLOR[alert.campaign],
            backgroundColor: 'transparent',
            cursor:          'pointer',
          }}
        >
          VIEW NETWORK →
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const [sevFilter,  setSevFilter]  = useState<Severity | 'ALL'>('ALL')
  const [campFilter, setCampFilter] = useState<CampaignName | 'ALL'>('ALL')
  const [toast,      setToast]      = useState(false)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const filtered = ALL_ALERTS.filter(a =>
    (sevFilter  === 'ALL' || a.severity === sevFilter) &&
    (campFilter === 'ALL' || a.campaign === campFilter),
  )

  const showToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(true)
    toastTimerRef.current = setTimeout(() => setToast(false), 3000)
  }, [])

  function exportEvidence() {
    const payload  = buildExportPayload(filtered)
    const blob     = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url      = URL.createObjectURL(blob)
    const a        = document.createElement('a')
    a.href         = url
    a.download     = `shadowtrace-evidence-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast()
  }

  const CAMPAIGNS: CampaignName[] = ['Operation Pulse', 'MedFear', 'ReviewStorm']

  return (
    <div style={{ borderTop: BORDER }}>

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          flexWrap:       'wrap',
          gap:            '8px',
          padding:        '10px 20px',
          borderBottom:   BORDER,
          backgroundColor:'#080E1A',
        }}
      >
        {/* Severity filter */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <FilterPill label="ALL"  active={sevFilter === 'ALL'}  onClick={() => setSevFilter('ALL')}  />
          <FilterPill label="HIGH" active={sevFilter === 'HIGH'} onClick={() => setSevFilter('HIGH')} color={SEV_COLOR.HIGH} />
          <FilterPill label="MED"  active={sevFilter === 'MED'}  onClick={() => setSevFilter('MED')}  color={SEV_COLOR.MED}  />
          <FilterPill label="LOW"  active={sevFilter === 'LOW'}  onClick={() => setSevFilter('LOW')}  color={SEV_COLOR.LOW}  />
        </div>

        {/* Divider */}
        <span style={{ color: '#1E2D4A', fontSize: '18px', lineHeight: 1, userSelect: 'none' }}>|</span>

        {/* Campaign filter */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
          <FilterPill label="ALL CAMPAIGNS" active={campFilter === 'ALL'} onClick={() => setCampFilter('ALL')} />
          {CAMPAIGNS.map(c => (
            <FilterPill
              key={c}
              label={c.toUpperCase()}
              active={campFilter === c}
              onClick={() => setCampFilter(c)}
              color={CAMP_COLOR[c]}
            />
          ))}
        </div>

        {/* Spacer + alert count + export button */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ ...FONT, fontSize: '10px', color: '#4A5568', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
            {`Showing ${filtered.length} of ${ALL_ALERTS.length} alerts`}
          </span>

          <button
            onClick={exportEvidence}
            style={{
              ...FONT,
              padding:         '6px 16px',
              fontSize:        '10px',
              fontWeight:      600,
              letterSpacing:   '0.1em',
              border:          '1px solid #00D4AA',
              color:           '#00D4AA',
              backgroundColor: 'transparent',
              cursor:          'pointer',
              whiteSpace:      'nowrap',
            }}
          >
            EXPORT EVIDENCE PACKAGE
          </button>
        </div>
      </div>

      {/* ── Alert list ────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="st-empty">
          <div className="st-empty-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 2C5.8 2 4 3.8 4 6v4l-1.5 1.5h11L12 10V6c0-2.2-1.8-4-4-4z" />
              <path d="M6.5 12c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5" />
            </svg>
          </div>
          <div className="st-empty-title">NO ALERTS MATCH THE CURRENT FILTERS</div>
          <div className="st-empty-subtext">Try widening the severity or campaign filter above.</div>
        </div>
      ) : (
        <div>
          {filtered.map(alert => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          style={{
            position:        'fixed',
            bottom:          '28px',
            right:           '28px',
            backgroundColor: '#0D1526',
            border:          '1px solid #00D4AA',
            padding:         '12px 20px',
            zIndex:          200,
            display:         'flex',
            alignItems:      'center',
            gap:             '10px',
            ...FONT,
            fontSize:        '12px',
            color:           '#00D4AA',
            letterSpacing:   '0.04em',
          }}
        >
          <span style={{ fontSize: '14px', lineHeight: 1 }}>✓</span>
          Evidence package exported
        </div>
      )}

    </div>
  )
}
