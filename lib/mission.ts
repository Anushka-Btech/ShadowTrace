/**
 * Mission Control data layer.
 *
 * One dataset drives every widget on the dashboard so the screen never
 * contradicts itself. Anything that can be computed from the campaign graphs
 * the API returns IS computed (accounts, reach, clusters, depth, concentration).
 *
 * Two kinds of values cannot be derived today, and are kept here — in one
 * place, clearly labelled — so they are easy to swap for real sources:
 *
 *   SEEDS   Threat score per campaign, the "bots detected" estimate, the
 *           "alerts today" baseline, the 24h activity pattern and the
 *           rotating signal pool. These already existed as hard-coded values
 *           in the previous dashboard; they were moved, not invented.
 *
 *   ABSENT  Trend deltas ("+2 since yesterday") and per-edge propagation
 *           velocity need history / timestamps that no endpoint returns. They
 *           are deliberately NOT fabricated. Where a trend would go we show a
 *           real, derived fact instead.
 */

import type { Campaign, GraphNode, NodeType } from '@/types'

// ─── Severity ─────────────────────────────────────────────────────────────────

export type Sev = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export const SEV_COLOR: Record<Sev, string> = {
  CRITICAL: '#EF4444',
  HIGH:     '#EF4444',
  MEDIUM:   '#F59E0B',
  LOW:      '#00D4AA',
}

/** Backend threat levels use HIGH / MED / LOW. */
export function sevFromLevel(level: string | undefined | null): Sev {
  const l = (level ?? '').toUpperCase()
  if (l === 'CRITICAL')                 return 'CRITICAL'
  if (l === 'HIGH')                     return 'HIGH'
  if (l === 'MED' || l === 'MEDIUM')    return 'MEDIUM'
  return 'LOW'
}

export function sevFromScore(score: number): Sev {
  if (score >= 70) return 'HIGH'
  if (score >= 40) return 'MEDIUM'
  return 'LOW'
}

// ─── Seeds (pre-existing demo values, consolidated) ───────────────────────────

/** Threat score per campaign — the values the previous dashboard displayed. */
export const THREAT_SCORE_SEED: Record<string, number> = {
  'Operation Pulse': 91,
  'MedFear':         74,
  'ReviewStorm':     43,
}

/** Analyst-facing name for what each campaign is about. */
export const CAMPAIGN_TOPIC_SEED: Record<string, string> = {
  'Operation Pulse': 'Election narrative',
  'MedFear':         'Health narrative',
  'ReviewStorm':     'Review network',
}

/** Estimated bot total across campaigns. Only a portion is placed in the graphs. */
export const BOTS_DETECTED_SEED = 1247

/** Alerts raised earlier today (includes the ones shown in the stream). */
export const ALERTS_TODAY_BASE = 18

/** Hours (UTC hour-of-day) in which each campaign was active. Presentation seed. */
export const ACTIVITY_SEED: { name: string; hours: number[] }[] = [
  { name: 'Operation Pulse', hours: [2, 3, 4, 9, 10, 13, 14, 15, 20, 21, 22, 23] },
  { name: 'MedFear',         hours: [8, 9, 10, 11, 14, 15, 16, 17, 19] },
  { name: 'ReviewStorm',     hours: [0, 1, 6, 7, 8, 12, 13, 18, 20, 21] },
]

// ─── Derived campaign intelligence ────────────────────────────────────────────

export interface Hub {
  id:        string
  label:     string
  accountId: string
  type:      NodeType
  degree:    number
}

export interface CampaignIntel {
  id:            string
  name:          string
  topic:         string
  score:         number
  sev:           Sev
  confidence:    number            // 0-100
  accounts:      number            // campaign.account_count (total tracked)
  mapped:        number            // nodes placed in the graph
  counts:        Record<NodeType, number>
  clusters:      number
  reach:         number            // sum of followers of mapped accounts
  depth:         number            // BFS hops from origin (or top hub)
  hubs:          Hub[]             // top-3 by degree
  concentration: number            // 0-1: share of links touching the top-3 hubs
  edges:         number
  strongest:     { from: GraphNode; to: GraphNode; weight: number } | null
  hasOrigin:     boolean
  startedAt:     number
}

function idOf(x: string | GraphNode): string {
  return typeof x === 'string' ? x : x.id
}

/**
 * Backend data ships `clusterId: null` for every account, which made the graph
 * label every bot "C1". When no cluster ids are provided, derive them as the
 * connected components of the non-legitimate accounts (size ≥ 2).
 */
