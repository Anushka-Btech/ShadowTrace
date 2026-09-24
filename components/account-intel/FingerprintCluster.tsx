'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FingerprintAccount {
  handle:         string
  cluster_id:     number
  ai_probability: number
  features: {
    avg_sentence_length:  number
    vocabulary_diversity: number
    punctuation_density:  number
    emoji_frequency:      number
  }
}

export interface FingerprintData {
  score:             number
  clusters:          number
  accounts:          FingerprintAccount[]
  similarity_matrix: number[][]
}

interface Props {
  data: FingerprintData
  /** Handles analyzed — seeds mock data when the backend sends no accounts */
  accounts?: string[]
}

type SimNode = FingerprintAccount & {
  x?: number; y?: number; vx?: number; vy?: number; index?: number
}
type SimLink = { source: number | SimNode; target: number | SimNode; sim: number }
type TooltipState = { x: number; y: number; node: SimNode } | null

// ─── Constants ────────────────────────────────────────────────────────────────

const FONT: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono, "Fira Code", monospace)',
}
const BORDER = '1px solid #1E2D4A'
const SIM_THRESHOLD = 0.7

const CLUSTER_COLORS = ['#00D4AA', '#F59E0B', '#EF4444', '#7C3AED']

const SEV: Record<string, string> = {
  HIGH: '#EF4444',
  MED:  '#F59E0B',
  LOW:  '#22C55E',
}

function severity(score: number): 'HIGH' | 'MED' | 'LOW' {
  if (score >= 70) return 'HIGH'
  if (score >= 40) return 'MED'
  return 'LOW'
}

const FEATURE_LABELS: Record<keyof FingerprintAccount['features'], string> = {
  avg_sentence_length:  'AVG SENTENCE LEN',
  vocabulary_diversity: 'VOCAB DIVERSITY',
  punctuation_density:  'PUNCT DENSITY',
  emoji_frequency:      'EMOJI FREQ',
}

function formatFeature(key: keyof FingerprintAccount['features'], value: number): string {
  switch (key) {
    case 'avg_sentence_length': return `${value.toFixed(1)} words`
    case 'emoji_frequency':     return `${value.toFixed(1)}/post`
    default:                    return value.toFixed(2)
  }
}

// ─── Mock data (demo fallback when backend sends no accounts) ─────────────────

