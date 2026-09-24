'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMission } from './MissionProvider'
import InvestigationResultView, { KIND_LABEL, STAGE_NAMES } from './InvestigationResultView'
import { KindIcon } from './ui'
import {
  IMAGE_EXT, InvestigationError, looksLikeHandles, looksLikeUrl, parseHandles,
  runInvestigation, toRecord, type InputKind, type IntelResult,
} from '@/lib/investigate'

// ─── Copy ─────────────────────────────────────────────────────────────────────

const KINDS: InputKind[] = ['text', 'url', 'account', 'image', 'claim']

const PLACEHOLDER: Record<InputKind, string> = {
  text:    'Paste a WhatsApp forward, social post or article excerpt…',
  url:     'https://…  Paste a link to an article or post',
  account: '@handle1  @handle2  @handle3',
  image:   'https://…/photo.jpg  Paste a link to the image',
  claim:   'State the claim you want checked, in a sentence',
}

const HELP: Record<InputKind, string> = {
  text:    'ShadowTrace extracts the claim, scores the wording and checks it against debunked stories.',
  url:     'ShadowTrace reads the page, then analyses its text. Links to images are analysed as images.',
  account: 'Bluesky handles, two or more. Coordination is measured between accounts, not within one.',
  image:   'ShadowTrace runs error-level analysis and metadata checks on the image at that address.',
  claim:   'A single statement, checked against live fact-checker feeds and scored for misinformation risk.',
}

const ROWS: Record<InputKind, number> = { text: 5, url: 2, account: 3, image: 2, claim: 3 }

const EXAMPLES: Partial<Record<InputKind, { label: string; text: string }[]>> = {
  text: [
    { label: 'Election claim', text: 'BREAKING: Election Commission official confirms voting dates secretly changed in 4 Maharashtra districts. EVM machines in 847 polling booths pre-programmed with results. Statement suppressed by media. RT before deleted.' },
    { label: 'Vaccine claim', text: 'URGENT: WHO internal data (hidden from public) shows 1 in 50 recipients develop autoimmune syndrome from COVID boosters. German lab confirms mRNA fragments in breast milk 6+ months post-dose. Health ministry covering up 12,000 adverse event reports.' },
    { label: 'Fake review', text: 'WOW Amazing product!!! Bought TechPro X200 and it is BEST in world!! All family buy now. Very fast ship 5 stars. My neighbour also buy and love it. Price very good quality very good. 100% recommend everyone buy now!!' },
    { label: 'WhatsApp forward', text: 'FWD: Doctors confirm nimbu paani cures cancer. Government hiding this. Share karo!' },
  ],
  claim: [
    { label: 'EVM tampering', text: 'EVM machines in 847 polling booths were pre-programmed with election results.' },
    { label: 'Lemon water', text: 'Doctors confirm that lemon water cures cancer and the government is hiding it.' },
  ],
  account: [
    { label: 'Election accounts',   text: '@TruthVoter2024 @ElectionWatchIN @PatriotPulse_ @VoteFactsNow @DemAlertDaily' },
    { label: 'Health accounts',     text: '@NaturalCureMom @WellnessTruther @VaxFactsExposed @HolisticHealer7' },
    { label: 'Review accounts',     text: '@DealHunter_Raj @BestBuysToday @HonestReviews99 @ShopSmartNow_' },
  ],
}

// ─── Validation ───────────────────────────────────────────────────────────────

