'use client'

import { usePathname, useRouter } from 'next/navigation'
import { openCommandPalette } from './CommandPalette'

const VIEW_NAMES: Record<string, string> = {
  '/dashboard':                 'MISSION CONTROL',
  '/dashboard/whatsapp':        'WHATSAPP INTEL',
  '/dashboard/image-forensics': 'IMAGE FORENSICS',
  '/dashboard/account-intel':   'ACCOUNT INTELLIGENCE',
  '/dashboard/network':         'NETWORK INTELLIGENCE',
  '/dashboard/alerts':          'ALERT FEED',
  '/dashboard/agents':          'AI AGENTS',
  '/dashboard/reports':         'REPORTS',
}

const MONO: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono, "Fira Code", monospace)',
}

export default function Topbar() {
  const pathname = usePathname()
  const router = useRouter()
  const viewName = VIEW_NAMES[pathname] ?? 'MISSION CONTROL'

  return (
    <header
      style={{
        height: '44px',
        flexShrink: 0,
        backgroundColor: '#080E1A',
        borderBottom: '1px solid #1E2D4A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px 0 16px',
        gap: '16px',
      }}
    >
      {/* Breadcrumb */}
      <div
        style={{
          ...MONO,
          fontSize: '11px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0,
        }}
      >
        <span style={{ color: '#4A5568', letterSpacing: '0.12em' }}>SHADOWTRACE</span>
        <span style={{ color: '#1E2D4A' }}>/</span>
        <span style={{ color: '#E2E8F0', letterSpacing: '0.06em' }}>{viewName}</span>
      </div>

      {/* Global search / command palette trigger — fills the middle */}
      <button
        onClick={openCommandPalette}
        title="Search (⌘K)"
        style={{
          ...MONO,
          flex: 1,
          maxWidth: '420px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '5px 10px',
          fontSize: '11px',
          color: '#4A5568',
          backgroundColor: '#0D1526',
          border: '1px solid #1E2D4A',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
        className="st-icon-btn"
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '7px', overflow: 'hidden' }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ flexShrink: 0 }}>
            <circle cx="7" cy="7" r="5" />
            <line x1="11" y1="11" x2="14.5" y2="14.5" />
          </svg>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Search campaigns, accounts, claims…
          </span>
        </span>
        <kbd style={{ fontSize: '9px', color: '#334160', flexShrink: 0 }}>⌘K</kbd>
      </button>

      {/* Right cluster: status chips + notifications */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            ...MONO,
            fontSize: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
          className="st-topbar-status"
        >
          <span style={{ color: '#22C55E', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span
              className="st-pulse-dot"
              style={{ display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#22C55E' }}
            />
            LIVE
          </span>
          <span style={{ color: '#4A5568' }}>3 CAMPAIGNS</span>
          <span style={{ color: '#4A5568' }}>SYS: NOMINAL</span>
        </div>

        <button
          onClick={() => router.push('/dashboard/alerts')}
          title="Open alert feed"
          aria-label="Notifications"
          className="st-icon-btn"
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '26px',
            height: '26px',
            border: '1px solid #1E2D4A',
            borderRadius: '6px',
            background: 'transparent',
            color: '#4A5568',
            cursor: 'pointer',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 2C5.8 2 4 3.8 4 6v4l-1.5 1.5h11L12 10V6c0-2.2-1.8-4-4-4z" />
            <path d="M6.5 12c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5" />
          </svg>
          <span
            style={{
              position: 'absolute',
              top: '3px',
              right: '4px',
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              backgroundColor: '#EF4444',
            }}
          />
        </button>
      </div>
    </header>
  )
}
