/**
 * Client-side investigation runner.
 *
 * Every input type is routed to an endpoint that already exists:
 *
 *   text, claim → /api/analyze  +  /api/investigate   (run in parallel)
 *   url         → /api/resolve-url (page → text), then the text pipeline
 *                 (image links are sent to the image route instead)
 *   account     → /api/account-intel   (Bluesky handles, ≥ 2)
 *   image       → /api/deepfake        (image URL)
 *
 * Nothing here scores anything itself. Results are normalised into one shape
 * (`IntelResult`) so a single view can render all of them. If an endpoint had
 * to fall back to canned output the result is flagged `sample: true`.
 */

import type { AnalysisResult } from '@/types'
import type { AccountIntelResult } from '@/app/api/account-intel/route'
import type { DeepfakeResult } from '@/app/api/deepfake/route'
import { matchCampaignName, sevFromLevel, type Sev } from '@/lib/mission'

// ─── Types ────────────────────────────────────────────────────────────────────

export type InputKind = 'text' | 'url' | 'account' | 'image' | 'claim'

export interface IntelStep {
  agent:   string
  ms:      number | null   // null when the endpoint does not report timings
  summary: string
}

export interface IntelResult {
  kind:       InputKind
  title:      string
  sev:        Sev
  score:      number | null
  scoreLabel: string
  confidence: number | null            // 0-100
  verdict:    string
  facts:      { label: string; value: string }[]
  signals:    { label: string; value: number }[]      // 0-100 bars
  evidence:   { heading: string; items: string[] }[]
  matches:    { title: string; source: string; url: string }[]
  campaign:   string | null
  steps:      IntelStep[]
  notes:      string[]                 // limitations the analyst should know about
  sample:     boolean                  // true = canned stand-in, NOT a real analysis
  inconclusive?: boolean               // true = ran, but there was not enough data to conclude
  handles?:   string[]
  elaImage?:  string                   // base64 PNG, in-memory only
  at:         number
}

export interface InvestigationRecord {
  id:     string
  kind:   InputKind
  input:  string
  at:     number
  result: Omit<IntelResult, 'elaImage'>
}

export class InvestigationError extends Error {}

// ─── Input helpers ────────────────────────────────────────────────────────────

export const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif)(\?.*)?$/i

export function parseHandles(raw: string): string[] {
  const seen = new Set<string>()
  for (const tok of raw.split(/[\s,;]+/)) {
    const h = tok.trim().replace(/^@+/, '')
    if (h) seen.add(`@${h}`)
  }
  return [...seen]
}

export function looksLikeUrl(s: string): boolean {
  return /^https?:\/\/\S+$/i.test(s.trim())
}

export function looksLikeHandles(s: string): boolean {
  const toks = s.trim().split(/[\s,;]+/).filter(Boolean)
  return toks.length >= 2 && toks.every(t => /^@[\w.-]+$/.test(t))
}

// ─── Transport ────────────────────────────────────────────────────────────────

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const data = await res.json()
      const m = data?.error?.message ?? (typeof data?.error === 'string' ? data.error : null)
      if (m) message = m
    } catch { /* keep default */ }
    throw new InvestigationError(message)
  }
  return (await res.json()) as T
}

// ─── Text / claim / URL pipeline ──────────────────────────────────────────────

interface InvestigatePayload {
  steps: { agent: string; duration_ms: number; summary: string }[]
  misinformation_score: number
  risk_level: 'HIGH' | 'MED' | 'LOW'
  language: string
  claim_extracted: string
  red_flags: string[]
  fact_check_matches: { title: string; source: string; url: string; matched_terms: string[] }[]
  threat_alert: { threat_type: string; severity: string; explanation: string }
}

function sevFromClassifier(severity: string | undefined, fallback: string): Sev {
  switch ((severity ?? '').toLowerCase()) {
    case 'critical': return 'CRITICAL'
    case 'high':     return 'HIGH'
    case 'medium':   return 'MEDIUM'
    case 'low':      return 'LOW'
    default:         return sevFromLevel(fallback)
  }
}

function excerpt(s: string, n = 96): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t
}

