'use client'

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore,
} from 'react'
import type { Campaign } from '@/types'
import { campaigns as mockCampaigns } from '@/lib/mockData'
import {
  ALERTS_TODAY_BASE, SIGNAL_POOL, SIGNAL_SEED, deriveIntel, signalTag, withClusters,
  type CampaignIntel, type StreamEvent,
} from '@/lib/mission'
import {
  loadRecords, saveRecords, type InvestigationRecord,
} from '@/lib/investigate'

// ─── Shape ────────────────────────────────────────────────────────────────────

export interface LiveFeedState {
  count:     number
  sources:   number
  updatedAt: number
  sample:    boolean          // true when the API returned its canned fallback feed
}

export interface AgentsState {
  status: 'online' | 'offline'
  online: number
  total:  number
}

interface Mission {
  /** null while the first load is in flight */
  campaigns:   Campaign[] | null
  intel:       CampaignIntel[]
  selectedId:  string | null
  select:      (id: string, opts?: { scroll?: boolean }) => void
  selected:    { campaign: Campaign; intel: CampaignIntel } | null

  events:      StreamEvent[]
  newSignals:  number
  alertsToday: number

  liveFeed:    LiveFeedState | null
  agents:      AgentsState | null

  investigations: InvestigationRecord[]
  addInvestigation:    (r: InvestigationRecord) => void
  removeInvestigation: (id: string) => void

  /** Ask the intake panel to show a stored investigation. */
  openRecord:  { record: InvestigationRecord; nonce: number } | null
  viewRecord:  (r: InvestigationRecord) => void

  /** epoch ms, 0 until the client has mounted */
  now: number
}

const Ctx = createContext<Mission | null>(null)

export function useMission(): Mission {
  const v = useContext(Ctx)
  if (!v) throw new Error('useMission must be used inside <MissionProvider>')
  return v
}

// ─── Provider ─────────────────────────────────────────────────────────────────

// A shared wall clock: 0 on the server (identical markup), then real time in 30 s steps.
const TICK_MS = 30_000
const subscribeClock = (cb: () => void) => { const t = setInterval(cb, TICK_MS); return () => clearInterval(t) }
const clockSnapshot  = () => Math.floor(Date.now() / TICK_MS) * TICK_MS
const clockServer    = () => 0

const GRAPH_SECTION_ID = 'mc-network'
const SIGNAL_INTERVAL_MS = 25_000

