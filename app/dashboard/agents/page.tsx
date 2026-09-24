'use client'

import { useState, useEffect } from 'react'

// ─── Types & data ─────────────────────────────────────────────────────────────

const FONT: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono, "Fira Code", monospace)',
}
const BORDER = '1px solid #1E2D4A'

interface Agent {
  number:      string
  name:        string
  color:       string
  status:      'ONLINE' | 'STANDBY'
  description: string
  tasks:       number
  load:        number
  lastActive:  string
}

interface LiveAgentStat {
  name:                 string
  status:               string
  tasks:                number
  seconds_since_active: number | null
}

// Fallback roster — real stats from /api/agents overlay these when the
// backend is reachable
const AGENTS: Agent[] = [
  {
    number:      '01',
    name:        'ContentAnalyzer',
    color:       '#00D4AA',
    status:      'ONLINE',
    description: 'Groq Llama 3.3 70B judging content authenticity, blended with keyword and structure signals.',
    tasks:       0,
    load:        0,
    lastActive:  '—',
  },
  {
    number:      '02',
    name:        'DeepfakeDetector',
    color:       '#7C3AED',
    status:      'ONLINE',
    description: 'ELA forensics + EXIF metadata analysis + AI-image classifier. Detects manipulated and AI-generated media.',
    tasks:       0,
    load:        0,
    lastActive:  '—',
  },
  {
    number:      '03',
    name:        'NetworkMapper',
    color:       '#F59E0B',
    status:      'ONLINE',
    description: 'Neo4j graph queries mapping account interaction networks and detecting bot behavior patterns.',
    tasks:       0,
    load:        0,
    lastActive:  '—',
  },
  {
    number:      '04',
    name:        'CampaignDetector',
    color:       '#3B82F6',
    status:      'ONLINE',
    description: 'LangGraph pipeline chaining content + network analysis to flag coordinated narrative bursts.',
    tasks:       0,
    load:        0,
    lastActive:  '—',
  },
  {
    number:      '05',
    name:        'ThreatClassifier',
    color:       '#EF4444',
    status:      'ONLINE',
    description: 'Scoring engine classifying campaigns: organic vs coordinated vs state-level operations.',
    tasks:       0,
    load:        0,
    lastActive:  '—',
  },
  {
    number:      '06',
    name:        'WhatsAppAnalyzer',
    color:       '#22C55E',
    status:      'ONLINE',
    description: 'Forward-chain pattern detection for Indian WhatsApp misinformation: Hindi, Hinglish, and English.',
    tasks:       0,
    load:        0,
    lastActive:  '—',
  },
  {
    number:      '07',
    name:        'TemporalCoordinator',
    color:       '#06B6D4',
    status:      'ONLINE',
    description: 'Cross-account posting-time correlation. Flags synchronized posting inside 60-second windows.',
    tasks:       0,
    load:        0,
    lastActive:  '—',
  },
  {
    number:      '08',
    name:        'LinguisticFingerprinter',
    color:       '#EC4899',
    status:      'ONLINE',
    description: 'Stylometric DBSCAN clustering — sentence length, vocabulary, punctuation, emoji rates per account.',
    tasks:       0,
    load:        0,
    lastActive:  '—',
  },
  {
    number:      '09',
    name:        'AIOperationDetector',
    color:       '#A78BFA',
    status:      'ONLINE',
    description: 'Bigram perplexity, burstiness, and topic-drift analysis separating LLM-run accounts from humans.',
    tasks:       0,
    load:        0,
    lastActive:  '—',
  },
  {
    number:      '10',
    name:        'SarvamLanguageDetector',
    color:       '#FB923C',
    status:      'ONLINE',
    description: 'Sarvam AI language identification tuned for 10+ Indian languages and code-mixed text.',
    tasks:       0,
    load:        0,
    lastActive:  '—',
  },
]

