'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { openCommandPalette } from './CommandPalette'

// Ordered as the investigation story: analyze content → trace the message →
// verify the media → unmask the accounts → map the network → alerts → agents
const NAV_ITEMS = [
  { label: 'Mission Control',    short: 'HOME',    href: '/dashboard' },
  { label: 'WhatsApp Intel',     short: 'WHATSAPP', href: '/dashboard/whatsapp' },
  { label: 'Image Forensics',    short: 'IMAGE',   href: '/dashboard/image-forensics' },
  { label: 'Account Intelligence', short: 'ACCT',  href: '/dashboard/account-intel' },
  { label: 'Network Intelligence', short: 'NETWORK', href: '/dashboard/network' },
  { label: 'Alert Feed',         short: 'ALERTS',  href: '/dashboard/alerts' },
  { label: 'AI Agents',          short: 'AGENTS',  href: '/dashboard/agents' },
  { label: 'Reports',            short: 'REPORTS', href: '/dashboard/reports' },
]

const AGENTS = [
  { name: 'ContentAnalyzer',  status: 'online' },
  { name: 'NetworkMapper',    status: 'online' },
  { name: 'ThreatClassifier', status: 'online' },
  { name: 'DeepfakeDetector', status: 'online' },
]

const MONO: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono, "Fira Code", monospace)',
}

const SIDEBAR_COLLAPSE_KEY = 'st.sidebar.collapsed'

const ICONS: Record<string, React.ReactNode> = {
    '/dashboard': (
      <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
        <rect x="1" y="1" width="6" height="6" /><rect x="9" y="1" width="6" height="6" />
        <rect x="1" y="9" width="6" height="6" /><rect x="9" y="9" width="6" height="6" />
      </svg>
    ),
    '/dashboard/network': (
      <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="3" r="2" /><circle cx="2" cy="13" r="2" /><circle cx="14" cy="13" r="2" />
        <line x1="8" y1="5" x2="2" y2="11" /><line x1="8" y1="5" x2="14" y2="11" />
      </svg>
    ),
    '/dashboard/alerts': (
      <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M8 2C5.8 2 4 3.8 4 6v4l-1.5 1.5h11L12 10V6c0-2.2-1.8-4-4-4z" />
        <path d="M6.5 12c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5" />
      </svg>
    ),
    '/dashboard/whatsapp': (
      <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M8 1.5A6.5 6.5 0 0 0 2.3 11L1.5 14.5 5 13.7A6.5 6.5 0 1 0 8 1.5z" />
        <path d="M5.5 6.5c.5 2 2 3.5 4 4l1-1 1.5 1" />
      </svg>
    ),
    '/dashboard/image-forensics': (
      <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1.5" y="2.5" width="13" height="11" /><circle cx="5.5" cy="6" r="1.25" />
        <path d="M1.5 11l4-3.5 3 2.5 3-3 3 3.5" />
      </svg>
    ),
    '/dashboard/agents': (
      <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="4" width="10" height="9" /><line x1="6" y1="1" x2="6" y2="4" />
        <line x1="10" y1="1" x2="10" y2="4" /><circle cx="6" cy="8" r="1" fill="currentColor" />
        <circle cx="10" cy="8" r="1" fill="currentColor" /><path d="M5.5 11h5" />
      </svg>
    ),
    '/dashboard/account-intel': (
      <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="5" cy="5" r="2.5" /><path d="M1 14c0-2.2 1.8-4 4-4s4 1.8 4 4" />
        <circle cx="11.5" cy="5" r="2" /><path d="M10.5 9.5c2.5 0 4.5 1.6 4.5 4.5" />
      </svg>
    ),
    '/dashboard/reports': (
      <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 1h7l3 3v11H3V1z" /><line x1="5" y1="7" x2="11" y2="7" />
        <line x1="5" y1="10" x2="11" y2="10" /><line x1="5" y1="4" x2="8" y2="4" />
      </svg>
    ),
}