async function runTextPipeline(
  text: string,
  kind: InputKind,
  signal: AbortSignal | undefined,
  ctx: { title?: string; facts?: { label: string; value: string }[]; notes?: string[] } = {},
): Promise<IntelResult> {
  const canInvestigate = text.trim().length >= 10
  const [analysisRes, investRes] = await Promise.allSettled([
    postJson<AnalysisResult>('/api/analyze', { content: text }, signal),
    canInvestigate
      ? postJson<InvestigatePayload>('/api/investigate', { text }, signal)
      : Promise.reject(new InvestigationError('too short')),
  ])
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const analysis = analysisRes.status === 'fulfilled' ? analysisRes.value : null
  const inv      = investRes.status === 'fulfilled' ? investRes.value : null
  const notes    = [...(ctx.notes ?? [])]
  const realAnalysis = analysis && analysis.source !== 'mock' ? analysis : null

  if (!inv && !realAnalysis) {
    if (analysis?.source === 'mock') {
      // Preserve the old fallback but never pass it off as an analysis of this input.
      return {
        kind, at: Date.now(), sample: true,
        title:      ctx.title ?? excerpt(text),
        sev:        sevFromLevel(analysis.threat_level),
        score:      null,
        scoreLabel: 'Misinformation score',
        confidence: Math.round(analysis.confidence * 100),
        verdict:    analysis.summary,
        facts:      [],
        signals:    [],
        evidence:   analysis.indicators?.length ? [{ heading: 'Sample indicators', items: analysis.indicators }] : [],
        matches:    [], campaign: null, steps: [],
        notes:      ['The analysis backend is unreachable and no language-model key is configured. This is sample output, not an analysis of your input.'],
      }
    }
    throw new InvestigationError('The analysis service is unreachable. Check that the backend is running and try again.')
  }

  if (inv) {
    const category = realAnalysis?.narrative_category
    const sev = sevFromClassifier(inv.threat_alert?.severity, inv.risk_level)
    const facts = [...(ctx.facts ?? [])]
    if (inv.threat_alert?.threat_type) facts.push({ label: 'Classified as', value: inv.threat_alert.threat_type })
    if (inv.language && inv.language !== 'unknown') facts.push({ label: 'Language', value: inv.language })
    if (category) facts.push({ label: 'Narrative', value: category })

    const evidence: IntelResult['evidence'] = []
    if (inv.claim_extracted) evidence.push({ heading: 'Extracted claim', items: [inv.claim_extracted] })
    if (inv.red_flags?.length) evidence.push({ heading: 'Red flags', items: inv.red_flags })
    if (realAnalysis?.indicators?.length) evidence.push({ heading: 'Model signals', items: realAnalysis.indicators })

    if (!realAnalysis) notes.push('The single-model check was unavailable; confidence is not reported.')

    // Only suggest a tracked network when the content is actually a concern.
    const campaign = sev === 'LOW' ? null : (matchCampaignName(category) ?? matchCampaignName(inv.claim_extracted))

    return {
      kind, at: Date.now(), sample: false,
      title:      ctx.title ?? excerpt(inv.claim_extracted || text),
      sev,
      score:      inv.misinformation_score,
      scoreLabel: 'Misinformation score',
      confidence: realAnalysis ? Math.round(realAnalysis.confidence * 100) : null,
      verdict:    inv.threat_alert?.explanation ?? realAnalysis?.summary ?? '',
      facts, signals: [], evidence,
      matches:    (inv.fact_check_matches ?? []).map(m => ({ title: m.title, source: m.source, url: m.url })),
      campaign,
      steps:      (inv.steps ?? []).map(s => ({ agent: s.agent, ms: s.duration_ms, summary: s.summary })),
      notes,
    }
  }

  // Investigation pipeline unavailable — single-model analysis only.
  const a = realAnalysis!
  const scoreFromSummary = a.summary.match(/score:\s*(\d+)\s*\/\s*100/i)
  notes.push(
    canInvestigate
      ? 'The multi-agent pipeline was unreachable, so fact-check cross-referencing and threat classification did not run.'
      : 'Text is too short for the multi-agent pipeline (10+ characters needed); showing the single-model check only.',
  )
  const sev = sevFromLevel(a.threat_level)
  return {
    kind, at: Date.now(), sample: false,
    title:      ctx.title ?? excerpt(text),
    sev,
    score:      scoreFromSummary ? Number(scoreFromSummary[1]) : null,
    scoreLabel: 'Misinformation score',
    confidence: Math.round(a.confidence * 100),
    verdict:    a.summary,
    facts:      [...(ctx.facts ?? []), ...(a.narrative_category ? [{ label: 'Narrative', value: a.narrative_category }] : [])],
    signals:    [],
    evidence:   a.indicators?.length ? [{ heading: 'Model signals', items: a.indicators }] : [],
    matches:    [],
    campaign:   sev === 'LOW' ? null : matchCampaignName(a.narrative_category),
    steps:      [],
    notes,
  }
}