export default function MissionProvider({ children }: { children: React.ReactNode }) {
  const [campaigns,  setCampaigns]  = useState<Campaign[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [signals,    setSignals]    = useState<StreamEvent[]>([])
  const [newSignals, setNewSignals] = useState(0)
  const [extra,      setExtra]      = useState<StreamEvent[]>([])       // investigation events
  const [claims,     setClaims]     = useState<StreamEvent[]>([])
  const [liveFeed,   setLiveFeed]   = useState<LiveFeedState | null>(null)
  const [agents,     setAgents]     = useState<AgentsState | null>(null)
  const [records,    setRecords]    = useState<InvestigationRecord[]>([])
  const [openRecord, setOpenRecord] = useState<Mission['openRecord']>(null)
  const now = useSyncExternalStore(subscribeClock, clockSnapshot, clockServer)

  const poolIdx = useRef(0)
  const counter = useRef(0)

  // campaigns — /api/campaigns already falls back to mock data server-side
  useEffect(() => {
    const ctl = new AbortController()
    fetch('/api/campaigns', { signal: ctl.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((data: Campaign[] | null) => {
        const list = Array.isArray(data) && data.length ? data : mockCampaigns
        setCampaigns(list)
        setSelectedId(cur => cur ?? list[0]?.id ?? null)
      })
      .catch(err => {
        if (err?.name === 'AbortError') return
        setCampaigns(mockCampaigns)
        setSelectedId(cur => cur ?? mockCampaigns[0]?.id ?? null)
      })
    return () => ctl.abort()
  }, [])

  // Seed the signal stream and stored investigations on the client only — both depend on
  // the browser clock / localStorage, so doing this during render would break hydration.
  useEffect(() => {
    const t0 = Date.now()
    setSignals(
      SIGNAL_SEED.map((s, i) => ({
        id: `seed-${i}`, at: t0 - s.minutesAgo * 60_000, kind: 'signal' as const,
        sev: s.sev, campaign: s.campaign, text: s.text, tag: signalTag(s.text),
      })),
    )
    setRecords(loadRecords())
  }, [])

  // a new signal every 25 s — same cadence and pool as the previous alert feed
  useEffect(() => {
    const t = setInterval(() => {
      const tpl = SIGNAL_POOL[poolIdx.current % SIGNAL_POOL.length]
      poolIdx.current++
      const ev: StreamEvent = {
        id: `live-${Date.now()}-${++counter.current}`, at: Date.now(), kind: 'signal',
        sev: tpl.sev, campaign: tpl.campaign, text: tpl.text, tag: signalTag(tpl.text),
      }
      setSignals(prev => [ev, ...prev].slice(0, 30))
      setNewSignals(n => n + 1)
    }, SIGNAL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [])

  // live fact-check feed (real RSS via the backend; mock fallback is detected and excluded)
  useEffect(() => {
    const ctl = new AbortController()
    const load = () =>
      fetch('/api/live-feed', { signal: ctl.signal })
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (!data || !Array.isArray(data.items)) return
          const items = data.items as {
            id?: string; title?: string; source?: string; published?: string
            risk_level?: 'HIGH' | 'MED' | 'LOW'; url?: string; link?: string
          }[]
          const sample = items.length > 0 && items.every(i => String(i.id ?? '').startsWith('mock'))
          setLiveFeed({
            count:     typeof data.total_count === 'number' ? data.total_count : items.length,
            sources:   Array.isArray(data.sources) ? data.sources.length : 0,
            updatedAt: Date.parse(data.last_updated) || Date.now(),
            sample,
          })
          setClaims(
            sample ? [] :
            items.slice(0, 8).map((i, n): StreamEvent => ({
              id:     `fc-${i.id ?? n}`,
              at:     Date.parse(i.published ?? '') || Date.now(),
              kind:   'factcheck',
              sev:    i.risk_level ?? 'MED',
              text:   i.title ?? 'Debunked claim',
              tag:    'FACT-CHECK',
              source: i.source,
              url:    i.url ?? i.link,
            })),
          )
        })
        .catch(() => { /* leave as-is */ })
    load()
    const t = setInterval(load, 5 * 60_000)
    return () => { ctl.abort(); clearInterval(t) }
  }, [])

  // agent status — real, from the backend process
  useEffect(() => {
    let alive = true
    const load = () =>
      fetch('/api/agents', { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : Promise.reject()))
        .then((list: { status: string }[]) => {
          if (!alive || !Array.isArray(list)) return
          setAgents({ status: 'online', online: list.filter(a => a.status === 'ONLINE').length, total: list.length })
        })
        .catch(() => { if (alive) setAgents({ status: 'offline', online: 0, total: 0 }) })
    load()
    const t = setInterval(load, 30_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  // ── derived ────────────────────────────────────────────────────────────────
  const graphCampaigns = useMemo(() => (campaigns ?? []).map(withClusters), [campaigns])
  const intel          = useMemo(() => graphCampaigns.map(deriveIntel), [graphCampaigns])

  const selected = useMemo(() => {
    const campaign = graphCampaigns.find(c => c.id === selectedId) ?? graphCampaigns[0]
    if (!campaign) return null
    return { campaign, intel: intel.find(i => i.id === campaign.id)! }
  }, [graphCampaigns, intel, selectedId])

  const events = useMemo(
    () => [...signals, ...claims, ...extra].sort((a, b) => b.at - a.at),
    [signals, claims, extra],
  )

  // ── actions ────────────────────────────────────────────────────────────────
  const select = useCallback((id: string, opts?: { scroll?: boolean }) => {
    setSelectedId(id)
    if (opts?.scroll) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      document.getElementById(GRAPH_SECTION_ID)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    }
  }, [])

  const addInvestigation = useCallback((r: InvestigationRecord) => {
    setRecords(prev => {
      const next = [r, ...prev].slice(0, 12)
      saveRecords(next)
      return next
    })
    const t = r.result
    setExtra(prev => [
      {
        id: `inv-ev-${r.id}`, at: r.at, kind: 'investigation' as const,
        sev: t.sev === 'CRITICAL' || t.sev === 'HIGH' ? 'HIGH' as const : t.sev === 'MEDIUM' ? 'MED' as const : 'LOW' as const,
        campaign: t.campaign ?? undefined,
        text: `Investigation complete — ${t.title}`,
        tag: 'INVESTIGATION',
      },
      ...prev,
    ].slice(0, 10))
  }, [])

  const removeInvestigation = useCallback((id: string) => {
    setRecords(prev => {
      const next = prev.filter(r => r.id !== id)
      saveRecords(next)
      return next
    })
  }, [])

  const viewRecord = useCallback((record: InvestigationRecord) => {
    setOpenRecord({ record, nonce: Date.now() })
  }, [])

  const value: Mission = {
    campaigns, intel, selectedId: selected?.campaign.id ?? selectedId, select, selected,
    events, newSignals, alertsToday: ALERTS_TODAY_BASE + newSignals,
    liveFeed, agents,
    investigations: records, addInvestigation, removeInvestigation,
    openRecord, viewRecord,
    now,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
