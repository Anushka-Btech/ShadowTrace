'use client'

import { useMission } from './MissionProvider'
import { KIND_LABEL } from './InvestigationResultView'
import { SevChip, Skel } from './ui'
import { fmtAgo, fmtShortDate, type Sev } from '@/lib/mission'

interface Row {
  key:        string
  title:      string
  sub:        string
  sev:        Sev
  confidence: number | null
  activity:   string
  onView:     () => void
  onRemove?:  () => void
}

export default function ActiveInvestigations() {
  const { investigations, intel, campaigns, events, now, select, viewRecord, removeInvestigation } = useMission()

  const yours: Row[] = investigations.slice(0, 5).map(r => ({
    key:        r.id,
    title:      r.result.title,
    sub:        `${KIND_LABEL[r.kind]} investigation`,
    sev:        r.result.sev,
    confidence: r.result.confidence,
    activity:   now ? fmtAgo(r.at, now) : '—',
    onView:     () => viewRecord(r),
    onRemove:   () => removeInvestigation(r.id),
  }))

  const cases: Row[] = [...intel]
    .sort((a, b) => b.score - a.score)
    .map(i => {
      const last = events.find(e => e.campaign === i.name)
      return {
        key:        i.id,
        title:      i.topic,
        sub:        `Tracked campaign · ${i.name}`,
        sev:        i.sev,
        confidence: i.confidence,
        activity:   last && now ? fmtAgo(last.at, now) : i.startedAt ? `Since ${fmtShortDate(i.startedAt)}` : '—',
        onView:     () => select(i.id, { scroll: true }),
      }
    })

  const rows = [...yours, ...cases]

  return (
    <section aria-labelledby="mc-inv-h">
      <div className="mc-h">
        <h2 id="mc-inv-h">Active investigations</h2>
        <span className="mc-h-sub">
          {investigations.length ? `${investigations.length} of yours · ` : ''}{intel.length} tracked {intel.length === 1 ? 'campaign' : 'campaigns'}
        </span>
      </div>

      <div className="mc-itbl" role="group" aria-label="Investigations">
        <div className="mc-thead" aria-hidden="true">
          <span>Investigation</span>
          <span>Threat</span>
          <span className="r hide-sm">Confidence</span>
          <span className="r hide-sm">Activity</span>
          <span />
        </div>

        {campaigns === null && [0, 1].map(k => (
          <div className="mc-trow mc-irow" key={k} aria-hidden="true"><Skel w="70%" h={16} /><Skel w={54} h={20} /></div>
        ))}

        {rows.map(r => (
          <div className="mc-trow mc-irow" key={r.key}>
            <span className="mc-cell">
              <span className="mc-name" style={{ display: 'block', fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
              <span className="mc-sub" style={{ display: 'block' }}>{r.sub}</span>
            </span>
            <span className="mc-cell"><SevChip sev={r.sev} /></span>
            <span className="mc-cell r mc-num hide-sm">{r.confidence != null ? <>{r.confidence}<small>%</small></> : '—'}</span>
            <span className="mc-cell r mc-ago hide-sm">{r.activity}</span>
            <span className="mc-cell act">
              <button type="button" className="mc-link" onClick={r.onView} aria-label={`View ${r.title}`}>View →</button>
              {r.onRemove && (
                <button type="button" className="mc-x" onClick={r.onRemove} aria-label={`Remove ${r.title}`} title="Remove from this list">✕</button>
              )}
            </span>
          </div>
        ))}

        {campaigns !== null && rows.length === 0 && (
          <div className="mc-empty">Nothing under investigation yet. Start one above and it will appear here.</div>
        )}
      </div>
    </section>
  )
}
