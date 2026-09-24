'use client'

import { useMission } from './MissionProvider'
import { ACTIVITY_SEED, SEV_COLOR } from '@/lib/mission'

export default function ActivityTimeline() {
  const { intel, now } = useMission()

  // The axis always ends at the current UTC hour, so there is no "future" activity.
  const nowHour = now ? new Date(now).getUTCHours() : 23
  const hours = Array.from({ length: 24 }, (_, i) => (nowHour - 23 + i + 24) % 24)
  const pad = (h: number) => `${String(h).padStart(2, '0')}:00`

  const rows = ACTIVITY_SEED.map(a => {
    const c = intel.find(i => i.name === a.name)
    return { ...a, color: c ? SEV_COLOR[c.sev] : 'var(--teal)', sevLabel: c?.sev }
  })

  return (
    <section aria-labelledby="mc-tl-h">
      <div className="mc-h">
        <h2 id="mc-tl-h">Campaign activity, last 24 hours</h2>
        <span className="mc-h-sub">UTC · most recent hour on the right</span>
      </div>

      <div className="mc-tl">
        {rows.map(r => (
          <div className="mc-tl-row" key={r.name}>
            <div className="mc-tl-name"><span className="mc-dot" style={{ background: r.color }} aria-hidden="true" />{r.name}</div>
            <div
              className="mc-tl-cells"
              role="img"
              aria-label={`${r.name} was active in ${hours.filter(h => r.hours.includes(h)).length} of the last 24 hours`}
            >
              {hours.map(h => {
                const on = r.hours.includes(h)
                return <i key={h} className={on ? 'on' : undefined} style={on ? { background: r.color } : undefined} title={`${pad(h)} UTC${on ? ' — active' : ''}`} />
              })}
            </div>
          </div>
        ))}

        <div className="mc-tl-axis" aria-hidden="true">
          <span />
          <div>
            {[0, 4, 8, 12, 16, 20].map(i => <span className="h" key={i}>{pad(hours[i])}</span>)}
          </div>
        </div>
      </div>
    </section>
  )
}
