'use client'

import { useMission } from './MissionProvider'
import { fmtClock, fmtShortDate, type StreamEvent } from '@/lib/mission'

const SEV_TO_CLASS: Record<StreamEvent['sev'], string> = { HIGH: 'HIGH', MED: 'MEDIUM', LOW: 'LOW' }

export default function LiveIntelligence() {
  const { events, intel, select, now } = useMission()

  function stamp(at: number): string {
    return now && now - at > 86_400_000 ? fmtShortDate(at) : fmtClock(at)
  }

  function exportEvidence() {
    const payload = {
      exported_at: new Date().toISOString(),
      source:      'ShadowTrace v1.0.0',
      total:       events.length,
      events: events.map(e => ({
        id: e.id, kind: e.kind, severity: e.sev, campaign: e.campaign ?? null,
        message: e.text, tag: e.tag, source: e.source ?? null, url: e.url ?? null,
        timestamp: new Date(e.at).toISOString(),
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `shadowtrace-evidence-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <aside className="mc-stream" aria-labelledby="mc-live-h">
      <div className="mc-stream-in">
        <div className="mc-stream-head">
          <h2 id="mc-live-h"><span className="mc-dot live" aria-hidden="true" />Live intelligence</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button type="button" className="mc-link quiet" onClick={exportEvidence} disabled={events.length === 0}>
              Export evidence
            </button>
            <span className="meta">UTC</span>
          </div>
        </div>

        <ul className="mc-stream-list">
          {events.length === 0 && (
            <li className="mc-empty" style={{ borderTop: 'none' }}>Waiting for the first signal…</li>
          )}
          {events.map(e => {
            const target = e.campaign ? intel.find(i => i.name === e.campaign) : undefined
            const who =
              e.kind === 'factcheck'      ? (e.source ?? 'Fact-checker')
              : e.kind === 'investigation' ? 'Your investigation'
              : (e.campaign ?? 'Network')
            const fresh = e.id.startsWith('live-')

            return (
              <li key={e.id} className={`mc-ev sev-${SEV_TO_CLASS[e.sev]}${fresh ? ' fresh' : ''}`}>
                <time className="mc-ev-time" dateTime={new Date(e.at).toISOString()}>{stamp(e.at)}</time>
                <div className="mc-ev-main">
                  <div className="mc-ev-who">
                    <span className={`mc-dot sev-${SEV_TO_CLASS[e.sev]}`} aria-hidden="true" />
                    <span>{who}</span>
                    <span className={`mc-chip mc-ev-tag${e.kind === 'investigation' ? ' teal' : ''}`}>{e.tag}</span>
                  </div>
                  <div className="mc-ev-text">
                    {e.url ? (
                      <a href={e.url} target="_blank" rel="noopener noreferrer">{e.text}</a>
                    ) : target ? (
                      <button type="button" onClick={() => select(target.id, { scroll: true })} title={`Show ${target.name} network`}>
                        {e.text}
                      </button>
                    ) : (
                      e.text
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}