export function withClusters(c: Campaign): Campaign {
  if (c.nodes.some(n => n.clusterId !== undefined && n.clusterId !== null)) return c

  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    let cur = x
    while (parent.get(cur) !== r) { const nx = parent.get(cur)!; parent.set(cur, r); cur = nx }
    return r
  }
  const eligible = new Set(c.nodes.filter(n => n.type !== 'legitimate').map(n => n.id))
  eligible.forEach(id => parent.set(id, id))
  for (const e of c.edges) {
    const a = idOf(e.source), b = idOf(e.target)
    if (eligible.has(a) && eligible.has(b)) parent.set(find(a), find(b))
  }
  const groups = new Map<string, string[]>()
  eligible.forEach(id => {
    const r = find(id)
    groups.set(r, [...(groups.get(r) ?? []), id])
  })
  const ordered = [...groups.values()].filter(g => g.length >= 2).sort((a, b) => b.length - a.length)
  const clusterOf = new Map<string, number>()
  ordered.forEach((g, i) => g.forEach(id => clusterOf.set(id, i)))

  return {
    ...c,
    nodes: c.nodes.map(n => (clusterOf.has(n.id) ? { ...n, clusterId: clusterOf.get(n.id) } : n)),
  }
}

export function deriveIntel(input: Campaign): CampaignIntel {
  const c = withClusters(input)
  const byId = new Map(c.nodes.map(n => [n.id, n]))

  const counts: Record<NodeType, number> = { origin: 0, bot: 0, amplifier: 0, legitimate: 0 }
  let reach = 0
  for (const n of c.nodes) {
    counts[n.type] = (counts[n.type] ?? 0) + 1
    reach += Number(n.followers) || 0
  }

  // adjacency + degree over edges whose endpoints exist
  const adj = new Map<string, Set<string>>()
  const degree = new Map<string, number>()
  const links: { a: string; b: string; w: number }[] = []
  for (const e of c.edges) {
    const a = idOf(e.source), b = idOf(e.target)
    if (!byId.has(a) || !byId.has(b)) continue
    links.push({ a, b, w: e.weight })
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b); adj.get(b)!.add(a)
    degree.set(a, (degree.get(a) ?? 0) + 1)
    degree.set(b, (degree.get(b) ?? 0) + 1)
  }

  const ranked = [...degree.entries()]
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .slice(0, 3)
  const hubs: Hub[] = ranked.map(([id, d]) => {
    const n = byId.get(id)!
    return { id, label: n.label, accountId: n.accountId ?? n.label, type: n.type, degree: d }
  })
  const hubIds = new Set(hubs.map(h => h.id))
  const concentration = links.length
    ? links.filter(l => hubIds.has(l.a) || hubIds.has(l.b)).length / links.length
    : 0

  // propagation depth: BFS from the origin, else from the busiest hub
  const origin = c.nodes.find(n => n.type === 'origin')
  const rootId = origin?.id ?? hubs[0]?.id
  let depth = 0
  if (rootId) {
    const seen = new Map<string, number>([[rootId, 0]])
    const queue = [rootId]
    while (queue.length) {
      const cur = queue.shift()!
      for (const nb of adj.get(cur) ?? []) {
        if (seen.has(nb)) continue
        seen.set(nb, seen.get(cur)! + 1)
        queue.push(nb)
      }
    }
    depth = Math.max(...seen.values())
  }

  let strongest: CampaignIntel['strongest'] = null
  for (const l of links) {
    if (!strongest || l.w > strongest.weight) {
      strongest = { from: byId.get(l.a)!, to: byId.get(l.b)!, weight: l.w }
    }
  }

  const clusterIds = new Set(
    c.nodes
      .filter(n => n.clusterId !== undefined && n.clusterId !== null)
      .map(n => n.clusterId),
  )

  const score = THREAT_SCORE_SEED[c.name] ?? Math.round((c.confidence ?? 0) * 100)
  const started = Date.parse(c.start_time)

  return {
    id:            c.id,
    name:          c.name,
    topic:         CAMPAIGN_TOPIC_SEED[c.name] ?? topicFromText(`${c.name} ${c.narrative}`) ?? c.name,
    score,
    sev:           sevFromScore(score),
    confidence:    Math.round((c.confidence ?? 0) * 100),
    accounts:      c.account_count,
    mapped:        c.nodes.length,
    counts,
    clusters:      clusterIds.size,
    reach,
    depth,
    hubs,
    concentration,
    edges:         links.length,
    strongest,
    hasOrigin:     !!origin,
    startedAt:     Number.isFinite(started) ? started : 0,
  }
}

