'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TemporalData {
  score: number
  flagged_pairs: number
  median_delay_seconds: number
  timeline: {
    account: string
    posts: { timestamp: number; text_preview: string }[]
  }[]
}

interface Props {
  data: TemporalData
  /** Handles analyzed — seeds the mock timeline when the backend sends none */
  accounts?: string[]
}

interface Post {
  timestamp:    number
  text_preview: string
}

interface Cell {
  account:     string
  row:         number
  col:         number
  count:       number
  coordinated: boolean
  posts:       Post[]
}

type TooltipState = { x: number; y: number; cell: Cell } | null

// ─── Constants ────────────────────────────────────────────────────────────────

const FONT: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono, "Fira Code", monospace)',
}
const BORDER   = '1px solid #1E2D4A'
const BLOCKS   = 28                    // 7 days × 4 six-hour blocks
const BLOCK_MS = 6 * 3600 * 1000
const COORD_WINDOW_MS = 30_000

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

// ─── Mock timeline (demo fallback when backend sends no timeline) ─────────────

const FALLBACK_ACCOUNTS = ['@TruthVoter2024', '@ElectionWatchIN', '@PatriotPulse_', '@VoteFactsNow', '@DemAlertDaily']

const MOCK_PREVIEWS = [
  'BREAKING: Election Commission official confirms voting dates secretly changed…',
  'They don\'t want you to see this. RT before it gets deleted!!',
  'EVM machines in 847 polling booths pre-programmed. Wake up people.',
  'Media silence on this is DEAFENING. Share everywhere.',
  'My cousin works at the ministry — this is 100% real. Spread the word.',
  'Independent lab confirms what we suspected all along. Thread below 🧵',
  'Why is nobody talking about this?? Mainstream media bought and paid for.',
  'URGENT: internal documents leaked. Download before takedown.',
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

function generateMockTimeline(accounts: string[], windowStart: number): TemporalData['timeline'] {
  const names = accounts.length >= 2 ? accounts : FALLBACK_ACCOUNTS
  const rand  = mulberry32(hashString(names.join('|')))
  const span  = BLOCKS * BLOCK_MS
  const posts = new Map<string, Post[]>(names.map(n => [n, []]))

  // 6 coordination events: 2–4 accounts posting the same message seconds apart
  const events = 6
  for (let e = 0; e < events; e++) {
    const base    = windowStart + rand() * (span - BLOCK_MS)
    const preview = MOCK_PREVIEWS[Math.floor(rand() * MOCK_PREVIEWS.length)]
    const k       = 2 + Math.floor(rand() * Math.min(3, names.length - 1))
    const chosen  = [...names].sort(() => rand() - 0.5).slice(0, k)
    chosen.forEach((name, i) => {
      posts.get(name)!.push({
        timestamp:    Math.round(base + i * (2000 + rand() * 8000)), // 2–10s apart
        text_preview: preview,
      })
    })
  }

  // Scattered organic-looking posts per account
  for (const name of names) {
    const n = 5 + Math.floor(rand() * 8)
    for (let i = 0; i < n; i++) {
      posts.get(name)!.push({
        timestamp:    Math.round(windowStart + rand() * span),
        text_preview: MOCK_PREVIEWS[Math.floor(rand() * MOCK_PREVIEWS.length)],
      })
    }
  }

  return names.map(account => ({
    account,
    posts: posts.get(account)!.sort((a, b) => a.timestamp - b.timestamp),
  }))
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TemporalHeatmap({ data, accounts }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef       = useRef<SVGSVGElement>(null)
  const [width,   setWidth]   = useState(0)
  const [tooltip, setTooltip] = useState<TooltipState>(null)

  // Freeze the 7-day window on mount so re-renders don't shift bins
  const [windowEnd] = useState(() => Math.ceil(Date.now() / BLOCK_MS) * BLOCK_MS)
  const windowStart = windowEnd - BLOCKS * BLOCK_MS

  const timeline = useMemo(() => {
    if (data.timeline && data.timeline.length > 0) return data.timeline
    return generateMockTimeline(accounts ?? [], windowStart)
  }, [data.timeline, accounts, windowStart])

  // ── Bin posts into (account × 6h-block) cells + detect coordination ────────
  const { cells, connectors, maxCount } = useMemo(() => {
    const cellMap = new Map<string, Cell>()
    timeline.forEach((entry, row) => {
      for (const p of entry.posts) {
        const col = Math.floor((p.timestamp - windowStart) / BLOCK_MS)
        if (col < 0 || col >= BLOCKS) continue
        const key = `${row}:${col}`
        let cell = cellMap.get(key)
        if (!cell) {
          cell = { account: entry.account, row, col, count: 0, coordinated: false, posts: [] }
          cellMap.set(key, cell)
        }
        cell.count++
        cell.posts.push(p)
      }
    })

    // Coordinated = post within 30s of another account's post in the same block
    const connectors: { col: number; rows: number[] }[] = []
    for (let col = 0; col < BLOCKS; col++) {
      const colCells = timeline
        .map((_, r) => cellMap.get(`${r}:${col}`))
        .filter((c): c is Cell => Boolean(c))
      const flagged = new Set<number>()
      for (let i = 0; i < colCells.length; i++) {
        for (let j = i + 1; j < colCells.length; j++) {
          pair: for (const a of colCells[i].posts) {
            for (const b of colCells[j].posts) {
              if (Math.abs(a.timestamp - b.timestamp) <= COORD_WINDOW_MS) {
                colCells[i].coordinated = true
                colCells[j].coordinated = true
                flagged.add(colCells[i].row)
                flagged.add(colCells[j].row)
                break pair
              }
            }
          }
        }
      }
      if (flagged.size >= 2) connectors.push({ col, rows: [...flagged].sort((a, b) => a - b) })
    }

    const maxCount = Math.max(1, ...[...cellMap.values()].map(c => c.count))
    return { cells: [...cellMap.values()], connectors, maxCount }
  }, [timeline, windowStart])

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

  // ── D3 render ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const svgEl = svgRef.current
    if (!svgEl || width === 0) return

    let cancelled = false

    import('d3').then(d3 => {
      if (cancelled) return

      const margin = { top: 22, right: 4, bottom: 6, left: Math.min(110, width * 0.3) }
      const rowH   = timeline.length <= 5 ? 30 : 24
      const gap    = 2
      const innerW = Math.max(0, width - margin.left - margin.right)
      const cellW  = innerW / BLOCKS
      const height = margin.top + timeline.length * rowH + margin.bottom

      const svg = d3.select(svgEl)
      svg.selectAll('*').remove()
      svg.attr('width', width).attr('height', height)

      const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

      const x = (col: number) => col * cellW
      const y = (row: number) => row * rowH

      // Background grid (empty cells)
      for (let r = 0; r < timeline.length; r++) {
        for (let c = 0; c < BLOCKS; c++) {
          g.append('rect')
            .attr('x', x(c) + gap / 2)
            .attr('y', y(r) + gap / 2)
            .attr('width', Math.max(0, cellW - gap))
            .attr('height', rowH - gap)
            .attr('fill', '#0D1526')
        }
      }

      // Day labels along the top (every 4 columns = 1 day)
      const fmt = d3.timeFormat('%a %d')
      for (let c = 0; c < BLOCKS; c += 4) {
        g.append('text')
          .attr('x', x(c) + 2)
          .attr('y', -8)
          .attr('fill', '#4A5568')
          .style('font-family', 'var(--font-jetbrains-mono, "Fira Code", monospace)')
          .style('font-size', '8px')
          .style('letter-spacing', '0.08em')
          .text(fmt(new Date(windowStart + c * BLOCK_MS)).toUpperCase())
      }

      // Account labels
      timeline.forEach((entry, r) => {
        g.append('text')
          .attr('x', -8)
          .attr('y', y(r) + rowH / 2 + 3)
          .attr('text-anchor', 'end')
          .attr('fill', '#8B9AB5')
          .style('font-family', 'var(--font-jetbrains-mono, "Fira Code", monospace)')
          .style('font-size', '9px')
          .text(entry.account.length > 16 ? entry.account.slice(0, 15) + '…' : entry.account)
      })

      // Coordination connectors — vertical red lines through flagged cells
      for (const conn of connectors) {
        const cx = x(conn.col) + cellW / 2
        g.append('line')
          .attr('x1', cx)
          .attr('x2', cx)
          .attr('y1', y(conn.rows[0]) + rowH / 2)
          .attr('y2', y(conn.rows[conn.rows.length - 1]) + rowH / 2)
          .attr('stroke', '#EF4444')
          .attr('stroke-width', 1)
          .attr('stroke-opacity', 0.55)
      }

      // Filled cells
      g.selectAll<SVGRectElement, Cell>('rect.st-heat-cell')
        .data(cells)
        .join('rect')
        .attr('class', 'st-heat-cell')
        .attr('x', d => x(d.col) + gap / 2)
        .attr('y', d => y(d.row) + gap / 2)
        .attr('width', Math.max(0, cellW - gap))
        .attr('height', rowH - gap)
        .attr('fill', d => (d.coordinated ? '#EF4444' : '#00D4AA'))
        .attr('fill-opacity', d =>
          d.coordinated ? 0.95 : Math.min(0.95, 0.6 * (0.6 + (0.4 * d.count) / maxCount)),
        )
        .style('cursor', 'pointer')
        .on('mousemove', (event: MouseEvent, d) => {
          setTooltip({ x: event.offsetX, y: event.offsetY, cell: d })
        })
        .on('mouseleave', () => setTooltip(null))
    })

    return () => {
      cancelled = true
    }
  }, [width, cells, connectors, timeline, maxCount, windowStart])

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
        TEMPORAL COORDINATION
      </div>

      {/* Score header */}
      <div style={{ borderBottom: BORDER, paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ ...FONT, fontSize: '10px', letterSpacing: '0.1em', color: '#8B9AB5' }}>
            TEMPORAL COORDINATION SCORE
          </span>
          <span style={{ ...FONT, fontSize: '20px', fontWeight: 700, color: '#E2E8F0', lineHeight: 1 }}>
            {data.score}/100
          </span>
          <span style={{ ...FONT, fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: SEV[sev] }}>
            {sev}
          </span>
        </div>
        <div style={{ ...FONT, fontSize: '10px', color: '#4A5568', marginTop: '6px' }}>
          Flagged pairs: {data.flagged_pairs}&nbsp;&nbsp;&nbsp;&nbsp;Median delay: {data.median_delay_seconds}s
        </div>
      </div>

      {/* Heatmap */}
      <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
        <svg ref={svgRef} style={{ display: 'block' }} />
        {tooltip && (
          <div
            style={{
              ...FONT,
              position:        'absolute',
              left:            Math.min(tooltip.x + 12, Math.max(0, width - 230)),
              top:             tooltip.y + 12,
              width:           '220px',
              backgroundColor: '#080E1A',
              border:          `1px solid ${tooltip.cell.coordinated ? '#EF4444' : '#1E2D4A'}`,
              padding:         '10px',
              pointerEvents:   'none',
              zIndex:          10,
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#E2E8F0', marginBottom: '4px' }}>
              {tooltip.cell.account}
            </div>
            <div style={{ fontSize: '9px', color: '#4A5568', marginBottom: '6px' }}>
              {new Date(tooltip.cell.posts[0].timestamp).toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
              })}
              {' · '}
              {tooltip.cell.count} post{tooltip.cell.count > 1 ? 's' : ''} in block
            </div>
            {tooltip.cell.coordinated && (
              <div style={{ fontSize: '9px', color: '#EF4444', letterSpacing: '0.08em', marginBottom: '6px' }}>
                ⚠ COORDINATED — POSTED WITHIN 30s OF ANOTHER ACCOUNT
              </div>
            )}
            <div style={{ fontSize: '10px', color: '#8B9AB5', lineHeight: 1.5 }}>
              {tooltip.cell.posts[0].text_preview}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        {[
          { color: '#00D4AA', opacity: 0.6, label: 'POST' },
          { color: '#EF4444', opacity: 0.95, label: 'COORDINATED (<30s)' },
          { color: '#0D1526', opacity: 1, label: 'NO ACTIVITY', border: true },
        ].map(item => (
          <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width:           '10px',
                height:          '10px',
                backgroundColor: item.color,
                opacity:         item.opacity,
                border:          item.border ? BORDER : 'none',
                flexShrink:      0,
              }}
            />
            <span style={{ ...FONT, fontSize: '9px', letterSpacing: '0.08em', color: '#4A5568' }}>
              {item.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
