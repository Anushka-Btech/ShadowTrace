'use client'

import { useEffect, useRef, useState } from 'react'
import type { GraphNode, GraphEdge } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SimNode = GraphNode & { index?: number }

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  campaignName: string
  onReady?: () => void
  /** Draw the legend inside the SVG (default). The dashboard hero renders its own. */
  showLegend?: boolean
  /** Label the origin and the most-connected accounts with their handle. */
  labelHubs?: boolean
  /** Pixels kept free along the bottom edge (for overlays such as the hero legend). */
  insetBottom?: number
  /** Spread the layout to fill the canvas and draw slightly larger nodes (sparse graphs look lost otherwise). */
  fit?: boolean
  /** Controlled selection. When `onSelectNode` is given every node type is selectable. */
  selectedId?: string | null
  onSelectNode?: (node: SimNode | null, degree: number) => void
}

type SimEdge = { source: string | SimNode; target: string | SimNode; weight: number }
type TooltipState = { x: number; y: number; w: number; node: SimNode } | null

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FONT = 'var(--font-jetbrains-mono, "Fira Code", monospace)'

function nodeColor(t: string): string {
  switch (t) {
    case 'origin':     return '#EF4444'
    case 'bot':        return '#F59E0B'
    case 'amplifier':  return '#8B9AB5'
    case 'legitimate': return '#00D4AA'
    default:           return '#4A5568'
  }
}

function nodeRadius(t: string): number {
  switch (t) {
    case 'origin':     return 18
    case 'bot':        return 12
    case 'amplifier':  return 7
    case 'legitimate': return 6
    default:           return 5
  }
}

function edgeOpacity(srcType: string): number {
  if (srcType === 'origin') return 0.6
  if (srcType === 'bot')    return 0.3
  return 0.15
}

function edgeWidth(srcType: string): number {
  if (srcType === 'origin') return 2
  if (srcType === 'bot')    return 1
  return 0.5
}

