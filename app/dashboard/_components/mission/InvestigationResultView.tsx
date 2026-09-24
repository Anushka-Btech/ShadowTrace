'use client'

import Link from 'next/link'
import { CheckIcon, KindIcon, SevChip, Track } from './ui'
import { SEV_COLOR, fmtClock } from '@/lib/mission'
import type { InputKind, IntelResult, IntelStep } from '@/lib/investigate'

export const KIND_LABEL: Record<InputKind, string> = {
  text: 'Text', url: 'URL', account: 'Account', image: 'Image', claim: 'Claim',
}

// ─── Pipeline stages ──────────────────────────────────────────────────────────

export const STAGE_NAMES = [
  'Ingesting signal',
  'Resolving entities',
  'Mapping relationships',
  'Correlating evidence',
  'AI agent analysis',
  'Generating intelligence',
] as const

export interface StageRow {
  name:   string
  state:  'done' | 'skipped'
  detail: string
  ms:     number | null
}

/**
 * Lay real results onto the six stages. Every "done" row is backed by something the
 * endpoint returned (an agent step, a count or a match); anything that did not run
 * for this input type is shown as skipped rather than dressed up.
 */
export function stageRows(r: IntelResult): StageRow[] {
  const step = (agent: string): IntelStep | undefined => r.steps.find(s => s.agent === agent)
  const done = (name: string, s: IntelStep | undefined, fallback?: string): StageRow =>
    s        ? { name, state: 'done', detail: s.summary, ms: s.ms }
    : fallback ? { name, state: 'done', detail: fallback, ms: null }
    :            { name, state: 'skipped', detail: 'Did not run for this input', ms: null }
  const skipped = (name: string): StageRow => ({ name, state: 'skipped', detail: 'Not applicable to this input', ms: null })
  const [n1, n2, n3, n4, n5, n6] = STAGE_NAMES

  switch (r.kind) {
    case 'account':
      return [
        done(n1, undefined, `${r.handles?.length ?? 0} handles submitted`),
        done(n2, step('LinguisticFingerprinter')),
        done(n3, step('TemporalCoordinator')),
        skipped(n4),
        done(n5, step('AIOperationDetector')),
        done(n6, undefined, 'Coordination verdict issued'),
      ]
    case 'image':
      return [
        done(n1, undefined, 'Image downloaded'),
        done(n2, undefined, 'Metadata inspected'),
        skipped(n3),
        done(n4, step('DeepfakeDetector')),
        done(n5, undefined, r.evidence.some(e => e.items.some(i => /AI-generation model/i.test(i))) ? 'AI-generation model scored the image' : undefined),
        done(n6, undefined, 'Manipulation verdict issued'),
      ]
    default: {
      const noPipeline = r.steps.length === 0
      return [
        done(n1, step('WhatsAppAnalyzer'), 'Text received'),
        done(n2, step('SarvamLanguageDetector')),
        r.campaign
          ? { name: n3, state: 'done', detail: `Related to the ${r.campaign} network`, ms: null }
          : { name: n3, state: 'done', detail: 'No tracked network matched', ms: null },
        done(n4, step('FactCheckCrossRef')),
        done(n5, step('ContentAnalyzer'), noPipeline ? 'Single-model analysis' : undefined),
        done(n6, step('ThreatClassifier')),
      ]
    }
  }
}

export function StageList({ rows }: { rows: StageRow[] }) {
  return (
    <ol className="mc-stages">
      {rows.map((s, i) => (
        <li key={s.name} className={`mc-stage ${s.state}`} style={{ ['--d' as string]: `${i * 60}ms` }}>
          <span className="mc-stage-mark" aria-hidden="true">{s.state === 'done' ? <CheckIcon /> : <i />}</span>
          <div>
            <div className="mc-stage-name">{s.name}</div>
            <div className="mc-stage-detail">{s.detail}</div>
          </div>
          <span className="mc-stage-ms">{s.ms != null ? `${s.ms} ms` : ''}</span>
        </li>
      ))}
    </ol>
  )
}

// ─── Result ───────────────────────────────────────────────────────────────────

