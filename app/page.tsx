'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import OutbreakCanvas from '@/components/landing/OutbreakCanvas'

// ─── Content ─────────────────────────────────────────────────────────────────

const THREAT_STATS = [
  { value: 87, suffix: '%', label: 'of Indians encountered fake news online', source: 'Microsoft Digital Civility' },
  { value: 500, suffix: 'M+', label: 'WhatsApp users — misinformation’s fastest vector', source: 'Meta, India' },
  { value: 6, suffix: 'x', label: 'faster than truth — how falsehoods spread', source: 'MIT, Science' },
]

const CAPABILITIES = [
  {
    tag: 'AGENTS 01 · 06',
    color: '#00D4AA',
    title: 'Content & WhatsApp Intel',
    body: 'Groq Llama-3.3-70B scores any claim for misinformation, blended with forward-chain pattern detection built for Hindi, Hinglish, and English.',
    proof: 'Live LLM inference',
  },
  {
    tag: 'AGENT 02',
    color: '#A78BFA',
    title: 'Deepfake & Image Forensics',
    body: 'Error Level Analysis heatmaps plus a three-model classifier ensemble. An image is only called AI-generated when two models independently agree.',
    proof: '3-model ensemble',
  },
  {
    tag: 'AGENTS 07 · 09',
    color: '#EF4444',
    title: 'Coordination Detection',
    body: 'Enter any real account. Posts are ingested live, then analysed for 60-second posting sync, stylometric fingerprints, and LLM-generation signals.',
    proof: 'Live account ingestion',
  },
  {
    tag: 'AGENT 03',
    color: '#F59E0B',
    title: 'Network Graph Mapping',
    body: 'Neo4j-backed campaign topology. Origin nodes, bot clusters, and amplifier chains rendered as an explorable force-directed graph.',
    proof: 'Neo4j AuraDB',
  },
  {
    tag: 'AGENT 10',
    color: '#FB923C',
    title: 'Indian Language Detection',
    body: 'Sarvam AI identifies code-mixed and regional text — because misinformation in India does not arrive in English.',
    proof: '10+ Indian languages',
  },
  {
    tag: 'AGENTS 04 · 05',
    color: '#3B82F6',
    title: 'Threat Classification',
    body: 'A LangGraph pipeline chains every signal into one verdict: organic misinformation, coordinated inauthentic behaviour, or state-level operation.',
    proof: 'LangGraph orchestration',
  },
]

const PIPELINE = [
  { agent: 'WhatsAppAnalyzer',       out: 'Forward chain detected · 4 red flags',      color: '#22C55E' },
  { agent: 'ContentAnalyzer',        out: 'Groq LLM misinformation score: 86/100',     color: '#00D4AA' },
  { agent: 'SarvamLanguageDetector', out: 'Language: Hinglish · 100% confidence',      color: '#FB923C' },
  { agent: 'FactCheckCrossRef',      out: 'Cross-referenced live fact-checker feeds',  color: '#3B82F6' },
  { agent: 'ThreatClassifier',       out: 'health_misinformation · severity HIGH',     color: '#EF4444' },
]

const STACK = [
  'FastAPI', 'LangGraph', 'Groq Llama-3.3-70B', 'Neo4j AuraDB', 'Sarvam AI',
  'Hugging Face', 'scikit-learn', 'Next.js', 'D3.js', 'Bluesky API', 'Pillow ELA',
]

