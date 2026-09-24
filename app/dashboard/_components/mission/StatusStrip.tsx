'use client'

import { useMission } from './MissionProvider'
import { Skel } from './ui'
import { BOTS_DETECTED_SEED, fmtAgo, fmtClock, fmtInt, fmtShortDate } from '@/lib/mission'

interface Kpi {
  label: string
  value: string
  delta: string
  time:  string
}

export default function StatusStrip() {
  const { intel, campaigns, liveFeed, agents, alertsToday, newSignals, events, now } = useMission()
  const loading = campaigns === null

  // ── Headline: the story in one sentence, computed from the same data as the rest ──
  const top = [...intel].sort((a, b) => b.score - a.score)[0]
  const highCount = intel.filter(i => i.sev === 'HIGH' || i.sev === 'CRITICAL').length

  let headline = 'No active campaigns'
  let subline  = 'Start an investigation below to trace a claim, link, account or image.'
  if (top) {
    headline = `${top.name} is the leading threat`
    const parts = [
      `${highCount} of ${intel.length} ${intel.length === 1 ? 'campaign is' : 'campaigns are'} at high severity.`,
      `${top.name} scores ${top.score} across ${fmtInt(top.accounts)} tracked accounts`,
    ]
    subline = `${parts[0]} ${parts[1]}${top.clusters ? ` in ${top.clusters} ${top.clusters === 1 ? 'cluster' : 'clusters'}` : ''}.`
  }

  // ── KPIs — every context line is derived from real data ────────────────────
  const signals      = events.filter(e => e.kind === 'signal')
  const highSignals  = signals.filter(e => e.sev === 'HIGH').length
  const lastSignal   = signals[0]
  const botsMapped   = intel.reduce((n, i) => n + i.counts.bot, 0)
  const conf         = intel.map(i => i.confidence)
  const avgConf      = conf.length ? conf.reduce((a, b) => a + b, 0) / conf.length : null
  const sevCount = (s: string) => intel.filter(i => i.sev === s).length
  const composition = [
    sevCount('HIGH') + sevCount('CRITICAL') ? `${sevCount('HIGH') + sevCount('CRITICAL')} high` : '',
    sevCount('MEDIUM') ? `${sevCount('MEDIUM')} medium` : '',
    sevCount('LOW')    ? `${sevCount('LOW')} low` : '',
  ].filter(Boolean).join(' · ')
  const since = Math.min(...intel.map(i => i.startedAt).filter(Boolean))

  const kpis: Kpi[] = [
    {
      label: 'Active campaigns',
      value: String(intel.length).padStart(2, '0'),
      delta: composition || 'None tracked',
      time:  Number.isFinite(since) ? `Monitoring since ${fmtShortDate(since)}` : '—',
    },
    {
      label: 'Bots detected',
      value: fmtInt(BOTS_DETECTED_SEED),
      delta: `${fmtInt(botsMapped)} placed in network graphs`,
      time:  `Estimate across ${intel.length} ${intel.length === 1 ? 'campaign' : 'campaigns'}`,
    },
    {
      label: 'Alerts today',
      value: String(alertsToday),
      delta: `${newSignals > 0 ? `+${newSignals} this session · ` : ''}${highSignals} high severity in feed`,
      time:  lastSignal && now ? `Last alert ${fmtAgo(lastSignal.at, now)}` : '—',
    },
    {
      label: 'Average confidence',
      value: avgConf === null ? '—' : `${avgConf.toFixed(1)}%`,
      delta: conf.length ? `Range ${Math.min(...conf)}–${Math.max(...conf)}%` : '—',
      time:  `Across ${conf.length} ${conf.length === 1 ? 'campaign' : 'campaigns'}`,
    },
    {
      label: 'Live claims',
      value: liveFeed ? String(liveFeed.count) : '—',
      delta: !liveFeed ? 'Loading fact-checker feeds…'
           : liveFeed.sample ? 'Sample feed — fact-checkers unreachable'
           : `From ${liveFeed.sources} fact-checker ${liveFeed.sources === 1 ? 'source' : 'sources'}`,
      time:  liveFeed ? `Updated ${fmtClock(liveFeed.updatedAt)} UTC` : '—',
    },
  ]

  return (
    <section className="mc-status" aria-labelledby="mc-headline">
      <div className="mc-status-top">
        <div>
          {loading ? (
            <>
              <Skel w={340} h={28} />
              <Skel w={480} h={14} style={{ marginTop: 14 }} />
            </>
          ) : (
            <>
              <h1 id="mc-headline" className="mc-headline" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {top && <span className={`mc-dot sev-${top.sev}`} style={{ width: 10, height: 10 }} aria-hidden="true" />}
                {headline}
              </h1>
              <p className="mc-subline">{subline}</p>
            </>
          )}
        </div>

        <div className="mc-sys" aria-label="System status">
          {agents === null ? (
            <span><span className="mc-dot" />Checking systems…</span>
          ) : agents.status === 'online' ? (
            <span className="ok"><span className="mc-dot live" />{agents.online} of {agents.total} agents online</span>
          ) : (
            <span className="warn"><span className="mc-dot" style={{ background: 'var(--amber)' }} />Backend unreachable — showing sample data</span>
          )}
          <span>{now ? `Updated ${fmtClock(now)} UTC` : ' '}</span>
        </div>
      </div>

      <div className="mc-kpis" role="list">
        {kpis.map(k => (
          <div className="mc-kpi" role="listitem" key={k.label}>
            <div className="mc-kpi-label">{k.label}</div>
            <div className="mc-kpi-value">{loading && k.label !== 'Live claims' ? <Skel w={56} h={26} /> : k.value}</div>
            <div className="mc-kpi-delta">{k.delta}</div>
            <div className="mc-kpi-time">{k.time}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
