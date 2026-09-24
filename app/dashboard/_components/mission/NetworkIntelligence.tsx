'use client'

import { useEffect, useRef, useState } from 'react'
import NetworkGraph, { type SimNode } from '../NetworkGraph'
import { useMission } from './MissionProvider'
import { Track } from './ui'
import { fmtCompact, fmtInt, type CampaignIntel, type Sev } from '@/lib/mission'

const LEGEND: { key: 'origin' | 'bot' | 'amplifier' | 'legitimate'; label: string; color: string }[] = [
  { key: 'origin',     label: 'Origin',     color: '#EF4444' },
  { key: 'bot',        label: 'Bots',       color: '#F59E0B' },
  { key: 'amplifier',  label: 'Amplifiers', color: '#8B9AB5' },
  { key: 'legitimate', label: 'Legitimate', color: '#00D4AA' },
]

const NODE_LABEL: Record<string, string> = {
  origin: 'Origin (command node)', bot: 'Bot account', amplifier: 'Amplifier', legitimate: 'Legitimate account',
}

function narrative(i: CampaignIntel): string {
  const parts = [`${fmtInt(i.mapped)} accounts mapped`]
  if (i.clusters) parts.push(`${i.clusters} ${i.clusters === 1 ? 'cluster' : 'clusters'}`)
  const origin = i.counts.origin
  parts.push(origin === 0 ? 'no verified origin' : origin === 1 ? 'one command node' : `${origin} origin nodes`)
  return `${i.name}: ${parts.join(', ')}.`
}

