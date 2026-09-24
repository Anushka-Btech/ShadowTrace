import type { CSSProperties, ReactNode } from 'react'
import { SEV_COLOR, type Sev } from '@/lib/mission'
import type { InputKind } from '@/lib/investigate'

export function SevChip({ sev, children }: { sev: Sev; children?: ReactNode }) {
  return <span className={`mc-chip sev-${sev}`}>{children ?? sev}</span>
}

/** Thin horizontal bar; `value` is 0-100. */
export function Track({ value, sev, delay = 0 }: { value: number; sev?: Sev; delay?: number }) {
  const v = Math.max(0, Math.min(100, value))
  const style: CSSProperties = { width: `${v}%`, animationDelay: `${delay}ms` }
  if (!sev) style.background = 'var(--teal)'
  return (
    <div className="mc-track" role="presentation">
      <i className={sev ? `sev-${sev}` : undefined} style={style} />
    </div>
  )
}

export function Skel({ w, h = 14, style, className }: { w: number | string; h?: number; style?: CSSProperties; className?: string }) {
  return <div className={`mc-skel${className ? ` ${className}` : ''}`} style={{ width: w, height: h, ...style }} aria-hidden="true" />
}

export function scoreColor(sev: Sev): string {
  return SEV_COLOR[sev]
}

// ─── Icons (16px, stroke) ─────────────────────────────────────────────────────

const base = {
  width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function KindIcon({ kind }: { kind: InputKind }) {
  switch (kind) {
    case 'text':
      return <svg {...base}><path d="M3 4h10M3 8h10M3 12h6" /></svg>
    case 'url':
      return <svg {...base}><path d="M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.7.7" /><path d="M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l.7-.7" /></svg>
    case 'account':
      return <svg {...base}><circle cx="8" cy="5.5" r="2.5" /><path d="M3 13.5c.5-2.6 2.4-4 5-4s4.5 1.4 5 4" /></svg>
    case 'image':
      return <svg {...base}><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><circle cx="6" cy="6.5" r="1" /><path d="M13.5 11l-3.5-3.5L4 13" /></svg>
    case 'claim':
      return <svg {...base}><path d="M3 3.5h10v7H8l-3 2.5v-2.5H3z" /></svg>
  }
}

export function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  )
}