function topicFromText(s: string): string | null {
  const t = s.toLowerCase()
  if (/election|vot|evm/.test(t))                                   return 'Election narrative'
  if (/health|vaccine|medical|covid|treatment|cure|immun/.test(t))  return 'Health narrative'
  if (/review|product|consumer|rating|shop/.test(t))                return 'Review network'
  return null
}

/** Map an analysis narrative category onto a tracked campaign (unchanged behaviour). */
export function matchCampaignName(category: string | undefined): string | null {
  const s = (category ?? '').toLowerCase()
  if (/election|vot|evm|politi|democrat/.test(s))                    return 'Operation Pulse'
  if (/health|vaccine|medical|who|pharma|covid|immun/.test(s))       return 'MedFear'
  if (/review|product|consumer|rating|commercial|shop/.test(s))      return 'ReviewStorm'
  return null
}

// ─── Live stream ──────────────────────────────────────────────────────────────

export type StreamKind = 'signal' | 'factcheck' | 'investigation'

export interface StreamEvent {
  id:        string
  at:        number                     // epoch ms
  kind:      StreamKind
  sev:       'HIGH' | 'MED' | 'LOW'
  campaign?: string
  text:      string
  tag:       string
  url?:      string
  source?:   string
}

interface SignalTemplate { sev: 'HIGH' | 'MED' | 'LOW'; text: string; campaign: string }

/** Signals already on screen when the previous dashboard loaded (minutes ago). */
export const SIGNAL_SEED: (SignalTemplate & { minutesAgo: number })[] = [
  { sev: 'HIGH', campaign: 'Operation Pulse', minutesAgo: 2,  text: 'Coordinated burst detected — 847 accounts sharing identical narrative within 4 min window' },
  { sev: 'MED',  campaign: 'MedFear',         minutesAgo: 11, text: 'Deepfake image flagged in 3 active campaigns' },
  { sev: 'HIGH', campaign: 'Operation Pulse', minutesAgo: 23, text: 'State-level pattern identified — 94% confidence' },
  { sev: 'MED',  campaign: 'MedFear',         minutesAgo: 45, text: 'Health misinfo cluster expanding — 312 accounts' },
  { sev: 'LOW',  campaign: 'ReviewStorm',     minutesAgo: 60, text: 'Bot cluster expanding — monitoring active' },
]

/** Rotating pool that produces a new signal every 25 s (unchanged cadence). */
export const SIGNAL_POOL: SignalTemplate[] = [
  { sev: 'HIGH', campaign: 'Operation Pulse', text: 'Cross-platform amplification surge — 3 platforms synchronised' },
  { sev: 'HIGH', campaign: 'Operation Pulse', text: 'Narrative velocity spike — 3.4× above 24h baseline' },
  { sev: 'MED',  campaign: 'Operation Pulse', text: 'New amplifier cluster joined — 12 accounts added in 6 min' },
  { sev: 'MED',  campaign: 'MedFear',         text: 'Audio deepfake detected — 89% confidence rating' },
  { sev: 'MED',  campaign: 'MedFear',         text: 'Geographic spread detected — 4 new districts in 30 min' },
  { sev: 'LOW',  campaign: 'ReviewStorm',     text: 'Sentiment manipulation spike — competing products targeted' },
  { sev: 'HIGH', campaign: 'MedFear',         text: 'State actor fingerprint matched — 91% pattern similarity' },
  { sev: 'LOW',  campaign: 'ReviewStorm',     text: 'Bot cluster dormancy broken — 78 accounts reactivated' },
]

export function signalTag(text: string): string {
  if (/deepfake/i.test(text))                     return 'DEEPFAKE'
  if (/state[- ]/i.test(text))                    return 'ATTRIBUTION'
  if (/sentiment|manipulation/i.test(text))       return 'MANIPULATION'
  if (/geographic/i.test(text))                   return 'SPREAD'
  if (/velocity|spike/i.test(text))               return 'VELOCITY'
  if (/cluster/i.test(text))                      return 'CLUSTER'
  if (/coordinated|synchron|amplification/i.test(text)) return 'COORDINATION'
  return 'SIGNAL'
}

// ─── Formatters ───────────────────────────────────────────────────────────────

/** UTC wall-clock, e.g. 19:42:13 — analysts read UTC. */
export function fmtClock(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19)
}

export function fmtShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function fmtAgo(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 45)      return 'just now'
  if (s < 3600)    return `${Math.max(1, Math.round(s / 60))}m ago`
  if (s < 86400)   return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

export function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K`
  return String(Math.round(n))
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}