export default function NetworkIntelligence() {
  const { selected, intel, select, campaigns } = useMission()
  const [pickedRaw, setPicked] = useState<{ node: SimNode; degree: number; campaignId: string } | null>(null)
  const [inView, setInView]   = useState(false)
  const [everReady, setReady] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Build the graph only once it is near the viewport: the entrance animation is then seen,
  // and the D3 simulation does not run for a panel that is off-screen.
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setInView(true); io.disconnect() }
    }, { rootMargin: '240px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // A selection belongs to the campaign it was made in; switching campaigns clears it.
  const campaignId = selected?.campaign.id
  const picked = pickedRaw && pickedRaw.campaignId === campaignId ? pickedRaw : null

  const i = selected?.intel
  const c = selected?.campaign
  const pct = i ? Math.round(i.concentration * 100) : 0
  // A few accounts holding most links means the network hangs on them: higher = riskier
  const concentrationSev: Sev = pct >= 60 ? 'HIGH' : pct >= 40 ? 'MEDIUM' : 'LOW'

  return (
    <section id="mc-network" className="mc-hero" aria-labelledby="mc-net-h">
      <div className="mc-hero-head">
        <div style={{ minWidth: 0 }}>
          <h2 id="mc-net-h" className="mc-hero-title">Network intelligence</h2>
          <p className="mc-hero-sub">
            ShadowTrace discovers the network behind the content.{' '}
            {i ? narrative(i) : campaigns === null ? 'Mapping accounts…' : 'No network data yet.'}
          </p>
        </div>

        <div className="mc-tabs" role="tablist" aria-label="Campaign network">
          {intel.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === selected?.campaign.id}
              className="mc-tab"
              onClick={() => select(t.id)}
            >
              <span className={`mc-dot sev-${t.sev}`} aria-hidden="true" />
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mc-hero-body">
        <div className="mc-canvas" ref={canvasRef}>
          {!everReady && (
            <div className="mc-canvas-skel" aria-hidden="true">
              <svg width="64%" height="64%" viewBox="0 0 400 260">
                {[[200,130,80,60],[200,130,320,60],[200,130,100,200],[200,130,300,200],[200,130,200,50]].map(([x1,y1,x2,y2], k) => (
                  <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#14213B" strokeWidth="1.5" className="st-skeleton" />
                ))}
                {[[200,130,16],[80,60,10],[320,60,10],[100,200,8],[300,200,8],[200,50,7]].map(([cx,cy,r], k) => (
                  <circle key={k} cx={cx} cy={cy} r={r} fill="#14213B" className="st-skeleton" />
                ))}
              </svg>
            </div>
          )}

          {inView && c && (
            <div className="mc-canvas-fill">
            <NetworkGraph
              nodes={c.nodes}
              edges={c.edges}
              campaignName={c.name}
              showLegend={false}
              labelHubs
              insetBottom={52}
              fit
              selectedId={picked?.node.id ?? null}
              onSelectNode={(node, degree) => setPicked(node ? { node, degree, campaignId: c.id } : null)}
              onReady={() => setReady(true)}
            />
            </div>
          )}

          {i && (
            <div className="mc-legend" aria-label="Legend">
              {LEGEND.filter(l => i.counts[l.key] > 0).map(l => (
                <span key={l.key}>
                  <i style={{ background: l.color }} />
                  {l.label} <span style={{ color: 'var(--t3)' }}>{i.counts[l.key]}</span>
                </span>
              ))}
            </div>
          )}
          <div className="mc-canvas-hint">Click an account to inspect · drag to move</div>
        </div>

        <div className="mc-side">
          {i ? (
            <>
              <div className="mc-stat">
                <div className="mc-stat-label">Active clusters</div>
                <div className="mc-stat-value">{i.clusters}</div>
                <div className="mc-stat-note">{i.counts.bot} bots · {i.counts.amplifier} amplifiers</div>
              </div>
              <div className="mc-stat">
                <div className="mc-stat-label">Connected accounts</div>
                <div className="mc-stat-value">{fmtInt(i.mapped)}<small>of {fmtInt(i.accounts)} tracked</small></div>
                <div className="mc-stat-note">{fmtInt(i.edges)} relationships · reach {fmtCompact(i.reach)}</div>
              </div>
              <div className="mc-stat">
                <div className="mc-stat-label">Propagation depth</div>
                <div className="mc-stat-value">{i.depth}<small>hops</small></div>
                <div className="mc-stat-note">{i.hasOrigin ? 'From the origin to the farthest account' : 'From the busiest account — no origin found'}</div>
              </div>
              <div className="mc-stat">
                <div className="mc-stat-label">Risk concentration</div>
                <div className="mc-stat-value">{pct}<small>%</small></div>
                <Track value={pct} sev={concentrationSev} />
                <div className="mc-stat-note">Top {i.hubs.length} accounts touch {pct}% of all links</div>
              </div>
              {i.strongest && (
                <div className="mc-stat">
                  <div className="mc-stat-label">Strongest link</div>
                  <div className="mc-stat-link">
                    {i.strongest.from.accountId ?? i.strongest.from.label}<i>→</i>{i.strongest.to.accountId ?? i.strongest.to.label}
                  </div>
                  <div className="mc-stat-note">Link strength {Math.round(i.strongest.weight * 100)}%</div>
                </div>
              )}

              {picked ? (
                <div className="mc-node" aria-live="polite">
                  <div className="mc-node-head">
                    <h3>{NODE_LABEL[picked.node.type] ?? picked.node.type}</h3>
                    <button type="button" className="mc-x" onClick={() => setPicked(null)} aria-label="Clear selection">Clear</button>
                  </div>
                  <div className="mc-node-id">{picked.node.accountId ?? picked.node.label}</div>
                  <dl className="mc-facts">
                    <dt>Connections</dt><dd>{picked.degree}</dd>
                    {picked.node.posts != null && (<><dt>Posts</dt><dd>{picked.node.posts.toLocaleString()}</dd></>)}
                    {picked.node.followers != null && (<><dt>Followers</dt><dd>{picked.node.followers.toLocaleString()}</dd></>)}
                    {picked.node.clusterId != null && (<><dt>Cluster</dt><dd>C{picked.node.clusterId + 1}</dd></>)}
                  </dl>
                </div>
              ) : (
                <div className="mc-node-empty">Select an account in the graph to see its connections, activity and cluster.</div>
              )}
            </>
          ) : (
            <div className="mc-node-empty">{campaigns === null ? 'Loading network…' : 'No network to show.'}</div>
          )}
        </div>
      </div>
    </section>
  )
}
