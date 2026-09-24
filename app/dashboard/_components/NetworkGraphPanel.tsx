'use client'

import { useState, useRef, useEffect } from 'react'
import NetworkGraph from './NetworkGraph'
import LiveFeedPanel from '@/components/LiveFeedPanel'
import { campaigns as mockCampaigns } from '@/lib/mockData'
import type { Campaign } from '@/types'

const FONT: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono, "Fira Code", monospace)',
}

const THREAT_COLOR: Record<string, string> = {
  HIGH: '#EF4444',
  MED:  '#F59E0B',
  LOW:  '#3B82F6',
}

export default function NetworkGraphPanel() {
  const [campaigns,   setCampaigns]   = useState<Campaign[]>(mockCampaigns)
  const [selected,    setSelected]    = useState(0)     // which campaign button is active
  const [visible,     setVisible]     = useState(0)     // which campaign data the graph shows
  const [opacity,     setOpacity]     = useState(1)     // graph fade opacity
  const [graphReady,  setGraphReady]  = useState(false) // skeleton until D3 entrance anim ends
  const [showLive,    setShowLive]    = useState(false) // LIVE FEED tab replaces the graph

  // Clear any in-flight timeouts on rapid switching
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  // Keep a ref so event handlers always see the latest campaigns array
  const campaignsRef = useRef<Campaign[]>(mockCampaigns)

  // Fetch real campaign data from backend (via /api/campaigns Next.js proxy)
  useEffect(() => {
    fetch('/api/campaigns')
      .then(r => r.ok ? r.json() : null)
      .then((data: Campaign[] | null) => {
        if (Array.isArray(data) && data.length > 0) {
          setCampaigns(data)
          campaignsRef.current = data
        }
      })
      .catch(() => { /* silent — keeps mockCampaigns */ })
  }, [])

  // On mount: check if a campaign was pre-selected via sessionStorage (e.g. from Reports page)
  useEffect(() => {
    const saved = sessionStorage.getItem('st-campaign')
    if (saved) {
      sessionStorage.removeItem('st-campaign')
      const idx = campaignsRef.current.findIndex(c => c.name === saved)
      if (idx !== -1) {
        setSelected(idx)
        setVisible(idx)
      }
    }
  }, [])

  // Listen for campaign-select events dispatched by AnalyzePanel's "View Network →"
  useEffect(() => {
    function onSelect(e: Event) {
      const { campaignName } = (e as CustomEvent<{ campaignName: string }>).detail
      const idx = campaignsRef.current.findIndex(c => c.name === campaignName)
      if (idx === -1) return
      timers.current.forEach(clearTimeout)
      setSelected(idx)
      setOpacity(0)
      const t1 = setTimeout(() => setVisible(idx), 300)
      const t2 = setTimeout(() => setOpacity(1),   400)
      timers.current = [t1, t2]
    }
    window.addEventListener('shadowtrace:campaign-select', onSelect)
    return () => window.removeEventListener('shadowtrace:campaign-select', onSelect)
  }, [])

  function switchTo(idx: number) {
    if (idx === selected && !showLive) return
    setShowLive(false)
    if (idx === selected) return
    timers.current.forEach(clearTimeout)

    setSelected(idx)         // button highlights immediately
    setOpacity(0)            // graph fades out
    setGraphReady(false)     // re-show skeleton during campaign switch

    const t1 = setTimeout(() => setVisible(idx),  300)   // swap data mid-fade
    const t2 = setTimeout(() => setOpacity(1),    400)   // fade back in
    timers.current = [t1, t2]
  }

  const campaign = campaigns[visible]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Campaign selector bar ──────────────────────────────────────────── */}
      <div
        style={{
          ...FONT,
          display:        'flex',
          alignItems:     'center',
          height:         '36px',
          flexShrink:     0,
          padding:        '0 16px',
          borderBottom:   '1px solid #1E2D4A',
          gap:            '6px',
        }}
      >
        <span style={{ fontSize: '10px', color: '#4A5568', letterSpacing: '0.1em', marginRight: '10px' }}>
          CAMPAIGN
        </span>

        {campaigns.map((c, i) => (
          <button
            key={c.id}
            onClick={() => switchTo(i)}
            className={`st-tab ${selected === i && !showLive ? 'st-tab-active' : ''}`}
            style={{
              ...FONT,
              fontSize:      '11px',
              letterSpacing: '0.04em',
            }}
          >
            {c.name}
          </button>
        ))}

        {/* LIVE FEED tab — green pulsing dot, green left border */}
        <button
          onClick={() => setShowLive(true)}
          className="st-tab"
          style={{
            ...FONT,
            display:         'inline-flex',
            alignItems:      'center',
            gap:             '6px',
            fontSize:        '11px',
            letterSpacing:   '0.04em',
            borderLeft:      '2px solid #22C55E',
            backgroundColor: showLive ? '#22C55E' : 'transparent',
            color:           showLive ? '#080E1A' : '#4A5568',
            fontWeight:      showLive ? 600 : 400,
          }}
        >
          <span
            className="st-pulse-dot"
            style={{
              display:         'inline-block',
              width:           '5px',
              height:          '5px',
              borderRadius:    '50%',
              backgroundColor: showLive ? '#080E1A' : '#22C55E',
              flexShrink:      0,
            }}
          />
          LIVE FEED
        </button>

        {/* Right side: threat level + node count */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
          {showLive ? (
            <span style={{ fontSize: '10px', color: '#22C55E', letterSpacing: '0.06em' }}>
              REAL-TIME · FACT-CHECKER RSS
            </span>
          ) : (
            <>
              <span style={{ fontSize: '10px', color: THREAT_COLOR[campaign.threat_level] }}>
                {campaign.threat_level}
              </span>
              <span style={{ fontSize: '10px', color: '#4A5568', letterSpacing: '0.06em' }}>
                {`${campaign.nodes.length} NODES · ${campaign.edges.length} EDGES`}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Live feed view (replaces graph when LIVE FEED tab active) ──────── */}
      {showLive && (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <LiveFeedPanel />
        </div>
      )}

      {/* ── Graph area ────────────────────────────────────────────────────── */}
      {!showLive && (
      <div
        style={{
          flex:       1,
          opacity,
          transition: 'opacity 0.3s ease',
          overflow:   'hidden',
          position:   'relative',
        }}
      >
        {/* Skeleton — shown until D3 entrance animation completes */}
        {!graphReady && (
          <div
            style={{
              position:        'absolute',
              inset:           0,
              backgroundColor: '#080E1A',
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              zIndex:          10,
            }}
          >
            <svg width="70%" height="70%" viewBox="0 0 400 260">
              {/* Skeleton edges */}
              {[[200,130,80,60],[200,130,200,130],[200,130,320,60],[200,130,100,200],[200,130,300,200]].map(([x1,y1,x2,y2],i) => (
                <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="#1A2840" strokeWidth="1.5" className="st-skeleton" style={{ animationDelay: `${i*0.15}s` }} />
              ))}
              {/* Skeleton nodes */}
              {[[200,130,18],[80,60,12],[200,60,12],[320,60,12],[100,200,8],[300,200,8],[140,90,6],[260,90,6],[150,170,6],[250,170,6]].map(([cx,cy,r],i) => (
                <circle key={i} cx={cx} cy={cy} r={r}
                  className="st-skeleton" fill="#1A2840" style={{ animationDelay: `${i*0.1}s` }} />
              ))}
            </svg>
          </div>
        )}

        <NetworkGraph
          nodes={campaign.nodes}
          edges={campaign.edges}
          campaignName={campaign.name}
          onReady={() => setGraphReady(true)}
        />
      </div>
      )}

    </div>
  )
}