const FALLBACK_HANDLES = [
  '@TruthVoter2024', '@ElectionWatchIN', '@PatriotPulse_', '@VoteFactsNow',
  '@DemAlertDaily', '@FactCheckBharat', '@CivicSignal_', '@PollWatchdog',
]

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Same-cluster accounts get near-identical stylometry (that's the tell);
// cross-cluster similarity stays below the edge threshold.
const CLUSTER_PROFILES = [
  { sentence: 19.2, vocab: 0.38, punct: 0.42, emoji: 3.1, aiLo: 0.76, aiHi: 0.94 },
  { sentence: 11.8, vocab: 0.62, punct: 0.17, emoji: 0.7, aiLo: 0.22, aiHi: 0.52 },
  { sentence: 15.5, vocab: 0.49, punct: 0.29, emoji: 1.8, aiLo: 0.45, aiHi: 0.7  },
  { sentence: 22.4, vocab: 0.33, punct: 0.51, emoji: 4.2, aiLo: 0.8,  aiHi: 0.96 },
]

function generateMockData(handles: string[], clusters: number): Pick<FingerprintData, 'accounts' | 'similarity_matrix'> {
  const names = handles.length >= 2 ? handles.slice(0, 10) : FALLBACK_HANDLES
  // Every cluster needs ≥2 members or the graph shows edgeless singleton dots
  const k     = Math.max(1, Math.min(clusters || 2, CLUSTER_PROFILES.length, Math.floor(names.length / 2)))
  const rand  = mulberry32(hashString(names.join('|')))

  const accounts: FingerprintAccount[] = names.map((handle, i) => {
    // Contiguous split keeps clusters visually distinct (e.g. 5/3 for 8 accounts)
    const cluster = Math.min(k - 1, Math.floor((i * k) / names.length))
    const p = CLUSTER_PROFILES[cluster]
    return {
      handle,
      cluster_id:     cluster,
      ai_probability: p.aiLo + rand() * (p.aiHi - p.aiLo),
      features: {
        avg_sentence_length:  p.sentence + (rand() - 0.5) * 1.6,
        vocabulary_diversity: p.vocab    + (rand() - 0.5) * 0.05,
        punctuation_density:  p.punct    + (rand() - 0.5) * 0.06,
        emoji_frequency:      Math.max(0, p.emoji + (rand() - 0.5) * 0.8),
      },
    }
  })

  const n = accounts.length
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1
    for (let j = i + 1; j < n; j++) {
      const same = accounts[i].cluster_id === accounts[j].cluster_id
      const sim  = same ? 0.74 + rand() * 0.21 : 0.22 + rand() * 0.34
      matrix[i][j] = matrix[j][i] = Math.round(sim * 100) / 100
    }
  }

  return { accounts, similarity_matrix: matrix }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FingerprintCluster({ data, accounts }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef       = useRef<SVGSVGElement>(null)
  const simRef       = useRef<{ stop: () => void } | null>(null)
  const [width,   setWidth]   = useState(0)
  const [tooltip, setTooltip] = useState<TooltipState>(null)

  const { accounts: nodes, similarity_matrix: matrix } = useMemo(() => {
    if (data.accounts.length >= 2 && data.similarity_matrix.length === data.accounts.length) {
      return { accounts: data.accounts, similarity_matrix: data.similarity_matrix }
    }
    return generateMockData(accounts ?? [], data.clusters)
  }, [data.accounts, data.similarity_matrix, data.clusters, accounts])

  const links = useMemo(() => {
    const out: { source: number; target: number; sim: number }[] = []
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const sim = matrix[i]?.[j] ?? 0
        if (sim > SIM_THRESHOLD) out.push({ source: i, target: j, sim })
      }
    }
    return out
  }, [nodes, matrix])

  const clusterCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const n of nodes) counts.set(n.cluster_id, (counts.get(n.cluster_id) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => a[0] - b[0])
  }, [nodes])

  // Cohort means — used to pick each node's 2 most distinctive features
  const featureMeans = useMemo(() => {
    const keys = Object.keys(FEATURE_LABELS) as (keyof FingerprintAccount['features'])[]
    const means = {} as Record<keyof FingerprintAccount['features'], number>
    for (const key of keys) {
      means[key] = nodes.reduce((s, n) => s + n.features[key], 0) / Math.max(1, nodes.length)
    }
    return means
  }, [nodes])

  function topFeatures(node: SimNode): [keyof FingerprintAccount['features'], number][] {
    const keys = Object.keys(FEATURE_LABELS) as (keyof FingerprintAccount['features'])[]
    return keys
      .map(key => [key, node.features[key]] as [keyof FingerprintAccount['features'], number])
      .sort((a, b) => {
        const devA = Math.abs(a[1] - featureMeans[a[0]]) / (Math.abs(featureMeans[a[0]]) || 1)
        const devB = Math.abs(b[1] - featureMeans[b[0]]) / (Math.abs(featureMeans[b[0]]) || 1)
        return devB - devA
      })
      .slice(0, 2)
  }

  // ── Responsive width ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0
      if (w > 0) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── D3 force simulation ─────────────────────────────────────────────────────
  useEffect(() => {
    const svgEl = svgRef.current
    if (!svgEl || width === 0 || nodes.length === 0) return

    const height = 260
    let cancelled = false

    import('d3').then(d3 => {
      if (cancelled) return
      simRef.current?.stop()

      svgEl.setAttribute('width', String(width))
      svgEl.setAttribute('height', String(height))
      const svg = d3.select(svgEl)
      svg.selectAll('*').remove()

      const k = Math.max(1, clusterCounts.length)
      const anchors = clusterCounts.map(([id], i) => ({
        id,
        x: width / 2 + (k > 1 ? Math.cos((2 * Math.PI * i) / k) * width * 0.2 : 0),
        y: height / 2 + (k > 1 ? Math.sin((2 * Math.PI * i) / k) * height * 0.18 : 0),
      }))
      const anchorFor = (id: number) => anchors.find(a => a.id === id) ?? { x: width / 2, y: height / 2 }

      const simNodes: SimNode[] = nodes.map(n => {
        const a = anchorFor(n.cluster_id)
        return { ...n, x: a.x + (Math.random() - 0.5) * 40, y: a.y + (Math.random() - 0.5) * 40 }
      })
      const simLinks: SimLink[] = links.map(l => ({ ...l }))

      const radius = (n: SimNode) => 6 + n.ai_probability * 12

      const sim = d3.forceSimulation(simNodes)
        .force('link', d3.forceLink<SimNode, SimLink>(simLinks)
          // Same-cluster edges pull harder — clusters contract into tight groups
          .strength(l => {
            const s = l.source as SimNode
            const t = l.target as SimNode
            return s.cluster_id === t.cluster_id ? 0.5 : 0.08
          })
          .distance(l => 40 + (1 - l.sim) * 80))
        .force('charge', d3.forceManyBody().strength(-90))
        .force('x', d3.forceX<SimNode>(n => anchorFor(n.cluster_id).x).strength(0.14))
        .force('y', d3.forceY<SimNode>(n => anchorFor(n.cluster_id).y).strength(0.14))
        .force('collide', d3.forceCollide<SimNode>(n => radius(n) + 4))

      simRef.current = sim

      const linkSel = svg.append('g')
        .selectAll('line')
        .data(simLinks)
        .join('line')
        .attr('stroke', '#8B9AB5')
        .attr('stroke-opacity', 0.45)
        .attr('stroke-width', l => 0.5 + ((l.sim - SIM_THRESHOLD) / (1 - SIM_THRESHOLD)) * 3)

      const nodeSel = svg.append('g')
        .selectAll<SVGCircleElement, SimNode>('circle')
        .data(simNodes)
        .join('circle')
        .attr('r', radius)
        .attr('fill', n => CLUSTER_COLORS[n.cluster_id % CLUSTER_COLORS.length])
        .attr('fill-opacity', 0.85)
        .attr('stroke', '#080E1A')
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer')
        .on('mousemove', (event: MouseEvent, n) => {
          setTooltip({ x: event.offsetX, y: event.offsetY, node: n })
        })
        .on('mouseleave', () => setTooltip(null))

      const labelSel = svg.append('g')
        .selectAll('text')
        .data(simNodes)
        .join('text')
        .attr('fill', '#8B9AB5')
        .attr('pointer-events', 'none')
        .style('font-family', 'var(--font-jetbrains-mono, "Fira Code", monospace)')
        .style('font-size', '8px')
        .text(n => (n.handle.length > 14 ? n.handle.slice(0, 13) + '…' : n.handle))

      sim.on('tick', () => {
        for (const n of simNodes) {
          n.x = Math.max(radius(n) + 2, Math.min(width - radius(n) - 2, n.x ?? 0))
          n.y = Math.max(radius(n) + 2, Math.min(height - radius(n) - 2, n.y ?? 0))
        }
        linkSel
          .attr('x1', l => (l.source as SimNode).x ?? 0)
          .attr('y1', l => (l.source as SimNode).y ?? 0)
          .attr('x2', l => (l.target as SimNode).x ?? 0)
          .attr('y2', l => (l.target as SimNode).y ?? 0)
        nodeSel.attr('cx', n => n.x ?? 0).attr('cy', n => n.y ?? 0)
        labelSel
          .attr('x', n => (n.x ?? 0) + radius(n) + 4)
          .attr('y', n => (n.y ?? 0) + 3)
      })
    })

    return () => {
      cancelled = true
      simRef.current?.stop()
      simRef.current = null
    }
  }, [width, nodes, links, clusterCounts])

  const sev = severity(data.score)

  return (
    <div
      style={{
        border:          BORDER,
        backgroundColor: '#0D1526',
        minHeight:       '380px',
        padding:         '12px',
        display:         'flex',
        flexDirection:   'column',
        gap:             '12px',
      }}
    >
      <div style={{ ...FONT, fontSize: '10px', letterSpacing: '0.12em', color: '#4A5568' }}>
        LINGUISTIC FINGERPRINT
      </div>

      {/* Score header */}
      <div style={{ borderBottom: BORDER, paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ ...FONT, fontSize: '10px', letterSpacing: '0.1em', color: '#8B9AB5' }}>
            LINGUISTIC FINGERPRINT SCORE
          </span>
          <span style={{ ...FONT, fontSize: '20px', fontWeight: 700, color: '#E2E8F0', lineHeight: 1 }}>
            {data.score}/100
          </span>
          <span style={{ ...FONT, fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: SEV[sev] }}>
            {sev}
          </span>
        </div>
        <div style={{ ...FONT, fontSize: '10px', color: '#4A5568', marginTop: '6px' }}>
          Clusters detected: {clusterCounts.length}&nbsp;&nbsp;&nbsp;&nbsp;Accounts share authorship patterns
        </div>
      </div>

      {/* Force graph */}
      <div ref={containerRef} style={{ position: 'relative', flex: 1, minHeight: '260px' }}>
        <svg ref={svgRef} style={{ display: 'block' }} />

        {/* Legend — bottom-left */}
        <div
          style={{
            position:      'absolute',
            left:          0,
            bottom:        0,
            display:       'flex',
            flexDirection: 'column',
            gap:           '4px',
            pointerEvents: 'none',
          }}
        >
          {clusterCounts.map(([id, count]) => (
            <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width:           '8px',
                  height:          '8px',
                  borderRadius:    '50%',
                  backgroundColor: CLUSTER_COLORS[id % CLUSTER_COLORS.length],
                  flexShrink:      0,
                }}
              />
              <span style={{ ...FONT, fontSize: '9px', letterSpacing: '0.06em', color: '#4A5568' }}>
                Cluster {id} ({count} account{count > 1 ? 's' : ''})
              </span>
            </span>
          ))}
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div
            style={{
              ...FONT,
              position:        'absolute',
              left:            Math.min(tooltip.x + 12, Math.max(0, width - 220)),
              top:             tooltip.y + 12,
              width:           '210px',
              backgroundColor: '#080E1A',
              border:          `1px solid ${CLUSTER_COLORS[tooltip.node.cluster_id % CLUSTER_COLORS.length]}`,
              padding:         '10px',
              pointerEvents:   'none',
              zIndex:          10,
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#E2E8F0', marginBottom: '4px' }}>
              {tooltip.node.handle}
            </div>
            <div style={{ fontSize: '9px', color: '#8B9AB5', marginBottom: '8px' }}>
              Cluster {tooltip.node.cluster_id}
              {' · '}
              AI prob: {Math.round(tooltip.node.ai_probability * 100)}%
            </div>
            {topFeatures(tooltip.node).map(([key, value]) => (
              <div
                key={key}
                style={{
                  display:        'flex',
                  justifyContent: 'space-between',
                  fontSize:       '9px',
                  color:          '#4A5568',
                  marginTop:      '3px',
                }}
              >
                <span style={{ letterSpacing: '0.06em' }}>{FEATURE_LABELS[key]}</span>
                <span style={{ color: '#E2E8F0' }}>{formatFeature(key, value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