export default function InvestigationResultView({
  result: r, onReset, onViewNetwork, onOpenAccounts,
}: {
  result:         IntelResult
  onReset:        () => void
  onViewNetwork:  (campaignName: string) => void
  onOpenAccounts: (handles: string[]) => void
}) {
  const fact = r.matches.length > 0
  const hasFactStep = r.steps.some(s => s.agent === 'FactCheckCrossRef')
  const factStep = r.steps.find(s => s.agent === 'FactCheckCrossRef')

  return (
    <div className="mc-result" aria-live="polite">
      <div className="mc-result-top">
        <div className="mc-result-title">
          <small>{KIND_LABEL[r.kind]} investigation · {fmtClock(r.at)} UTC</small>
          {r.title}
        </div>
        <button type="button" className="mc-run ghost" onClick={onReset}>New investigation</button>
      </div>

      {r.sample && (
        <div className="mc-banner" role="alert"><b>Sample output.</b> {r.notes[0]}</div>
      )}
      {!r.sample && r.notes.map(n => <div className="mc-banner" key={n}>{n}</div>)}

      <div className="mc-verdict">
        <div className="mc-score">
          <div>{r.inconclusive ? <span className="mc-chip">Not enough data</span> : <SevChip sev={r.sev} />}</div>
          <div className="mc-score-num" style={{ color: r.score != null ? SEV_COLOR[r.sev] : 'var(--t2)' }}>
            {r.score != null ? <>{r.score}<small>/100</small></> : '—'}
          </div>
          <div className="mc-score-label">{r.scoreLabel}</div>
        </div>
        <div>
          <p className="mc-verdict-text">{r.verdict}</p>
          <div className="mc-verdict-meta">
            {r.confidence != null && <span>Confidence <b>{r.confidence}%</b></span>}
            {r.facts.slice(0, 3).map(f => <span key={f.label}>{f.label} <b>{f.value}</b></span>)}
          </div>
        </div>
      </div>

      {r.campaign && (
        <div className="mc-related">
          <div>
            <b>{r.campaign}</b>
            <span>A tracked network pushing the same narrative. See the accounts behind it.</span>
          </div>
          <button type="button" className="mc-link" onClick={() => onViewNetwork(r.campaign!)}>View network →</button>
        </div>
      )}

      <div className="mc-cols">
        {r.evidence.map(block => (
          <div className={`mc-block${block.heading === 'Extracted claim' ? ' wide' : ''}`} key={block.heading}>
            <h3>{block.heading}</h3>
            <ul className="mc-list">{block.items.map(it => <li key={it}>{it}</li>)}</ul>
          </div>
        ))}

        {hasFactStep && (
          <div className="mc-block">
            <h3>Fact-check cross-reference</h3>
            {fact ? (
              <ul className="mc-list">
                {r.matches.map(m => (
                  <li key={m.url || m.title}>
                    {m.url ? <a href={m.url} target="_blank" rel="noopener noreferrer">{m.title}</a> : m.title}
                    <span className="src">{m.source}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mc-hint">{factStep?.summary ?? 'No matching debunked claims.'}</p>
            )}
          </div>
        )}

        {r.signals.length > 0 && (
          <div className="mc-block">
            <h3>Signals</h3>
            <div className="mc-bars">
              {r.signals.map((s, i) => (
                <div className="mc-bar-row" key={s.label}>
                  <span>{s.label}</span><b>{s.value}</b>
                  <Track value={s.value} sev={s.value >= 70 ? 'HIGH' : s.value >= 40 ? 'MEDIUM' : 'LOW'} delay={i * 80} />
                </div>
              ))}
            </div>
          </div>
        )}

        {(r.facts.length > 3 || r.elaImage || r.kind === 'account' || r.kind === 'image') && (
          <div className="mc-block">
            {r.facts.length > 3 && (
              <dl className="mc-facts" style={{ marginTop: 0 }}>
                {r.facts.slice(3).map(f => (<div key={f.label} style={{ display: 'contents' }}><dt>{f.label}</dt><dd>{f.value}</dd></div>))}
              </dl>
            )}
            {r.elaImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="mc-ela" src={`data:image/png;base64,${r.elaImage}`} alt="Error-level analysis map: brighter areas compressed differently from their surroundings" />
            )}
            {r.kind === 'account' && r.handles && (
              <p style={{ marginTop: r.facts.length > 3 ? 16 : 0 }}>
                <button type="button" className="mc-link" onClick={() => onOpenAccounts(r.handles!)}>Open full account analysis →</button>
              </p>
            )}
            {r.kind === 'image' && (
              <p style={{ marginTop: r.elaImage ? 14 : 0 }}>
                <Link href="/dashboard/image-forensics" className="mc-link">Open image forensics →</Link>
              </p>
            )}
          </div>
        )}

        {r.evidence.length === 0 && !hasFactStep && r.signals.length === 0 && (
          <p className="mc-hint wide">No individual signals were reported for this input.</p>
        )}
      </div>

      <details className="mc-trace" open>
        <summary><KindIcon kind={r.kind} /> How ShadowTrace got here</summary>
        <StageList rows={stageRows(r)} />
      </details>
    </div>
  )
}