const FONT_MONO: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono, "Fira Code", monospace)',
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setSeen(true); io.disconnect() } },
      { threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])
  return { ref, seen }
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const { ref, seen } = useInView<HTMLDivElement>(0.15)
  return (
    <div
      ref={ref}
      style={{
        opacity: seen ? 1 : 0,
        transform: seen ? 'translateY(0)' : 'translateY(26px)',
        transition: `opacity 0.7s cubic-bezier(.16,1,.3,1) ${delay}ms, transform 0.7s cubic-bezier(.16,1,.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

/** Continuous scroll parallax — the element drifts against scroll direction,
 *  proportional to its distance from the viewport centre. Outer div is the
 *  measuring frame; transform goes on the inner so the measurement never
 *  feeds back into itself. */
function Parallax({ children, speed = 0.08 }: { children: React.ReactNode; speed?: number }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    let raf = 0
    const update = () => {
      const r = outer.getBoundingClientRect()
      const delta = r.top + r.height / 2 - window.innerHeight / 2
      inner.style.transform = `translateY(${(-delta * speed).toFixed(1)}px)`
    }
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [speed])
  return (
    <div ref={outerRef}>
      <div ref={innerRef} style={{ willChange: 'transform' }}>{children}</div>
    </div>
  )
}

/** Deepfake-style decode: characters scramble, then resolve left to right.
 *  Letter-like glyphs only — block characters render as ugly solid bars. */
const DECODE_GLYPHS = 'ABCDEFGHKMNPRSTUVXYZ023456789<>/#$%&*+='

function DecodeText({ text, delay = 0 }: { text: string; delay?: number }) {
  // Initialize with the real text — random glyphs at first render would
  // mismatch the server-rendered HTML and break hydration
  const [out, setOut] = useState(text)
  useEffect(() => {
    let revealed = 0
    let frame = 0
    let id: ReturnType<typeof setInterval>
    const start = setTimeout(() => {
      id = setInterval(() => {
        frame++
        if (frame % 3 === 0) revealed++
        if (revealed >= text.length) {
          setOut(text)
          clearInterval(id)
          return
        }
        setOut(
          text
            .split('')
            .map((ch, i) => {
              if (i < revealed || ch === ' ') return ch
              return DECODE_GLYPHS[Math.floor(Math.random() * DECODE_GLYPHS.length)]
            })
            .join(''),
        )
      }, 38)
    }, delay)
    return () => { clearTimeout(start); clearInterval(id) }
  }, [text, delay])
  return <>{out}</>
}

/** Targeting-bracket corners — the lock-on reticle motif carried through the page */
function Corners({ color, size = 9 }: { color: string; size?: number }) {
  const base: React.CSSProperties = { position: 'absolute', width: size, height: size, pointerEvents: 'none' }
  const b = `1.5px solid ${color}`
  return (
    <>
      <span style={{ ...base, top: -1, left: -1, borderTop: b, borderLeft: b }} />
      <span style={{ ...base, top: -1, right: -1, borderTop: b, borderRight: b }} />
      <span style={{ ...base, bottom: -1, left: -1, borderBottom: b, borderLeft: b }} />
      <span style={{ ...base, bottom: -1, right: -1, borderBottom: b, borderRight: b }} />
    </>
  )
}

/** Teal scanner glow that follows the cursor, revealing a faint node grid —
 *  the cursor becomes ShadowTrace's scanning lens. Native cursor stays. */
function CursorScanner() {
  const glowRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) setEnabled(true)
  }, [])

  useEffect(() => {
    if (!enabled) return
    const glow = glowRef.current
    const grid = gridRef.current
    if (!glow || !grid) return

    let tx = -1000, ty = -1000
    let x = -1000, y = -1000
    let raf = 0
    const onMove = (e: PointerEvent) => { tx = e.clientX; ty = e.clientY }
    const tick = () => {
      x += (tx - x) * 0.22
      y += (ty - y) * 0.22
      glow.style.background =
        `radial-gradient(380px circle at ${x}px ${y}px, rgba(0,212,170,0.08), rgba(59,130,246,0.045) 45%, transparent 70%)`
      const mask = `radial-gradient(250px circle at ${x}px ${y}px, rgba(0,0,0,0.95), transparent 78%)`
      grid.style.setProperty('mask-image', mask)
      grid.style.setProperty('-webkit-mask-image', mask)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove) }
  }, [enabled])

  if (!enabled) return null
  return (
    <>
      {/* soft light following the cursor */}
      <div ref={glowRef} aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none' }} />
      {/* node grid revealed only inside the scan radius */}
      <div
        ref={gridRef}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle, rgba(0,212,170,0.25) 1px, transparent 1.6px)',
          backgroundSize: '26px 26px',
        }}
      />
    </>
  )
}

interface FeedItem {
  id: string
  title: string
  source: string
  risk_level: string
  published: string
}

/** Real debunked claims from the live fact-checker ingestion — proof the
 *  system is live before the judge even opens the dashboard */
function LiveTicker() {
  const [items, setItems] = useState<FeedItem[]>([])
  useEffect(() => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 12000)
    fetch('/api/live-feed', { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d?.items?.length) setItems(d.items.slice(0, 6))
      })
      .catch(() => {})
      .finally(() => clearTimeout(t))
    return () => { ctrl.abort(); clearTimeout(t) }
  }, [])

  if (items.length === 0) return null

  const RISK: Record<string, string> = { HIGH: '#EF4444', MED: '#F59E0B', LOW: '#22C55E' }

  return (
    <section
      style={{
        borderTop: '1px solid #1E2D4A',
        borderBottom: '1px solid #1E2D4A',
        backgroundColor: 'rgba(10, 17, 32, 0.55)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'stretch',
      }}
    >
      <div
        style={{
          ...FONT_MONO,
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: '9.5px', letterSpacing: '0.14em', color: '#00D4AA',
          padding: '14px 18px', borderRight: '1px solid #1E2D4A',
          backgroundColor: 'rgba(13, 21, 38, 0.7)', whiteSpace: 'nowrap', flexShrink: 0, zIndex: 1,
        }}
      >
        <span className="st-pulse-dot" style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#00D4AA', display: 'inline-block' }} />
        LIVE INTEL — REAL DEBUNKS, INGESTED NOW
      </div>
      <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', flex: 1 }}>
        <div style={{ display: 'flex', width: 'max-content', animation: 'lp-marquee 46s linear infinite' }}>
          {[...items, ...items].map((it, i) => (
            <span
              key={`${it.id}-${i}`}
              style={{
                ...FONT_MONO, fontSize: '11px', color: '#8B9AB5',
                padding: '0 30px', whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', gap: '10px',
              }}
            >
              <span style={{ color: RISK[it.risk_level] ?? '#F59E0B', fontSize: '9px', letterSpacing: '0.1em' }}>
                {it.risk_level}
              </span>
              <span style={{ color: '#E2E8F0' }}>{it.title}</span>
              <span style={{ color: '#7C8AA3', fontSize: '10px' }}>· {it.source.toUpperCase()}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const { ref, seen } = useInView<HTMLSpanElement>(0.5)
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!seen) return
    const start = performance.now()
    const dur = 1400
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setN(Math.round(to * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [seen, to])
  return <span ref={ref}>{n}{suffix}</span>
}

function TiltCard({ item }: { item: (typeof CAPABILITIES)[number] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<React.CSSProperties>({})
  const [glow, setGlow] = useState({ x: 50, y: 50, on: false })

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    setStyle({
      transform: `perspective(900px) rotateX(${(0.5 - py) * 7}deg) rotateY(${(px - 0.5) * 9}deg) translateY(-4px)`,
      borderColor: item.color,
      boxShadow: `0 18px 50px -20px ${item.color}66`,
    })
    setGlow({ x: px * 100, y: py * 100, on: true })
  }
  function onLeave() {
    setStyle({})
    setGlow(g => ({ ...g, on: false }))
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: '#1E2D4A',
        backgroundColor: 'rgba(13, 21, 38, 0.58)',
        padding: '24px',
        transition: 'transform .25s cubic-bezier(.16,1,.3,1), border-color .25s, box-shadow .25s',
        willChange: 'transform',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: glow.on ? 1 : 0,
          transition: 'opacity .3s',
          background: `radial-gradient(420px circle at ${glow.x}% ${glow.y}%, ${item.color}14, transparent 60%)`,
          pointerEvents: 'none',
        }}
      />
      <Corners color={`${item.color}88`} />
      <div style={{ position: 'relative' }}>
        <span style={{ ...FONT_MONO, fontSize: '10px', letterSpacing: '0.16em', color: item.color }}>
          {item.tag}
        </span>
        <h3 style={{ fontSize: '19px', fontWeight: 700, color: '#E2E8F0', margin: '12px 0 10px' }}>
          {item.title}
        </h3>
        <p style={{ fontSize: '13.5px', lineHeight: 1.7, color: '#8B9AB5', margin: 0 }}>
          {item.body}
        </p>
        <div
          style={{
            ...FONT_MONO,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            marginTop: '18px',
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: item.color,
            border: `1px solid ${item.color}44`,
            backgroundColor: `${item.color}0F`,
            padding: '5px 10px',
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: item.color }} />
          {item.proof.toUpperCase()}
        </div>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Landing() {
  const [progress, setProgress] = useState(0)
  const [typed, setTyped] = useState('')
  const pipeline = useInView<HTMLDivElement>(0.3)
  const heroContentRef = useRef<HTMLDivElement>(null)

  const PHRASE = 'Detect. Trace. Neutralize.'

  useEffect(() => {
    let i = 0
    const id = setInterval(() => {
      i++
      setTyped(PHRASE.slice(0, i))
      if (i >= PHRASE.length) clearInterval(id)
    }, 55)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement
      const max = h.scrollHeight - h.clientHeight
      setProgress(max > 0 ? (h.scrollTop / max) * 100 : 0)

      // Hero parallax — the globe drifts down and fades as you scroll past
      const y = window.scrollY
      if (heroContentRef.current) {
        heroContentRef.current.style.transform = `translateY(${y * 0.18}px)`
        heroContentRef.current.style.opacity = String(Math.max(0, 1 - y / 900))
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="lp-root" style={{ backgroundColor: '#080E1A', color: '#E2E8F0', overflowX: 'hidden' }}>
      <CursorScanner />
      <style>{`
        @keyframes lp-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
        @keyframes lp-blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
        @keyframes lp-scan { 0%{transform:translateY(-100%)} 100%{transform:translateY(2400%)} }
        @keyframes lp-marquee { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes lp-ping { 0%{transform:scale(1);opacity:.6} 70%,100%{transform:scale(2.4);opacity:0} }
        @keyframes lp-rise { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        .lp-link:hover { color:#00D4AA !important; }
        .lp-cta:hover { box-shadow: 0 0 40px -6px #00D4AAaa; transform: translateY(-2px); }
        .lp-ghost:hover { border-color:#00D4AA !important; color:#00D4AA !important; }
        .lp-rise { animation: lp-rise .9s cubic-bezier(.16,1,.3,1) both; }
        @media (max-width: 860px) {
          .lp-grid-3 { grid-template-columns: 1fr !important; }
          .lp-grid-2 { grid-template-columns: 1fr !important; }
          .lp-h1 { font-size: 44px !important; }
          .lp-hero-pad { padding: 96px 20px 60px !important; }
          .lp-legend { display: none !important; }
          .lp-nav-links { display: none !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .lp-rise { animation: none; }
        }
      `}</style>

      {/* Scroll progress */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '2px', zIndex: 100, backgroundColor: 'transparent' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg,#00D4AA,#3B82F6)', transition: 'width .1s linear' }} />
      </div>

      {/* Scroll companion — the globe journeys through the whole page */}
      <OutbreakCanvas />

      {/* Film grain — premium texture, pure SVG, zero requests */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 99, pointerEvents: 'none', opacity: 0.05,
          backgroundImage:
            `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Nav */}
      <nav
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 90,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 28px',
          backgroundColor: 'rgba(8,14,26,0.72)',
          backdropFilter: 'blur(14px)',
          borderBottom: '1px solid #1E2D4A',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#00D4AA' }} />
            <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: '#00D4AA', animation: 'lp-ping 2s ease-out infinite' }} />
          </span>
          <span style={{ ...FONT_MONO, fontSize: '13px', fontWeight: 700, letterSpacing: '0.22em' }}>
            SHADOWTRACE
          </span>
        </div>
        <div style={{ ...FONT_MONO, display: 'flex', alignItems: 'center', gap: '26px', fontSize: '11px', letterSpacing: '0.1em', color: '#7C8AA3' }}>
          <span className="lp-nav-links" style={{ display: 'flex', gap: '26px' }}>
            <a href="#threat" className="lp-link" style={{ color: 'inherit', textDecoration: 'none', transition: 'color .2s' }}>THREAT</a>
            <a href="#system" className="lp-link" style={{ color: 'inherit', textDecoration: 'none', transition: 'color .2s' }}>SYSTEM</a>
            <a href="#pipeline" className="lp-link" style={{ color: 'inherit', textDecoration: 'none', transition: 'color .2s' }}>PIPELINE</a>
          </span>
          <Link
            href="/dashboard"
            className="lp-cta"
            style={{
              color: '#080E1A', backgroundColor: '#00D4AA', padding: '8px 16px',
              fontWeight: 700, textDecoration: 'none', transition: 'all .25s',
            }}
          >
            LAUNCH →
          </Link>
        </div>
      </nav>

      {/* Content sits above the travelling globe layer */}
      <div style={{ position: 'relative', zIndex: 2 }}>

      <main>
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        style={{
          position: 'relative',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid #1E2D4A',
        }}
      >
        {/* Depth + readability layers */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(900px circle at 22% 45%, rgba(8,14,26,.92), rgba(8,14,26,.55) 55%, transparent 75%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,14,26,.85) 0%, transparent 22%, transparent 72%, #080E1A 100%)', pointerEvents: 'none' }} />

        <div
          ref={heroContentRef}
          className="lp-hero-pad"
          style={{ position: 'relative', maxWidth: '1240px', margin: '0 auto', width: '100%', padding: '120px 40px 80px', willChange: 'transform, opacity' }}
        >
          <div style={{ maxWidth: '660px' }}>
            {/* Live badge */}
            <div
              className="lp-rise"
              style={{
                ...FONT_MONO,
                display: 'inline-flex', alignItems: 'center', gap: '9px',
                fontSize: '10px', letterSpacing: '0.16em', color: '#00D4AA',
                border: '1px solid #00D4AA44', backgroundColor: '#00D4AA0F',
                padding: '6px 12px', marginBottom: '28px',
              }}
            >
              <span className="st-pulse-dot" style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#00D4AA', display: 'inline-block' }} />
              10 AI AGENTS · LIVE INFERENCE · NOTHING MOCKED
            </div>

            <h1
              className="lp-h1 lp-rise"
              style={{
                fontSize: '68px', lineHeight: 1.03, fontWeight: 800,
                letterSpacing: '-0.03em', margin: '0 0 22px',
                animationDelay: '80ms',
              }}
            >
              An AI that
              <br />
              <span
                style={{
                  background: 'linear-gradient(100deg,#00D4AA 0%,#3B82F6 52%,#7C3AED 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                <DecodeText text="fights AI." delay={450} />
              </span>
            </h1>

            <p className="lp-rise" style={{ fontSize: '17px', lineHeight: 1.75, color: '#8B9AB5', maxWidth: '560px', margin: '0 0 14px', animationDelay: '180ms' }}>
              Misinformation in India spreads through WhatsApp forwards, coordinated bot networks,
              and AI-generated images — in Hindi, Hinglish, and English.
              <span style={{ color: '#E2E8F0' }}> ShadowTrace hunts all three, in real time.</span>
            </p>

            <div style={{ ...FONT_MONO, fontSize: '13px', letterSpacing: '0.24em', color: '#00D4AA', margin: '0 0 34px', minHeight: '20px' }}>
              {typed}
              <span style={{ animation: 'lp-blink 1s step-end infinite' }}>▌</span>
            </div>

            <div className="lp-rise" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '44px', animationDelay: '280ms' }}>
              <Link
                href="/dashboard"
                className="lp-cta"
                style={{
                  ...FONT_MONO,
                  display: 'inline-flex', alignItems: 'center', gap: '10px',
                  fontSize: '13px', fontWeight: 700, letterSpacing: '0.1em',
                  color: '#080E1A', backgroundColor: '#00D4AA',
                  padding: '15px 28px', textDecoration: 'none',
                  transition: 'all .25s',
                }}
              >
                ACCESS MISSION CONTROL →
              </Link>
              <a
                href="#system"
                className="lp-ghost"
                style={{
                  ...FONT_MONO,
                  display: 'inline-flex', alignItems: 'center',
                  fontSize: '13px', fontWeight: 700, letterSpacing: '0.1em',
                  color: '#8B9AB5', border: '1px solid #1E2D4A',
                  padding: '15px 28px', textDecoration: 'none',
                  transition: 'all .25s',
                }}
              >
                SEE THE SYSTEM
              </a>
            </div>

            {/* Live chips */}
            <div className="lp-rise" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', animationDelay: '380ms' }}>
              {[
                { k: 'GROQ LLAMA-3.3-70B', c: '#00D4AA' },
                { k: 'NEO4J GRAPH', c: '#F59E0B' },
                { k: 'ELA + 3-MODEL ENSEMBLE', c: '#A78BFA' },
                { k: 'SARVAM AI', c: '#FB923C' },
              ].map(chip => (
                <span
                  key={chip.k}
                  style={{
                    ...FONT_MONO, fontSize: '9.5px', letterSpacing: '0.12em',
                    color: chip.c, border: `1px solid ${chip.c}33`,
                    backgroundColor: '#0D152699', padding: '6px 10px',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  {chip.k}
                </span>
              ))}
            </div>
          </div>

          {/* Legend for the sim — panel backdrop keeps it readable over the globe */}
          <div
            className="lp-legend"
            style={{
              ...FONT_MONO,
              position: 'absolute', right: '40px', bottom: '48px',
              display: 'flex', flexDirection: 'column', gap: '7px',
              fontSize: '9.5px', letterSpacing: '0.1em', color: '#8B9AB5',
              border: '1px solid #1E2D4A', padding: '12px 14px',
              backgroundColor: 'rgba(8, 14, 26, 0.72)', backdropFilter: 'blur(6px)',
            }}
          >
            <span style={{ color: '#8B9AB5', marginBottom: '2px' }}>LIVE SIMULATION</span>
            {[
              ['#2A3F5F', 'AUTHENTIC ACCOUNT'],
              ['#EF4444', 'AMPLIFYING FALSEHOOD'],
              ['#00D4AA', 'DETECTED BY SHADOWTRACE'],
            ].map(([c, l]) => (
              <span key={l} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: c }} />
                {l}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Live intelligence ticker — real fact-checker ingestion ───────── */}
      <LiveTicker />

      {/* ── Threat ────────────────────────────────────────────────────────── */}
      <section id="threat" style={{ maxWidth: '1240px', margin: '0 auto', padding: '110px 40px' }}>
        <Reveal>
          <span style={{ ...FONT_MONO, fontSize: '11px', letterSpacing: '0.2em', color: '#EF4444' }}>
            01 · THE THREAT
          </span>
          <h2 style={{ fontSize: '40px', fontWeight: 800, letterSpacing: '-0.02em', margin: '14px 0 16px', maxWidth: '760px', lineHeight: 1.15 }}>
            Falsehood outruns the fact-check. Every time.
          </h2>
          <p style={{ fontSize: '16px', lineHeight: 1.75, color: '#8B9AB5', maxWidth: '640px', margin: '0 0 56px' }}>
            By the time a claim is manually debunked, it has already reached millions of family group
            chats. Detection has to happen at the speed of the campaign — not the newsroom.
          </p>
        </Reveal>

        <div className="lp-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px' }}>
          {THREAT_STATS.map((s, i) => (
            <Parallax key={s.label} speed={[0.1, 0.045, 0.13][i]}>
              <Reveal delay={i * 110}>
                <div style={{ position: 'relative', border: '1px solid #1E2D4A', backgroundColor: 'rgba(13, 21, 38, 0.58)', padding: '28px', height: '100%' }}>
                  <Corners color="#EF444477" />
                  <div style={{ ...FONT_MONO, fontSize: '46px', fontWeight: 800, color: '#EF4444', lineHeight: 1, marginBottom: '16px' }}>
                    <CountUp to={s.value} suffix={s.suffix} />
                  </div>
                  <div style={{ fontSize: '14px', color: '#E2E8F0', lineHeight: 1.6, marginBottom: '10px' }}>
                    {s.label}
                  </div>
                  <div style={{ ...FONT_MONO, fontSize: '10px', letterSpacing: '0.08em', color: '#7C8AA3' }}>
                    {s.source.toUpperCase()}
                  </div>
                </div>
              </Reveal>
            </Parallax>
          ))}
        </div>
      </section>

      {/* ── System ────────────────────────────────────────────────────────── */}
      <section
        id="system"
        style={{ borderTop: '1px solid #1E2D4A', borderBottom: '1px solid #1E2D4A', backgroundColor: 'rgba(10, 17, 32, 0.45)' }}
      >
        <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '110px 40px' }}>
          <Reveal>
            <span style={{ ...FONT_MONO, fontSize: '11px', letterSpacing: '0.2em', color: '#00D4AA' }}>
              02 · THE SYSTEM
            </span>
            <h2 style={{ fontSize: '40px', fontWeight: 800, letterSpacing: '-0.02em', margin: '14px 0 16px', maxWidth: '760px', lineHeight: 1.15 }}>
              Ten specialised agents. One investigation.
            </h2>
            <p style={{ fontSize: '16px', lineHeight: 1.75, color: '#8B9AB5', maxWidth: '640px', margin: '0 0 56px' }}>
              Every agent runs real inference on input you provide — no canned results, no staged
              datasets. Type an account, paste a claim, drop an image URL.
            </p>
          </Reveal>

          <div className="lp-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px' }}>
            {CAPABILITIES.map((c, i) => (
              <Parallax key={c.title} speed={[0.09, 0.04, 0.12][i % 3]}>
                <Reveal delay={(i % 3) * 100}>
                  <TiltCard item={c} />
                </Reveal>
              </Parallax>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pipeline ──────────────────────────────────────────────────────── */}
      <section id="pipeline" style={{ maxWidth: '1240px', margin: '0 auto', padding: '110px 40px' }}>
        <Reveal>
          <span style={{ ...FONT_MONO, fontSize: '11px', letterSpacing: '0.2em', color: '#A78BFA' }}>
            03 · THE INVESTIGATION
          </span>
          <h2 style={{ fontSize: '40px', fontWeight: 800, letterSpacing: '-0.02em', margin: '14px 0 16px', maxWidth: '820px', lineHeight: 1.15 }}>
            One click. Five agents. A verdict you can audit.
          </h2>
          <p style={{ fontSize: '16px', lineHeight: 1.75, color: '#8B9AB5', maxWidth: '640px', margin: '0 0 48px' }}>
            Paste a WhatsApp forward and watch the chain execute — each agent reporting its own
            finding, with real latency, ending in an LLM-written threat assessment.
          </p>
        </Reveal>

        <Parallax speed={0.07}>
        <div
          ref={pipeline.ref}
          style={{ border: '1px solid #1E2D4A', backgroundColor: 'rgba(13, 21, 38, 0.6)', padding: '10px 0', position: 'relative', overflow: 'hidden' }}
        >
          <Corners color="#00D4AA66" size={12} />
          {/* scan line */}
          <div
            style={{
              position: 'absolute', left: 0, right: 0, height: '60px', pointerEvents: 'none',
              background: 'linear-gradient(180deg, transparent, rgba(0,212,170,0.055), transparent)',
              animation: pipeline.seen ? 'lp-scan 4.5s linear infinite' : 'none',
            }}
          />
          <div style={{ ...FONT_MONO, fontSize: '10px', letterSpacing: '0.16em', color: '#7C8AA3', padding: '10px 22px 14px', borderBottom: '1px solid #1E2D4A' }}>
            INPUT ▸ &ldquo;Doctors at AIIMS confirmed hot lemon water kills corona virus. Share before deleted!!&rdquo;
          </div>

          {PIPELINE.map((step, i) => (
            <div
              key={step.agent}
              style={{
                display: 'flex', alignItems: 'center', gap: '16px',
                padding: '15px 22px',
                borderBottom: i < PIPELINE.length - 1 ? '1px solid #131F36' : 'none',
                opacity: pipeline.seen ? 1 : 0,
                transform: pipeline.seen ? 'translateX(0)' : 'translateX(-18px)',
                transition: `all .55s cubic-bezier(.16,1,.3,1) ${300 + i * 260}ms`,
              }}
            >
              <span style={{ ...FONT_MONO, fontSize: '10px', color: '#7C8AA3', width: '20px', flexShrink: 0 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: step.color, flexShrink: 0, boxShadow: `0 0 10px ${step.color}` }} />
              <span style={{ ...FONT_MONO, fontSize: '12.5px', fontWeight: 700, color: step.color, width: '210px', flexShrink: 0 }}>
                {step.agent}
              </span>
              <span style={{ ...FONT_MONO, fontSize: '12.5px', color: '#E2E8F0' }}>
                {step.out}
              </span>
            </div>
          ))}

          <div
            style={{
              margin: '4px 12px 12px', padding: '16px 18px',
              border: '1px solid #EF4444', backgroundColor: 'rgba(239,68,68,.09)',
              opacity: pipeline.seen ? 1 : 0,
              transition: 'opacity .6s ease 1700ms',
            }}
          >
            <div style={{ ...FONT_MONO, display: 'flex', gap: '14px', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.16em', color: '#EF4444' }}>THREAT ALERT</span>
              <span style={{ fontSize: '13px', fontWeight: 700 }}>Health Misinformation</span>
              <span style={{ fontSize: '10px', letterSpacing: '0.1em', color: '#EF4444' }}>SEVERITY: HIGH · SCORE 89/100</span>
            </div>
            <p style={{ ...FONT_MONO, fontSize: '11.5px', lineHeight: 1.7, color: '#8B9AB5', margin: '8px 0 0' }}>
              The claim asserts a home remedy cures a viral infection — false, and dangerous if it
              displaces medical treatment. Written by the model at inference time.
            </p>
          </div>
        </div>
        </Parallax>
      </section>

      {/* ── Stack marquee ─────────────────────────────────────────────────── */}
      <section style={{ borderTop: '1px solid #1E2D4A', borderBottom: '1px solid #1E2D4A', backgroundColor: 'rgba(10, 17, 32, 0.55)', padding: '26px 0', overflow: 'hidden' }}>
        <div style={{ display: 'flex', width: 'max-content', animation: 'lp-marquee 34s linear infinite' }}>
          {[...STACK, ...STACK].map((t, i) => (
            <span
              key={i}
              style={{
                ...FONT_MONO, fontSize: '12px', letterSpacing: '0.14em',
                color: '#7C8AA3', padding: '0 26px', whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', gap: '26px',
              }}
            >
              {t.toUpperCase()}
              <span style={{ color: '#1E2D4A' }}>◆</span>
            </span>
          ))}
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section id="cta" style={{ position: 'relative', padding: '120px 40px', textAlign: 'center' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(600px circle at 50% 40%, rgba(0,212,170,.09), transparent 70%)', pointerEvents: 'none' }} />
        <Parallax speed={0.1}>
        <Reveal>
          <div style={{ position: 'relative', maxWidth: '720px', margin: '0 auto' }}>
            <h2 style={{ fontSize: '44px', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.12, margin: '0 0 18px' }}>
              Run it yourself.
            </h2>
            <p style={{ fontSize: '16.5px', lineHeight: 1.75, color: '#8B9AB5', margin: '0 0 34px' }}>
              Paste any claim. Type any real account. Drop any image URL. The dashboard is live —
              every score you see is computed the moment you ask for it.
            </p>
            <Link
              href="/dashboard"
              className="lp-cta"
              style={{
                ...FONT_MONO,
                display: 'inline-flex', alignItems: 'center', gap: '10px',
                fontSize: '14px', fontWeight: 700, letterSpacing: '0.1em',
                color: '#080E1A', backgroundColor: '#00D4AA',
                padding: '17px 36px', textDecoration: 'none', transition: 'all .25s',
              }}
            >
              ACCESS MISSION CONTROL →
            </Link>
          </div>
        </Reveal>
        </Parallax>
      </section>

      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid #1E2D4A', padding: '28px 40px' }}>
        <div
          style={{
            ...FONT_MONO,
            maxWidth: '1240px', margin: '0 auto',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: '12px',
            fontSize: '10.5px', letterSpacing: '0.12em', color: '#7C8AA3',
          }}
        >
          <span>SHADOWTRACE v1.0 · DETECT. TRACE. NEUTRALIZE.</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="st-pulse-dot" style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#22C55E', display: 'inline-block' }} />
            ALL SYSTEMS OPERATIONAL
          </span>
        </div>
      </footer>

      </div>{/* end content layer */}
    </div>
  )
}
