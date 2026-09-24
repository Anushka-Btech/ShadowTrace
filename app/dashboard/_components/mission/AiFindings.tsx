'use client'

import { useEffect, useRef, useState } from 'react'
import { useMission } from './MissionProvider'
import { SevChip, Skel } from './ui'
import { fmtInt, sevFromLevel, type CampaignIntel, type Sev } from '@/lib/mission'

interface Assessment {
  threatType:     string
  explanation:    string
  sev:            Sev
  recommendation: string
}

const THREAT_TYPES = [
  'Organic Misinformation',
  'Coordinated Inauthentic Behavior',
  'Possible State-Level Operation',
]

type State =
  | { status: 'loading' }
  | { status: 'ok'; data: Assessment }
  | { status: 'unavailable' }

/** Findings that come straight from the mapped graph — no model involved. */
function graphFindings(i: CampaignIntel): { key: string; node: React.ReactNode }[] {
  const out: { key: string; node: React.ReactNode }[] = []
  const pct = Math.round(i.concentration * 100)

  if (i.edges > 0 && i.hubs[0]) {
    out.push({
      key: 'hubs',
      node: <><b>{pct}% of links</b> run through just {i.hubs.length} accounts. <span className="mc-mono" style={{ fontSize: 12.5 }}>{i.hubs[0].accountId}</span> alone has {i.hubs[0].degree} connections.</>,
    })
  }
  if (i.counts.bot > 0 && i.mapped > 0) {
    const share = Math.round((i.counts.bot / i.mapped) * 100)
    out.push({ key: 'bots', node: <><b>{i.counts.bot} of {fmtInt(i.mapped)}</b> mapped accounts ({share}%) behave like bots.</> })
  }
  out.push({
    key: 'origin',
    node: i.hasOrigin
      ? <>A command node sits at the centre and the network reaches <b>{i.depth} hops</b> out from it.</>
      : <>No verified origin among the mapped accounts; the network reaches <b>{i.depth} hops</b> from its busiest account.</>,
  })
  if (i.strongest) {
    out.push({
      key: 'link',
      node: <>The strongest relationship ({Math.round(i.strongest.weight * 100)}%) links <span className="mc-mono" style={{ fontSize: 12.5 }}>{i.strongest.from.accountId ?? i.strongest.from.label}</span> and <span className="mc-mono" style={{ fontSize: 12.5 }}>{i.strongest.to.accountId ?? i.strongest.to.label}</span>.</>,
    })
  }
  return out
}

export default function AiFindings() {
  const { selected, campaigns } = useMission()
  const [state, setState] = useState<State>({ status: 'loading' })
  const cache = useRef(new Map<string, Assessment | null>())

  const id = selected?.campaign.id

  // The ThreatClassifier's read on the selected campaign (cached per campaign this session)
  useEffect(() => {
    if (!id) return
    if (cache.current.has(id)) {
      const hit = cache.current.get(id)
      setState(hit ? { status: 'ok', data: hit } : { status: 'unavailable' })
      return
    }
    setState({ status: 'loading' })
    const ctl = new AbortController()
    fetch('/api/alert', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: id }), signal: ctl.signal,
    })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((a: { severity: string; message: string; recommendation: string }) => {
        // Only accept a genuine classifier answer ("<threat type> — <explanation>").
        // The route's canned fallbacks do not have that shape and are ignored.
        const [head, ...rest] = String(a.message ?? '').split(' — ')
        const parsed: Assessment | null = THREAT_TYPES.includes(head) && rest.length
          ? { threatType: head, explanation: rest.join(' — '), sev: sevFromLevel(a.severity), recommendation: a.recommendation }
          : null
        cache.current.set(id, parsed)
        setState(parsed ? { status: 'ok', data: parsed } : { status: 'unavailable' })
      })
      .catch(err => { if (err?.name !== 'AbortError') setState({ status: 'unavailable' }) })
    return () => ctl.abort()
  }, [id])

  const i = selected?.intel
  const findings = i ? graphFindings(i) : []

  return (
    <section aria-labelledby="mc-find-h">
      <div className="mc-h">
        <h2 id="mc-find-h">AI findings</h2>
        <span className="mc-h-sub">{i ? i.name : campaigns === null ? 'Loading…' : ''}</span>
      </div>

      <div className="mc-findings">
        {campaigns === null || !i ? (
          <>
            <Skel w="60%" h={20} /><Skel w="100%" h={14} /><Skel w="90%" h={14} />
          </>
        ) : (
          <>
            {state.status === 'loading' && (
              <div><Skel w="55%" h={20} /><Skel w="100%" h={14} style={{ marginTop: 12 }} /><Skel w="80%" h={14} style={{ marginTop: 8 }} /></div>
            )}
            {state.status === 'ok' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div className="mc-find-class">{state.data.threatType}</div>
                  <SevChip sev={state.data.sev} />
                </div>
                <p className="mc-find-text">{state.data.explanation}</p>
              </div>
            )}
            {state.status === 'unavailable' && (
              <p className="mc-find-text" style={{ marginTop: 0 }}>
                The threat classifier is unreachable, so there is no model assessment for this campaign right now. The findings below come directly from the mapped network.
              </p>
            )}

            <ul className="mc-find-list">
              {findings.map(f => <li key={f.key}><span>{f.node}</span></li>)}
            </ul>

            {state.status === 'ok' && (
              <p className="mc-hint" style={{ margin: 0 }}>
                Suggested action: {state.data.recommendation}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  )
}