// After D3 resolves forceLink, source/target are SimNode objects; handle both states
function srcId(d: SimEdge): string {
  return typeof d.source === 'string' ? d.source : (d.source as SimNode).id
}
function tgtId(d: SimEdge): string {
  return typeof d.target === 'string' ? d.target : (d.target as SimNode).id
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function NetworkGraph({
  nodes, edges, campaignName, onReady,
  showLegend = true, labelHubs = false, insetBottom = 0, fit = false, selectedId = null, onSelectNode,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef       = useRef<SVGSVGElement>(null)
  const simRef       = useRef<{ stop: () => void } | null>(null)
  const highlightRef = useRef<((id: string | null) => void) | null>(null)
  const selectCb     = useRef(onSelectNode)
  const readyCb      = useRef(onReady)
  const selectedIdRef = useRef<string | null>(selectedId)
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const [resizeTick, setResizeTick] = useState(0)

  // keep latest callbacks without re-running the drawing effect
  useEffect(() => { selectCb.current = onSelectNode; readyCb.current = onReady })

  // Redraw when the container is resized (debounced) — the layout is measured once per draw
  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let last = el.clientWidth
    let timer: ReturnType<typeof setTimeout> | undefined
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - last) < 24) return
      clearTimeout(timer)
      timer = setTimeout(() => { last = el.clientWidth; setResizeTick(t => t + 1) }, 250)
    })
    ro.observe(el)
    return () => { ro.disconnect(); clearTimeout(timer) }
  }, [])

  // The dataset signature — the graph must redraw when real data replaces sample data,
  // not only when the campaign name changes.
  const datasetKey = `${campaignName}|${nodes.length}|${edges.length}|${nodes[0]?.id ?? ''}`

  useEffect(() => {
    const container = containerRef.current
    const svgEl     = svgRef.current
    if (!container || !svgEl) return

    const width  = container.clientWidth
    const fullHeight = container.clientHeight
    if (width === 0 || fullHeight === 0) return
    const height = fullHeight - insetBottom   // area nodes may occupy

    let cancelled = false
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const controlled = !!selectCb.current
    const rs = fit ? 1.2 : 1                       // node size scale
    const rad = (t: string) => nodeRadius(t) * rs

    import('d3').then(d3 => {
      if (cancelled) return

      svgEl.setAttribute('width',  String(width))
      svgEl.setAttribute('height', String(fullHeight))

      // Deep-copy nodes and seed center starting positions (entrance animation)
      const simNodes: SimNode[] = nodes.map(n => ({
        ...n,
        x: width  / 2 + (Math.random() - 0.5) * 24,
        y: height / 2 + (Math.random() - 0.5) * 24,
      }))

      // D3 forceLink expects source/target as string IDs initially
      const simEdges: SimEdge[] = edges.map(e => ({
        source: typeof e.source === 'string' ? e.source : (e.source as GraphNode).id,
        target: typeof e.target === 'string' ? e.target : (e.target as GraphNode).id,
        weight: e.weight,
      }))

      const nodeById = new Map(simNodes.map(n => [n.id, n]))
      const degree = new Map<string, number>()
      for (const e of simEdges) {
        degree.set(srcId(e), (degree.get(srcId(e)) ?? 0) + 1)
        degree.set(tgtId(e), (degree.get(tgtId(e)) ?? 0) + 1)
      }

      const svg = d3.select(svgEl)
      svg.selectAll('*').remove()

      // ── Background grid (transparent base so the container sets the surface) ──
      const defs = svg.append('defs')
      const gridId = `stgrid-${campaignName.replace(/\W+/g, '')}`
      defs.append('pattern')
        .attr('id', gridId)
        .attr('width', 24).attr('height', 24)
        .attr('patternUnits', 'userSpaceOnUse')
        .append('path')
        .attr('d', 'M 24 0 L 0 0 0 24')
        .attr('fill', 'none')
        .attr('stroke', '#1E2D4A')
        .attr('stroke-width', '0.3')

      svg.append('rect')
        .attr('width', width).attr('height', fullHeight)
        .attr('fill', `url(#${gridId})`)
        .attr('opacity', 0.4)

      // ── Force simulation ─────────────────────────────────────────────────
      // Sparse graphs get more room: link length grows with the canvas area per node (never below the default 60)
      const linkDist = fit ? Math.max(60, Math.min(120, 0.5 * Math.sqrt((width * height) / Math.max(simNodes.length, 1)))) : 60
      const simulation = d3.forceSimulation<SimNode>(simNodes)
        .force('link',
          d3.forceLink<SimNode, SimEdge>(simEdges)
            .id(d => d.id)
            .distance(linkDist)
            .strength(0.7))
        .force('charge',    d3.forceManyBody<SimNode>().strength(-150 * (linkDist / 60) ** 1.4))
        .force('center',    d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide<SimNode>().radius(d => rad(d.type) + 3))
        .alphaDecay(0.02)

      simRef.current = simulation

      // ── Edges ────────────────────────────────────────────────────────────
      const linkGroup = svg.append('g')
      const link = linkGroup
        .selectAll<SVGLineElement, SimEdge>('line')
        .data(simEdges)
        .enter()
        .append('line')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', (d: SimEdge) => edgeWidth(nodeById.get(srcId(d))?.type ?? ''))
        .attr('opacity',      (d: SimEdge) => edgeOpacity(nodeById.get(srcId(d))?.type ?? ''))

      const resetEdges = () => {
        link
          .attr('stroke', '#ffffff')
          .attr('opacity',      (d: SimEdge) => edgeOpacity(nodeById.get(srcId(d))?.type ?? ''))
          .attr('stroke-width', (d: SimEdge) => edgeWidth(nodeById.get(srcId(d))?.type ?? ''))
      }

      // Isolate one account and its direct links; everything else recedes
      const highlight = (id: string | null) => {
        if (!id || !nodeById.has(id)) {
          resetEdges()
          node.attr('opacity', (d: SimNode) => (d.type === 'amplifier' || d.type === 'legitimate') ? 0.8 : 1)
          ring.attr('opacity', 0)
          return
        }
        const near = new Set<string>([id])
        link.each((l: SimEdge) => {
          if (srcId(l) === id) near.add(tgtId(l))
          if (tgtId(l) === id) near.add(srcId(l))
        })
        link
          .attr('stroke', (l: SimEdge) => (srcId(l) === id || tgtId(l) === id ? '#00D4AA' : '#ffffff'))
          .attr('opacity', (l: SimEdge) => (srcId(l) === id || tgtId(l) === id ? 0.95 : 0.05))
          .attr('stroke-width', (l: SimEdge) => (srcId(l) === id || tgtId(l) === id ? 2 : 0.3))
        node.attr('opacity', (d: SimNode) => (near.has(d.id) ? 1 : 0.22))
        ring.attr('opacity', (d: SimNode) => (d.id === id ? 1 : 0))
      }
      highlightRef.current = highlight

      // ── Background click → clear selection ───────────────────────────────
      svg.on('click', () => {
        if (controlled) selectCb.current?.(null, 0)
        else resetEdges()
        setTooltip(null)
      })

      // ── Drag behavior ────────────────────────────────────────────────────
      const drag = d3.drag<SVGCircleElement, SimNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x ?? 0
          d.fy = d.y ?? 0
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null
          d.fy = null
        })

      // ── Nodes ────────────────────────────────────────────────────────────
      const nodeGroup = svg.append('g')

      // selection ring (drawn under nodes)
      const ring = nodeGroup
        .selectAll<SVGCircleElement, SimNode>('circle.st-ring')
        .data(simNodes)
        .enter()
        .append('circle')
        .attr('class', 'st-ring')
        .attr('r', d => rad(d.type) + 5)
        .attr('fill', 'none')
        .attr('stroke', '#00D4AA')
        .attr('stroke-width', 1.5)
        .attr('opacity', 0)
        .attr('pointer-events', 'none')

      const node = nodeGroup
        .selectAll<SVGCircleElement, SimNode>('circle.st-node')
        .data(simNodes)
        .enter()
        .append('circle')
        .attr('class',   d => d.type === 'origin' ? 'st-node st-origin-node' : 'st-node')
        .attr('r',       d => rad(d.type))
        .attr('fill',    d => nodeColor(d.type))
        .attr('opacity', 0)
        .attr('cursor',  d => (controlled || d.type === 'bot') ? 'pointer' : 'default')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .call(drag as any)
        .on('mouseover', (event: MouseEvent, d: SimNode) => {
          const rect = containerRef.current?.getBoundingClientRect()
          if (!rect) return
          setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, w: rect.width, node: d })
        })
        .on('mousemove', (event: MouseEvent) => {
          const rect = containerRef.current?.getBoundingClientRect()
          if (!rect) return
          setTooltip(prev =>
            prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null,
          )
        })
        .on('mouseout', () => setTooltip(null))
        .on('click', (event: MouseEvent, d: SimNode) => {
          event.stopPropagation()
          if (controlled) { selectCb.current?.(d, degree.get(d.id) ?? 0); return }
          if (d.type !== 'bot') return
          // Legacy behaviour (network page): highlight edges connected to this bot
          link
            .attr('stroke', (l: SimEdge) => (srcId(l) === d.id || tgtId(l) === d.id ? '#F59E0B' : '#ffffff'))
            .attr('opacity', (l: SimEdge) => (srcId(l) === d.id || tgtId(l) === d.id ? 1 : 0.07))
            .attr('stroke-width', (l: SimEdge) => (srcId(l) === d.id || tgtId(l) === d.id ? 2.5 : 0.3))
        })

      // Entrance animation — nodes spread from center to final positions
      node.transition().duration(reduceMotion ? 0 : 1200)
        .attr('opacity', d => (d.type === 'amplifier' || d.type === 'legitimate') ? 0.8 : 1)
        .on('end', () => { if (!cancelled) readyCb.current?.() })

      // ── Cluster labels (only where a cluster is actually known) ──────────
      const botLabels = nodeGroup
        .selectAll<SVGTextElement, SimNode>('text.st-bot-label')
        .data(simNodes.filter(n => n.type === 'bot' && n.clusterId !== undefined && n.clusterId !== null))
        .enter()
        .append('text')
        .attr('class', 'st-bot-label')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', '#080E1A')
        .attr('font-size', fit ? '8' : '7')
        .attr('font-weight', '700')
        .attr('font-family', FONT)
        .attr('pointer-events', 'none')
        .attr('opacity', 0)
        .text(d => `C${(d.clusterId ?? 0) + 1}`)

      botLabels.transition().duration(reduceMotion ? 0 : 1200).attr('opacity', 1)

      // ── Hub labels: the origin and the most-connected accounts ──────────
      const hubNodes = labelHubs
        ? (() => {
            const top = [...simNodes]
              .filter(n => (degree.get(n.id) ?? 0) > 0)
              .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
              .slice(0, 3)
            const origins = simNodes.filter(n => n.type === 'origin').slice(0, 1)
            return [...new Set([...origins, ...top])]
          })()
        : []
      const hubLabels = nodeGroup
        .selectAll<SVGTextElement, SimNode>('text.st-hub-label')
        .data(hubNodes)
        .enter()
        .append('text')
        .attr('class', 'st-hub-label')
        .attr('text-anchor', 'middle')
        .attr('fill', '#9AA8C1')
        .attr('font-size', fit ? '11' : '10')
        .attr('font-family', FONT)
        .attr('pointer-events', 'none')
        .attr('paint-order', 'stroke')
        .attr('stroke', '#060B15')
        .attr('stroke-width', 3)
        .text(d => d.accountId ?? d.label)

      // ── Legend (optional) ────────────────────────────────────────────────
      if (showLegend) {
        const LEGEND = [
          { color: '#EF4444', r: 6, label: 'Origin C2'   },
          { color: '#F59E0B', r: 5, label: 'Bot Account' },
          { color: '#8B9AB5', r: 4, label: 'Amplifier'   },
          { color: '#00D4AA', r: 4, label: 'Legitimate'  },
        ]
        const lg = svg.append('g').attr('transform', `translate(12,${height - 22})`)
        LEGEND.forEach((item, i) => {
          const g = lg.append('g').attr('transform', `translate(${i * 116},0)`)
          g.append('circle')
            .attr('r', item.r).attr('cx', item.r).attr('cy', 0)
            .attr('fill', item.color).attr('opacity', 0.85)
          g.append('text')
            .attr('x', item.r * 2 + 5).attr('y', 3)
            .attr('fill', '#4A5568')
            .attr('font-size', '9')
            .attr('font-family', FONT)
            .text(item.label)
        })
      }

      // ── Tick ─────────────────────────────────────────────────────────────
      const pad = showLegend ? 0 : 6
      simulation.on('tick', () => {
        const cx = (d: SimNode) => Math.max(rad(d.type) + pad, Math.min(width  - rad(d.type) - pad, d.x ?? 0))
        const cy = (d: SimNode) => Math.max(rad(d.type) + pad, Math.min(height - rad(d.type) - pad, d.y ?? 0))

        link
          .attr('x1', d => cx(d.source as SimNode))
          .attr('y1', d => cy(d.source as SimNode))
          .attr('x2', d => cx(d.target as SimNode))
          .attr('y2', d => cy(d.target as SimNode))

        node.attr('cx', cx).attr('cy', cy)
        ring.attr('cx', cx).attr('cy', cy)
        botLabels.attr('x', cx).attr('y', cy)
        hubLabels.attr('x', cx).attr('y', d => cy(d) - rad(d.type) - 6)
      })

      // apply any selection that already exists (e.g. after a redraw)
      highlight(selectedIdRef.current)
    })

    return () => {
      cancelled = true
      simRef.current?.stop()
      highlightRef.current = null
      setTooltip(null)
    }
    // datasetKey identifies the data; nodes/edges always co-change with it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetKey, resizeTick, showLegend, labelHubs, insetBottom, fit])

  // Reflect the controlled selection without rebuilding the simulation
  useEffect(() => {
    selectedIdRef.current = selectedId
    highlightRef.current?.(selectedId)
  }, [selectedId])

  // Tooltip position — clamp so it doesn't overflow the right edge
  const tipLeft = tooltip ? Math.min(tooltip.x + 14, tooltip.w - 190) : 0
  const tipTop  = tooltip ? Math.max(tooltip.y - 50, 8) : 0

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg ref={svgRef} style={{ display: 'block' }} role="img" aria-label={`Account network for ${campaignName}`} />

      {tooltip && (
        <div
          style={{
            position:        'absolute',
            left:            tipLeft,
            top:             tipTop,
            backgroundColor: '#0F1A2E',
            boxShadow:       'inset 0 0 0 1px rgba(148,163,184,0.2), 0 8px 24px rgba(0,0,0,0.4)',
            borderRadius:    8,
            padding:         '10px 14px',
            fontFamily:      FONT,
            fontSize:        '11.5px',
            color:           '#E6EBF3',
            pointerEvents:   'none',
            zIndex:          20,
            minWidth:        '168px',
          }}
        >
          <div style={{ color: nodeColor(tooltip.node.type), fontSize: '10.5px', marginBottom: '4px', letterSpacing: '0.06em' }}>
            {tooltip.node.type.toUpperCase()}
          </div>
          <div style={{ color: '#9AA8C1', marginBottom: '6px' }}>
            {tooltip.node.accountId ?? tooltip.node.label}
          </div>
          {tooltip.node.posts != null && (
            <div style={{ color: '#75849E', marginBottom: '2px' }}>
              {'Posts: '}<span style={{ color: '#E6EBF3' }}>{tooltip.node.posts.toLocaleString()}</span>
            </div>
          )}
          {tooltip.node.followers != null && (
            <div style={{ color: '#75849E' }}>
              {'Followers: '}<span style={{ color: '#E6EBF3' }}>{tooltip.node.followers.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
