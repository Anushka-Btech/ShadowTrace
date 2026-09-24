'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const MONO: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono, "Fira Code", monospace)',
}

// Only routes that actually exist in this app. Do not add destinations
// that don't resolve — a command palette that 404s is worse than none.
type Command = {
  id: string
  label: string
  group: 'NAVIGATE' | 'ACTION'
  href?: string
  keywords: string
  run?: () => void
  hint?: string
}

const NAV_COMMANDS: Command[] = [
  { id: 'nav-overview',   label: 'Mission Control',   group: 'NAVIGATE', href: '/dashboard',                  keywords: 'overview dashboard home mission control' },
  { id: 'nav-whatsapp',   label: 'WhatsApp Intel',    group: 'NAVIGATE', href: '/dashboard/whatsapp',          keywords: 'whatsapp intel messages forward' },
  { id: 'nav-forensics',  label: 'Image Forensics',   group: 'NAVIGATE', href: '/dashboard/image-forensics',   keywords: 'image forensics deepfake media manipulation' },
  { id: 'nav-account',    label: 'Account Intelligence', group: 'NAVIGATE', href: '/dashboard/account-intel',  keywords: 'account intelligence profile risk coordination' },
  { id: 'nav-network',    label: 'Network Intelligence', group: 'NAVIGATE', href: '/dashboard/network',        keywords: 'network graph cluster nodes relationships' },
  { id: 'nav-alerts',     label: 'Alert Feed',        group: 'NAVIGATE', href: '/dashboard/alerts',            keywords: 'alerts feed critical warning' },
  { id: 'nav-agents',     label: 'AI Agents',         group: 'NAVIGATE', href: '/dashboard/agents',            keywords: 'agents ai swarm consensus' },
  { id: 'nav-reports',    label: 'Reports',           group: 'NAVIGATE', href: '/dashboard/reports',           keywords: 'reports export summary' },
]

const OPEN_EVENT = 'st:open-command-palette'

/** Any control (e.g. the topbar search button) can open the palette by
 * dispatching `window.dispatchEvent(new Event('st:open-command-palette'))`. */
export function openCommandPalette() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_EVENT))
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const filtered = NAV_COMMANDS.filter((c) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return c.label.toLowerCase().includes(q) || c.keywords.includes(q)
  })

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        return
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    function onOpenRequest() {
      setOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener(OPEN_EVENT, onOpenRequest)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener(OPEN_EVENT, onOpenRequest)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      // Focus after the entrance transition starts so it doesn't jank.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  function runCommand(cmd: Command) {
    setOpen(false)
    if (cmd.href) router.push(cmd.href)
    if (cmd.run) cmd.run()
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = filtered[activeIndex]
      if (cmd) runCommand(cmd)
    }
  }

  if (!open) return null

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        justifyContent: 'center',
        paddingTop: '14vh',
        backgroundColor: 'rgba(4, 7, 14, 0.72)',
        backdropFilter: 'blur(2px)',
        animation: 'st-cmdk-backdrop 0.12s ease',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        style={{
          width: '560px',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0D1526',
          border: '1px solid #26375C',
          borderRadius: '10px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,212,170,0.04)',
          overflow: 'hidden',
          animation: 'st-cmdk-panel 0.14s cubic-bezier(0.2, 0.7, 0.3, 1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            borderBottom: '1px solid #1E2D4A',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#4A5568" strokeWidth="1.5">
            <circle cx="7" cy="7" r="5" />
            <line x1="11" y1="11" x2="14.5" y2="14.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Jump to a view…"
            aria-label="Search commands"
            style={{
              ...MONO,
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#E2E8F0',
              fontSize: '13px',
              letterSpacing: '0.02em',
            }}
          />
          <kbd
            style={{
              ...MONO,
              fontSize: '10px',
              color: '#4A5568',
              border: '1px solid #1E2D4A',
              borderRadius: '4px',
              padding: '2px 6px',
            }}
          >
            ESC
          </kbd>
        </div>

        <div style={{ overflowY: 'auto', padding: '6px' }}>
          {filtered.length === 0 && (
            <div style={{ ...MONO, fontSize: '12px', color: '#4A5568', padding: '20px 12px', textAlign: 'center' }}>
              No matching views for &ldquo;{query}&rdquo;
            </div>
          )}

          {filtered.length > 0 && (
            <div style={{ ...MONO, fontSize: '9px', letterSpacing: '0.16em', color: '#4A5568', padding: '8px 10px 4px' }}>
              NAVIGATE
            </div>
          )}

          {filtered.map((cmd, i) => {
            const isActive = i === activeIndex
            return (
              <button
                key={cmd.id}
                onClick={() => runCommand(cmd)}
                onMouseEnter={() => setActiveIndex(i)}
                style={{
                  ...MONO,
                  width: '100%',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  fontSize: '13px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  color: isActive ? '#E2E8F0' : '#8B9AB5',
                  backgroundColor: isActive ? '#152240' : 'transparent',
                }}
              >
                <span>{cmd.label}</span>
                {isActive && <span style={{ fontSize: '10px', color: '#00D4AA' }}>↵</span>}
              </button>
            )
          })}
        </div>
      </div>

      <style>{`
        @keyframes st-cmdk-backdrop { from { opacity: 0 } to { opacity: 1 } }
        @keyframes st-cmdk-panel { from { opacity: 0; transform: translateY(-6px) scale(0.98) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @media (prefers-reduced-motion: reduce) {
          [role="presentation"], [role="dialog"] { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