export function BottomTabBar() {
  const pathname = usePathname()

  return (
    <nav
      className="st-bottom-tabs"
      style={{
        display:         'none', // shown via CSS on mobile
        position:        'fixed',
        bottom:          0,
        left:            0,
        right:           0,
        height:          '56px',
        backgroundColor: '#080E1A',
        borderTop:       '1px solid #1E2D4A',
        zIndex:          50,
      }}
    >
      {NAV_ITEMS.map(item => {
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              flex:           1,
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            '3px',
              color:          isActive ? '#00D4AA' : '#4A5568',
              textDecoration: 'none',
            }}
          >
            {ICONS[item.href]}
            <span
              style={{
                ...MONO,
                fontSize:      '8px',
                letterSpacing: '0.06em',
              }}
            >
              {item.short}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // Read persisted collapse state once on mount (avoids SSR/client mismatch
  // by rendering the default expanded state until hydrated).
  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY)
    if (stored === '1') setCollapsed(true)
    setHydrated(true)
  }, [])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? '1' : '0')
      return next
    })
  }

  const width = collapsed ? '60px' : '212px'

  return (
    <aside
      className="st-sidebar"
      style={{
        width,
        flexShrink: 0,
        backgroundColor: '#080E1A',
        borderRight: '1px solid #1E2D4A',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: hydrated ? 'width 0.16s cubic-bezier(0.2,0.7,0.3,1)' : 'none',
      }}
    >
      {/* Logo + collapse toggle */}
      <div
        style={{
          padding: collapsed ? '16px 0' : '14px 16px',
          borderBottom: '1px solid #1E2D4A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: '8px',
        }}
      >
        {!collapsed && (
          <span
            style={{
              ...MONO,
              fontSize: '10px',
              letterSpacing: '0.2em',
              color: '#4A5568',
              whiteSpace: 'nowrap',
            }}
          >
            SHADOWTRACE
          </span>
        )}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-pressed={collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '22px',
            height: '22px',
            flexShrink: 0,
            border: '1px solid #1E2D4A',
            borderRadius: '4px',
            background: 'transparent',
            color: '#4A5568',
            cursor: 'pointer',
          }}
          className="st-icon-btn"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            {collapsed ? <path d="M6 3l5 5-5 5" /> : <path d="M10 3l-5 5 5 5" />}
          </svg>
        </button>
      </div>

      {/* Global search / command palette trigger */}
      <div style={{ padding: collapsed ? '12px 8px 4px' : '12px 12px 4px' }}>
        <button
          onClick={openCommandPalette}
          title="Search (⌘K)"
          style={{
            ...MONO,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            gap: '6px',
            padding: collapsed ? '7px 0' : '7px 10px',
            fontSize: '11px',
            color: '#4A5568',
            backgroundColor: '#0D1526',
            border: '1px solid #1E2D4A',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
          className="st-icon-btn"
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="7" cy="7" r="5" />
              <line x1="11" y1="11" x2="14.5" y2="14.5" />
            </svg>
            {!collapsed && <span>Search…</span>}
          </span>
          {!collapsed && <kbd style={{ fontSize: '9px', color: '#334160' }}>⌘K</kbd>}
        </button>
      </div>

      {/* Navigation */}
      <nav style={{ paddingTop: '12px', paddingBottom: '8px' }} aria-label="Primary">
        {!collapsed && (
          <div
            style={{
              ...MONO,
              fontSize: '9px',
              letterSpacing: '0.18em',
              color: '#4A5568',
              padding: '0 16px 8px',
            }}
          >
            NAVIGATION
          </div>
        )}
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              className="st-nav-link"
              style={{
                ...MONO,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: collapsed ? '9px 0' : '8px 16px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                fontSize: '13px',
                color: isActive ? '#E2E8F0' : '#4A5568',
                backgroundColor: isActive ? '#0D1526' : 'transparent',
                borderLeft: isActive ? '2px solid #00D4AA' : '2px solid transparent',
                textDecoration: 'none',
              }}
            >
              <span style={{ display: 'flex', flexShrink: 0 }}>{ICONS[item.href]}</span>
              {!collapsed && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, whiteSpace: 'nowrap' }}>
                  {item.label}
                  {item.href === '/dashboard/network' && (
                    <span style={{ fontSize: '8px', letterSpacing: '0.1em', color: '#22C55E', display: 'flex', alignItems: 'center' }}>
                      <span
                        className="st-pulse-dot"
                        style={{
                          display: 'inline-block',
                          width: '5px',
                          height: '5px',
                          borderRadius: '50%',
                          backgroundColor: '#22C55E',
                          marginRight: '4px',
                        }}
                      />
                      LIVE
                    </span>
                  )}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Agent Status */}
      <div
        style={{
          marginTop: 'auto',
          borderTop: '1px solid #1E2D4A',
          paddingTop: '12px',
          paddingBottom: '16px',
        }}
      >
        {!collapsed && (
          <div
            style={{
              ...MONO,
              fontSize: '9px',
              letterSpacing: '0.18em',
              color: '#4A5568',
              padding: '0 16px 8px',
            }}
          >
            AGENT STATUS
          </div>
        )}
        {AGENTS.map((agent) => (
          <div
            key={agent.name}
            title={collapsed ? `${agent.name} — online` : undefined}
            style={{
              ...MONO,
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'space-between',
              padding: collapsed ? '5px 0' : '4px 16px',
              fontSize: '11px',
              color: '#4A5568',
            }}
          >
            {!collapsed && <span>{agent.name}</span>}
            <span style={{ color: '#22C55E', fontSize: '9px' }}>●</span>
          </div>
        ))}
      </div>
    </aside>
  )
}