// ─── URL ──────────────────────────────────────────────────────────────────────

interface ResolvedPage { url: string; host: string; title: string; text: string; chars: number; truncated: boolean }

async function runUrl(url: string, signal?: AbortSignal): Promise<IntelResult> {
  if (IMAGE_EXT.test(url)) return runImage(url, signal)

  const page = await postJson<ResolvedPage>('/api/resolve-url', { url }, signal)
  const combined = page.title ? `${page.title}\n\n${page.text}` : page.text
  const notes = page.truncated ? [`Only the first ${page.text.length.toLocaleString()} characters of the page were analysed.`] : []
  return runTextPipeline(combined, 'url', signal, {
    title: page.title || page.host,
    facts: [{ label: 'Source', value: page.host }],
    notes,
  })
}

// ─── Account ──────────────────────────────────────────────────────────────────

const AI_LABEL: Record<string, string> = {
  LIKELY_AI: 'likely AI-operated', POSSIBLY_AI: 'possibly AI-operated', LIKELY_HUMAN: 'likely human',
}

async function runAccounts(raw: string, signal?: AbortSignal): Promise<IntelResult> {
  const handles = parseHandles(raw)
  if (handles.length < 2) {
    throw new InvestigationError('Add at least two handles — coordination is measured between accounts.')
  }
  if (handles.length > 10) throw new InvestigationError('Account analysis supports up to 10 handles at a time.')

  const d = await postJson<AccountIntelResult>('/api/account-intel', { handles }, signal)
  const sample = d.source === 'mock'

  // Which accounts did ShadowTrace actually see posts for? The backend runs its agents even
  // when nothing could be fetched, and an empty input scores as "no coordination" — so a
  // low score is only meaningful for accounts that had data.
  const norm = (h: string) => h.replace(/^@+/, '').toLowerCase()
  const postCount = new Map(d.temporal.timeline.map(t => [norm(t.account), t.posts.length]))
  const noData = handles.filter(h => {
    const src = d.data_sources?.[h] ?? d.data_sources?.[norm(h)]
    return src === 'none' || (src === undefined && (postCount.get(norm(h)) ?? 0) === 0)
  })
  const withData = handles.length - noData.length

  const base = {
    kind: 'account' as const, at: Date.now(), sample, handles,
    title: handles.length <= 3 ? handles.join(', ') : `${handles.slice(0, 2).join(', ')} +${handles.length - 2} more`,
    scoreLabel: 'Coordination score',
    matches: [], campaign: null, evidence: [] as IntelResult['evidence'],
  }

  if (!sample && withData < 2) {
    return {
      ...base, sev: 'LOW', score: null, confidence: null, inconclusive: true,
      verdict: noData.length === handles.length
        ? 'ShadowTrace could not retrieve any posts for these accounts, so it cannot say whether they coordinate. Check the handles are spelled correctly and are public.'
        : `Posts could only be retrieved for ${withData} of ${handles.length} accounts. Coordination needs at least two accounts with posts.`,
      facts: [{ label: 'Accounts submitted', value: String(handles.length) }, { label: 'With posts', value: String(withData) }],
      signals: [],
      steps: [], notes: noData.length ? [`No posts found for ${noData.join(', ')}.`] : [],
    }
  }

  const overall = Math.round((d.temporal.score + d.linguistic.score + d.ai_operation.score) / 3)
  const interesting = d.ai_operation.accounts
    .filter(a => a.verdict !== 'LIKELY_HUMAN')
    .sort((a, b) => b.ai_score - a.ai_score)
    .slice(0, 4)
    .map(a => `${a.handle} — ${AI_LABEL[a.verdict] ?? a.verdict} (${a.ai_score})`)

  const facts: IntelResult['facts'] = [
    { label: 'Accounts analysed', value: String(withData) },
    { label: 'Flagged pairs',     value: String(d.temporal.flagged_pairs) },
    { label: 'Style clusters',    value: String(d.linguistic.clusters) },
  ]
  if (d.temporal.median_delay_seconds > 0) {
    facts.push({ label: 'Median post delay', value: `${d.temporal.median_delay_seconds.toFixed(1)}s` })
  }

  return {
    ...base,
    sev:        sevFromLevel(d.verdict),
    score:      overall,
    confidence: Math.round(d.confidence * 100),
    verdict:    d.summary,
    facts,
    signals: [
      { label: 'Posting-time coordination', value: Math.round(d.temporal.score) },
      { label: 'Writing-style similarity',  value: Math.round(d.linguistic.score) },
      { label: 'AI-operation signature',    value: Math.round(d.ai_operation.score) },
    ],
    evidence: interesting.length ? [{ heading: 'Accounts of interest', items: interesting }] : [],
    steps: [
      { agent: 'TemporalCoordinator',     ms: null, summary: `${d.temporal.flagged_pairs} flagged account pairs` },
      { agent: 'LinguisticFingerprinter', ms: null, summary: `${d.linguistic.clusters} writing-style clusters` },
      { agent: 'AIOperationDetector',     ms: null, summary: `AI-operation score ${Math.round(d.ai_operation.score)}` },
    ],
    notes: sample
      ? ['The analysis backend is unreachable. This is sample output, not an analysis of these accounts.']
      : noData.length ? [`No posts found for ${noData.join(', ')}; they did not contribute to the score.`] : [],
  }
}

