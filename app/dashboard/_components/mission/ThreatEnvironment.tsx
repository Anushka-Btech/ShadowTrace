'use client'

import { useMission } from './MissionProvider'
import { SevChip, Skel, Track } from './ui'
import { fmtAgo, fmtCompact, fmtInt, SEV_COLOR } from '@/lib/mission'

export default function ThreatEnvironment() {
  const { intel, campaigns, selectedId, select, events, now } = useMission()
  const loading = campaigns === null

  // last activity per campaign = latest event in the shared stream that names it
  const lastEvent = (name: string) => events.find(e => e.campaign === name)

  const rows = [...intel].sort((a, b) => b.score - a.score)

  return (
    <section aria-labelledby="mc-threat-h">
      <div className="mc-h">
        <h2 id="mc-threat-h">Threat environment</h2>
        <span className="mc-h-sub">
          {loading ? 'Loading campaigns…' : `${rows.length} active ${rows.length === 1 ? 'campaign' : 'campaigns'} · select one to focus the network below`}
        </span>
      </div>

      <div className="mc-tbl" role="group" aria-label="Active campaigns by threat score">
        <div className="mc-thead" aria-hidden="true">
          <span>Campaign</span>
          <span>Severity</span>
          <span>Threat score</span>
          <span className="r hide-sm">Accounts</span>
          <span className="r hide-md hide-sm">Reach</span>
          <span className="r hide-lg hide-md hide-sm">Depth</span>
          <span className="r hide-sm">Confidence</span>
          <span className="hide-lg hide-md hide-sm">Network mix</span>
          <span className="r hide-md hide-sm">Last activity</span>
        </div>

        {loading &&
          [0, 1, 2].map(i => (
            <div className="mc-trow" key={i} aria-hidden="true">
              <Skel w="60%" h={16} /><Skel w={54} h={20} /><Skel w="80%" h={12} />
            </div>
          ))}

        {rows.map(c => {
          const total = c.mapped || 1
          const last = lastEvent(c.name)
          return (
            <button
              key={c.id}
              type="button"
              className="mc-trow"
              aria-label={`${c.name}, ${c.topic}, ${c.sev.toLowerCase()} severity, threat score ${c.score}`}
              aria-pressed={c.id === selectedId}
              onClick={() => select(c.id)}
            >
              <span className="mc-cell">
                <span className="mc-name">{c.name}</span>
                <span className="mc-sub" style={{ display: 'block' }}>{c.topic}</span>
              </span>

              <span className="mc-cell"><SevChip sev={c.sev} /></span>

              <span className="mc-cell mc-scorecell">
                <span className="mc-num" style={{ color: c.score >= 70 ? SEV_COLOR[c.sev] : undefined }}>{c.score}</span>
                <Track value={c.score} sev={c.sev} />
              </span>

              <span className="mc-cell r hide-sm">
                <span className="mc-num">{fmtInt(c.accounts)}</span>
                <span className="mc-sub">{fmtInt(c.mapped)} mapped</span>
              </span>
              <span className="mc-cell r hide-md hide-sm" title="Followers of accounts mapped in the graph">
                <span className="mc-num">{fmtCompact(c.reach)}</span>
                <span className="mc-sub">followers</span>
              </span>
              <span className="mc-cell r hide-lg hide-md hide-sm" title="Hops from the origin to the farthest account">
                <span className="mc-num">{c.depth}<small>hops</small></span>
                <span className="mc-sub">{c.clusters} {c.clusters === 1 ? 'cluster' : 'clusters'}</span>
              </span>
              <span className="mc-cell r mc-num hide-sm">{c.confidence}<small>%</small></span>

              <span className="mc-cell hide-lg hide-md hide-sm">
                <span
                  className="mc-mix"
                  role="img"
                  aria-label={`${c.counts.origin} origin, ${c.counts.bot} bots, ${c.counts.amplifier} amplifiers, ${c.counts.legitimate} legitimate accounts`}
                  title={`${c.counts.origin} origin · ${c.counts.bot} bots · ${c.counts.amplifier} amplifiers · ${c.counts.legitimate} legitimate`}
                >
                  {(['origin', 'bot', 'amplifier', 'legitimate'] as const).map(t =>
                    c.counts[t] ? <i key={t} className={t} style={{ width: `${(c.counts[t] / total) * 100}%` }} /> : null,
                  )}
                </span>
                <span className="mc-sub">{c.counts.bot} bots · {c.counts.amplifier} amplifiers</span>
              </span>

              <span className="mc-cell r hide-md hide-sm">
                <span className="mc-ago">{last && now ? fmtAgo(last.at, now) : '—'}</span>
                {last && <span className="mc-sub tag">{last.tag}</span>}
              </span>
            </button>
          )
        })}

        {!loading && rows.length === 0 && (
          <div className="mc-empty">No campaigns are being tracked yet.</div>
        )}
      </div>
    </section>
  )
}