function normalizeUrl(v: string): string {
  const t = v.trim()
  if (/^https?:\/\//i.test(t)) return t
  return /^[\w-]+(\.[\w-]+)+([/?#]\S*)?$/.test(t) ? `https://${t}` : t
}

function validate(kind: InputKind, value: string): { ok: boolean; hint?: string } {
  const v = value.trim()
  if (!v) return { ok: false }
  switch (kind) {
    case 'text':
    case 'claim':
      return v.length >= 10 ? { ok: true } : { ok: false, hint: 'Add a little more (10+ characters) so the full pipeline can run.' }
    case 'url':
    case 'image':
      return looksLikeUrl(normalizeUrl(v)) ? { ok: true } : { ok: false, hint: 'Enter a full web address, for example https://example.com/story.' }
    case 'account': {
      const n = parseHandles(v).length
      if (n > 10) return { ok: false, hint: 'Up to 10 handles at a time.' }
      return n >= 2 ? { ok: true } : { ok: false, hint: 'Add at least two handles — coordination is measured between accounts.' }
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'running' | 'done' | 'error'

export default function StartInvestigation() {
  const router = useRouter()
  const { addInvestigation, intel, select, openRecord } = useMission()

  const [kind,   setKind]   = useState<InputKind>('text')
  const [values, setValues] = useState<Record<InputKind, string>>({ text: '', url: '', account: '', image: '', claim: '' })
  const [phase,  setPhase]  = useState<Phase>('idle')
  const [result, setResult] = useState<IntelResult | null>(null)
  const [error,  setError]  = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [submitted, setSubmitted] = useState<{ kind: InputKind; value: string }>({ kind: 'text', value: '' })
  const [seenNonce, setSeenNonce] = useState(0)

  const ctl       = useRef<AbortController | null>(null)
  const rootRef   = useRef<HTMLDivElement>(null)
  const fieldRef  = useRef<HTMLTextAreaElement>(null)

  const value = values[kind]
  const check = validate(kind, value)
  const running = phase === 'running'

  const setValue = (v: string) => setValues(prev => ({ ...prev, [kind]: v }))

  // elapsed timer while a run is in flight
  useEffect(() => {
    if (!running) return
    const t0 = Date.now()
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => clearInterval(t)
  }, [running])

  useEffect(() => () => ctl.current?.abort(), [])

  // "View →" on the investigations list re-opens a stored result here.
  // State is adjusted during render (React's pattern for reacting to a changed prop)…
  if (openRecord && openRecord.nonce !== seenNonce) {
    const { record } = openRecord
    setSeenNonce(openRecord.nonce)
    setKind(record.kind)
    setValues(prev => ({ ...prev, [record.kind]: record.input }))
    setResult(record.result as IntelResult)
    setError(null)
    setPhase('done')
  }
  // …and the scroll, which touches the DOM, happens in an effect.
  useEffect(() => {
    if (!openRecord) return
    rootRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    })
  }, [openRecord])

  const run = useCallback(async () => {
    if (running) return
    const v = validate(kind, values[kind])
    if (!v.ok) return

    const input = kind === 'url' || kind === 'image' ? normalizeUrl(values[kind]) : values[kind].trim()
    setSubmitted({ kind, value: input })
    setElapsed(0)
    ctl.current?.abort()
    const c = new AbortController()
    ctl.current = c

    setPhase('running'); setError(null); setResult(null)
    try {
      const r = await runInvestigation(kind, input, c.signal)
      if (c.signal.aborted) return
      setResult(r)
      setPhase('done')
      if (!r.sample && !r.inconclusive) addInvestigation(toRecord(r.kind, input, r))
    } catch (err) {
      if (c.signal.aborted || (err as Error)?.name === 'AbortError') return
      setError(err instanceof InvestigationError ? err.message : 'Something went wrong while investigating. Try again.')
      setPhase('error')
    }
  }, [kind, values, running, addInvestigation])

  function cancel() {
    ctl.current?.abort()
    setPhase('idle')
  }

  function reset() {
    setPhase('idle'); setResult(null); setError(null)
    requestAnimationFrame(() => fieldRef.current?.focus())
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter') return
    const single = kind === 'url' || kind === 'image'
    if ((e.metaKey || e.ctrlKey) || (single && !e.shiftKey)) { e.preventDefault(); run() }
  }

  function viewNetwork(name: string) {
    const target = intel.find(i => i.name === name)
    if (target) select(target.id, { scroll: true })
  }

  function openAccounts(handles: string[]) {
    try { sessionStorage.setItem('st-handles', JSON.stringify(handles)) } catch { /* optional convenience */ }
    router.push('/dashboard/account-intel')
  }

  // gentle mismatch hints — never block, always one click to fix
  let suggest: { to: InputKind; text: string } | null = null
  if ((kind === 'text' || kind === 'claim') && looksLikeUrl(value)) suggest = { to: 'url', text: 'This looks like a link.' }
  else if ((kind === 'text' || kind === 'claim') && looksLikeHandles(value)) suggest = { to: 'account', text: 'This looks like account handles.' }
  else if (kind === 'url' && IMAGE_EXT.test(value.trim())) suggest = { to: 'image', text: 'This link points to an image.' }

  const showIntake = phase === 'idle' || phase === 'error'
  const examples = EXAMPLES[kind]
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  return (
    <section className="mc-intake" ref={rootRef} aria-labelledby="mc-intake-h">
      {showIntake && (
        <>
          <div className="mc-intake-head">
            <div>
              <h2 id="mc-intake-h" className="mc-intake-title">Start investigation</h2>
              <p className="mc-intake-q">What are you investigating?</p>
            </div>
            <div className="mc-modes" role="radiogroup" aria-label="Type of input">
              {KINDS.map(k => (
                <button
                  key={k} type="button" role="radio" aria-checked={k === kind}
                  className="mc-mode" onClick={() => { setKind(k); setError(null); setPhase('idle') }}
                >
                  <KindIcon kind={k} />{KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <textarea
              ref={fieldRef}
              className={`mc-field${kind === 'text' || kind === 'claim' ? '' : ' technical'}`}
              value={value}
              rows={ROWS[kind]}
              onChange={e => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={PLACEHOLDER[kind]}
              aria-label={`${KIND_LABEL[kind]} to investigate`}
              aria-describedby="mc-intake-help"
              aria-invalid={!!value.trim() && !check.ok && !!check.hint}
              spellCheck={kind === 'text' || kind === 'claim'}
              autoCapitalize="off"
              autoCorrect="off"
            />
            <p id="mc-intake-help" className="mc-hint" style={{ marginTop: 10 }}>
              {suggest ? (
                <>{suggest.text}{' '}<button type="button" onClick={() => { setValues(p => ({ ...p, [suggest!.to]: value })); setKind(suggest!.to) }}>Investigate it as {KIND_LABEL[suggest.to]}</button>.</>
              ) : value.trim() && check.hint ? (
                <span className="warn" style={{ color: '#F8B84A' }}>{check.hint}</span>
              ) : (
                HELP[kind]
              )}
            </p>
          </div>

          {error && <div className="mc-banner error" role="alert">{error}</div>}

          <div className="mc-intake-foot">
            <div className="mc-examples">
              {examples && (<><span>Try an example:</span>{examples.map(ex => (
                <button key={ex.label} type="button" onClick={() => { setValue(ex.text); setError(null); fieldRef.current?.focus() }}>{ex.label}</button>
              ))}</>)}
            </div>
            <button type="button" className="mc-run" onClick={run} disabled={!check.ok}>
              Run ShadowTrace analysis →
            </button>
          </div>
        </>
      )}

      {running && (
        <>
          <div className="mc-intake-head">
            <div>
              <h2 id="mc-intake-h" className="mc-intake-title">Investigating</h2>
            </div>
            <button type="button" className="mc-run ghost" onClick={cancel}>Cancel</button>
          </div>
          <div className="mc-running-bar">
            <span className="mc-dot live" aria-hidden="true" />
            <KindIcon kind={submitted.kind} />
            <span className="txt">{submitted.value}</span>
            <span className="mc-elapsed" aria-hidden="true">{mm}:{ss}</span>
          </div>
          <ol className="mc-stages" aria-live="polite" aria-label="Investigation pipeline">
            {STAGE_NAMES.map((name, idx) => (
              <li key={name} className="mc-stage" data-idx={idx}>
                <span className="mc-stage-mark" aria-hidden="true"><i /></span>
                <div><div className="mc-stage-name">{name}</div></div>
                <span />
              </li>
            ))}
          </ol>
          <p className="mc-hint">
            The agents run as one pipeline. When it finishes, you get the result along with what each agent found and how long it took.
          </p>
        </>
      )}

      {phase === 'done' && result && (
        <InvestigationResultView result={result} onReset={reset} onViewNetwork={viewNetwork} onOpenAccounts={openAccounts} />
      )}
    </section>
  )
}