// ─── Image ────────────────────────────────────────────────────────────────────

async function runImage(url: string, signal?: AbortSignal): Promise<IntelResult> {
  if (!/^https?:\/\//i.test(url)) throw new InvestigationError('Enter the full image address, starting with http or https.')
  const d = await postJson<DeepfakeResult>('/api/deepfake', { image_url: url }, signal)
  if (d.status === 'failed') {
    // The backend's raw error text is an internal exception string; give the analyst something to act on.
    throw new InvestigationError('The image could not be downloaded or read. Check that the address points straight to a public image file.')
  }

  const sample = d.source === 'mock'
  const sev: Sev = d.verdict === 'LIKELY_MANIPULATED' ? 'HIGH' : d.verdict === 'POSSIBLY_MANIPULATED' ? 'MEDIUM' : 'LOW'
  let host = url
  try { host = new URL(url).hostname.replace(/^www\./, '') } catch { /* keep raw */ }

  return {
    kind: 'image', at: Date.now(), sample,
    title:      `Image from ${host}`,
    sev,
    score:      d.manipulation_score,
    scoreLabel: 'Manipulation score',
    confidence: Math.round(d.confidence * 100),
    verdict:    d.analysis_summary,
    facts:      [{ label: 'Verdict', value: d.verdict.replace(/_/g, ' ').toLowerCase() }],
    signals:    [],
    evidence:   d.signals.length ? [{ heading: 'Forensic signals', items: d.signals }] : [],
    matches: [], campaign: null,
    steps: [
      { agent: 'DeepfakeDetector', ms: null, summary: 'Error-level analysis and metadata inspection' },
    ],
    notes:    sample ? ['The forensics backend is unreachable. This is sample output, not an analysis of your image.'] : [],
    elaImage: d.ela_image_base64 || undefined,
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function runInvestigation(
  kind: InputKind,
  input: string,
  signal?: AbortSignal,
): Promise<IntelResult> {
  const value = input.trim()
  if (!value) throw new InvestigationError('Enter something to investigate.')

  switch (kind) {
    case 'text':
    case 'claim':   return runTextPipeline(value, kind, signal)
    case 'url':     return runUrl(value, signal)
    case 'account': return runAccounts(value, signal)
    case 'image':   return runImage(value, signal)
  }
}

// ─── Persistence (per browser) ────────────────────────────────────────────────

const STORE_KEY = 'st-investigations-v1'
const STORE_MAX = 12

export function loadRecords(): InvestigationRecord[] {
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    const parsed = raw ? (JSON.parse(raw) as InvestigationRecord[]) : []
    return Array.isArray(parsed) ? parsed.slice(0, STORE_MAX) : []
  } catch {
    return []
  }
}

export function saveRecords(records: InvestigationRecord[]): void {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(records.slice(0, STORE_MAX)))
  } catch { /* storage full or unavailable — the list still works this session */ }
}

export function toRecord(kind: InputKind, input: string, result: IntelResult): InvestigationRecord {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { elaImage, ...persistable } = result
  return {
    id:    `inv-${result.at}-${Math.random().toString(36).slice(2, 7)}`,
    kind, input, at: result.at, result: persistable,
  }
}