function formatLastActive(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

function mergeLiveStats(base: Agent[], live: LiveAgentStat[]): Agent[] {
  return base.map(agent => {
    const stat = live.find(s => s.name === agent.name)
    if (!stat) return agent
    return {
      ...agent,
      tasks:      stat.tasks,
      status:     'ONLINE',
      load:       stat.tasks > 0 ? Math.min(95, 15 + stat.tasks * 8) : 0,
      lastActive: formatLastActive(stat.seconds_since_active),
    }
  })
}

// ─── Per-card component (needs hooks, so must be a real component) ────────────

function AgentCard({ agent, idx }: { agent: Agent; idx: number }) {
  const [count,    setCount]    = useState(0)
  const [barWidth, setBarWidth] = useState(0)

  // Count-up animation
  useEffect(() => {
    if (agent.tasks === 0) { setCount(0); return }
    const duration = 1000 + idx * 80
    const step = agent.tasks / (duration / 16)
    let cur = 0
    const timer = setInterval(() => {
      cur += step
      if (cur >= agent.tasks) {
        setCount(agent.tasks)
        clearInterval(timer)
      } else {
        setCount(Math.floor(cur))
      }
    }, 16)
    return () => clearInterval(timer)
  }, [agent.tasks, idx])

  // Bar fill animation — mount at 0, then animate
  useEffect(() => {
    const t = setTimeout(() => setBarWidth(agent.load), 120 + idx * 60)
    return () => clearTimeout(t)
  }, [agent.load, idx])

  const isOnline = agent.status === 'ONLINE'
  const statusColor = isOnline ? '#22C55E' : '#F59E0B'

  return (
    <div
      style={{
        border:          `1px solid ${agent.color}`,
        backgroundColor: '#111D35',
        padding:         '20px',
        display:         'flex',
        flexDirection:   'column',
        gap:             '14px',
      }}
    >
      {/* Number badge */}
      <span
        style={{
          ...FONT,
          fontSize:      '11px',
          fontWeight:    700,
          color:         agent.color,
          letterSpacing: '0.12em',
        }}
      >
        {agent.number}
      </span>

      {/* Name + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...FONT, fontSize: '15px', fontWeight: 700, color: '#E2E8F0' }}>
          {agent.name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            className={isOnline ? 'st-pulse-dot' : undefined}
            style={{
              display:         'inline-block',
              width:           '6px',
              height:          '6px',
              borderRadius:    '50%',
              backgroundColor: statusColor,
              flexShrink:      0,
            }}
          />
          <span style={{ ...FONT, fontSize: '9px', color: statusColor, letterSpacing: '0.12em' }}>
            {agent.status}
          </span>
        </div>
      </div>

      {/* Description */}
      <div style={{ ...FONT, fontSize: '11px', color: '#4A5568', lineHeight: 1.65 }}>
        {agent.description}
      </div>

      {/* Tasks processed */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ ...FONT, fontSize: '10px', color: '#4A5568', letterSpacing: '0.1em' }}>
          TASKS PROCESSED
        </span>
        <span style={{ ...FONT, fontSize: '22px', fontWeight: 700, color: agent.color, lineHeight: 1 }}>
          {count.toLocaleString()}
        </span>
      </div>

      {/* Load bar */}
      <div>
        <div
          style={{
            display:        'flex',
            justifyContent: 'space-between',
            alignItems:     'center',
            marginBottom:   '6px',
          }}
        >
          <span style={{ ...FONT, fontSize: '10px', color: '#4A5568', letterSpacing: '0.08em' }}>
            AGENT LOAD
          </span>
          <span style={{ ...FONT, fontSize: '10px', color: '#E2E8F0' }}>
            {`${agent.load}%`}
          </span>
        </div>
        <div style={{ height: '4px', backgroundColor: '#0D1526', border: BORDER }}>
          <div
            style={{
              height:          '100%',
              width:           `${barWidth}%`,
              backgroundColor: agent.color,
              opacity:         0.85,
              transition:      'width 0.9s ease',
            }}
          />
        </div>
      </div>

      {/* Last active */}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: BORDER, paddingTop: '10px' }}>
        <span style={{ ...FONT, fontSize: '10px', color: '#4A5568', letterSpacing: '0.08em' }}>
          LAST ACTIVE
        </span>
        <span style={{ ...FONT, fontSize: '10px', color: isOnline ? '#22C55E' : '#8B9AB5' }}>
          {agent.lastActive}
        </span>
      </div>
    </div>
  )
}

// ─── System summary strip ─────────────────────────────────────────────────────

function SystemStrip({ agents, live }: { agents: Agent[]; live: boolean }) {
  const online  = agents.filter(a => a.status === 'ONLINE').length
  const total   = agents.length
  const totalTasks = agents.reduce((s, a) => s + a.tasks, 0)

  return (
    <div
      style={{
        display:      'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        borderBottom: BORDER,
      }}
    >
      {[
        { label: 'AGENTS ONLINE',       value: `${online} / ${total}`,      valueColor: '#22C55E' },
        { label: 'TASKS THIS SESSION',  value: totalTasks.toLocaleString(), valueColor: '#E2E8F0' },
        { label: 'STATS SOURCE',        value: live ? 'LIVE' : 'OFFLINE',   valueColor: live ? '#22C55E' : '#F59E0B' },
        { label: 'SYSTEM STATUS',       value: 'NOMINAL',                   valueColor: '#22C55E' },
      ].map((cell, i) => (
        <div
          key={cell.label}
          style={{
            padding:     '14px 24px',
            borderRight: i < 3 ? BORDER : 'none',
          }}
        >
          <div style={{ ...FONT, fontSize: '10px', color: '#4A5568', letterSpacing: '0.1em', marginBottom: '8px' }}>
            {cell.label}
          </div>
          <div style={{ ...FONT, fontSize: '28px', fontWeight: 700, color: cell.valueColor, lineHeight: 1 }}>
            {cell.value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>(AGENTS)
  const [live,   setLive]   = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/agents')
        if (!res.ok) return
        const stats = (await res.json()) as LiveAgentStat[]
        if (!cancelled && Array.isArray(stats)) {
          setAgents(mergeLiveStats(AGENTS, stats))
          setLive(true)
        }
      } catch {
        // backend unreachable — fallback roster stays
      }
    }
    load()
    const timer = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  return (
    <div style={{ borderTop: BORDER }}>

      {/* ── Summary strip ─────────────────────────────────────────────────── */}
      <SystemStrip agents={agents} live={live} />

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div style={{ padding: '24px 24px 0' }}>
        <div style={{ ...FONT, fontSize: '18px', fontWeight: 700, color: '#E2E8F0', marginBottom: '4px' }}>
          Agent Intelligence Network
        </div>
        <div style={{ ...FONT, fontSize: '11px', color: '#4A5568' }}>
          {agents.length} specialized AI agents operating in parallel — task counts are live from the backend
        </div>
      </div>

      {/* ── Agent card grid ───────────────────────────────────────────────── */}
      <div
        style={{
          display:               'grid',
          gridTemplateColumns:   'repeat(auto-fill, minmax(360px, 1fr))',
          gap:                   '16px',
          padding:               '20px 24px 24px',
        }}
      >
        {agents.map((agent, i) => (
          <AgentCard key={agent.number} agent={agent} idx={i} />
        ))}
      </div>

    </div>
  )
}
