'use client'

import { useEffect, useRef } from 'react'

/**
 * Scroll companion: a rotating 3D globe of accounts that journeys through the
 * entire page. It opens as the hero centrepiece, then shrinks and weaves
 * right → left → right between the sections as you scroll — running its
 * outbreak → detection cycle the whole way — and lands centre-stage at the
 * final CTA. Waypoints are anchored to the real section positions.
 *
 * Pure canvas: fibonacci-sphere nodes, perspective projection, depth fade,
 * mouse parallax, scroll-spin. No 3D runtime, no assets.
 */

type State = 'clean' | 'infected' | 'detected'

interface SurfaceNode {
  ux: number
  uy: number
  uz: number
  r: number
  state: State
  t: number
  seed: number
  neighbors: number[]
  sx: number
  sy: number
  scale: number
  zr: number
}

interface AmbientNode {
  // globe-unit coordinates (multiples of R)
  ux: number
  uy: number
  uz: number
  r: number
  sx: number
  sy: number
  scale: number
  zr: number
}

interface Waypoint {
  y: number   // scrollY at which this waypoint is "centered"
  cx: number  // globe centre, px
  cy: number
  m: number   // radius multiplier
  o: number   // canvas opacity
}

const INFECTED = '#EF4444'
const DETECTED = '#00D4AA'
const CAMERA = 1150

const smooth = (t: number) => t * t * (3 - 2 * t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export default function OutbreakCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let width = 0
    let height = 0
    let R0 = 300 // base globe radius at multiplier 1
    let nodes: SurfaceNode[] = []
    let ambient: AmbientNode[] = []
    let raf = 0
    let running = true

    // Live journey state (smoothly follows the scroll target)
    let cx = 0
    let cy = 0
    let R = 300
    let alpha = 1
    let waypoints: Waypoint[] = []

    // Camera
    let yaw = 0
    const basePitch = 0.32
    let yawOffset = 0
    let pitchOffset = 0
    let targetYawOffset = 0
    let targetPitchOffset = 0

    // Sweep: geodesic ring expanding from a surface origin
    let sweepAngle = -1
    let sweepOrigin: [number, number, number] = [0, 1, 0]

    let phaseClock = 0
    let spreadClock = 0

    // Scroll-driven spin
    let scrollBoost = 0
    let lastScrollY = window.scrollY

    function norm3(x: number, y: number, z: number): [number, number, number] {
      const l = Math.hypot(x, y, z) || 1
      return [x / l, y / l, z / l]
    }

    // Monitoring satellites — ShadowTrace watching the network
    const ORBITS = [
      { radius: 1.42, axis: norm3(0.28, 1, 0.2), speed: 0.00042, phase: 0, sats: 2 },
      { radius: 1.68, axis: norm3(-0.45, 1, -0.3), speed: -0.0003, phase: 2.1, sats: 1 },
    ].map(o => {
      const [ax, ay, az] = o.axis
      let vx = -ay, vy = ax, vz = 0
      const vl = Math.hypot(vx, vy, vz) || 1
      vx /= vl; vy /= vl; vz /= vl
      const wx = ay * vz - az * vy
      const wy = az * vx - ax * vz
      const wz = ax * vy - ay * vx
      return { ...o, v: [vx, vy, vz] as const, w: [wx, wy, wz] as const }
    })

    function computeWaypoints() {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const mobile = vw < 860
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - vh)

      const centerOf = (id: string) => {
        const el = document.getElementById(id)
        if (!el) return null
        return el.offsetTop + el.offsetHeight / 2 - vh / 2
      }

      const heroCx = mobile ? 0.5 : 0.73
      waypoints = [{ y: 0, cx: heroCx * vw, cy: 0.46 * vh, m: 1, o: 1 }]

      const threat = centerOf('threat')
      if (threat !== null) waypoints.push({ y: threat, cx: (mobile ? 0.78 : 0.85) * vw, cy: 0.5 * vh, m: 0.52, o: 0.8 })
      // System: arrive early, beside the heading whitespace — the card grid
      // below is opaque and would swallow the globe at section centre
      const systemEl = document.getElementById('system')
      if (systemEl) {
        waypoints.push({
          y: systemEl.offsetTop - vh * 0.3,
          cx: (mobile ? 0.22 : 0.8) * vw,
          cy: 0.38 * vh,
          m: 0.44,
          o: 0.75,
        })
      }
      // Pipeline: swing to the LEFT, into the open space beside the heading
      const pipeEl = document.getElementById('pipeline')
      if (pipeEl) {
        waypoints.push({
          y: pipeEl.offsetTop - vh * 0.25,
          cx: (mobile ? 0.24 : 0.11) * vw,
          cy: 0.58 * vh,
          m: 0.4,
          o: 0.65,
        })
      }
      const cta = centerOf('cta')
      if (cta !== null) waypoints.push({ y: cta, cx: 0.5 * vw, cy: 0.44 * vh, m: 0.58, o: 0.9 })
      waypoints.push({ y: maxScroll, cx: 0.5 * vw, cy: 0.42 * vh, m: 0.5, o: 0.15 })

      waypoints.sort((a, b) => a.y - b.y)
    }

    function journeyTarget(scroll: number): Waypoint {
      if (waypoints.length === 0) return { y: 0, cx: width * 0.73, cy: height * 0.46, m: 1, o: 1 }
      if (scroll <= waypoints[0].y) return waypoints[0]
      for (let i = 0; i < waypoints.length - 1; i++) {
        const a = waypoints[i]
        const b = waypoints[i + 1]
        if (scroll >= a.y && scroll < b.y) {
          const t = smooth((scroll - a.y) / Math.max(1, b.y - a.y))
          return { y: scroll, cx: lerp(a.cx, b.cx, t), cy: lerp(a.cy, b.cy, t), m: lerp(a.m, b.m, t), o: lerp(a.o, b.o, t) }
        }
      }
      return waypoints[waypoints.length - 1]
    }

    function build() {
      width = window.innerWidth
      height = window.innerHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas!.width = Math.floor(width * dpr)
      canvas!.height = Math.floor(height * dpr)
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)

      const mobile = width < 860
      R0 = Math.min(Math.min(width, height) * (mobile ? 0.34 : 0.295), 310)

      const N = mobile ? 90 : 150
      const GA = Math.PI * (3 - Math.sqrt(5))
      nodes = Array.from({ length: N }, (_, i) => {
        const y = 1 - (2 * i) / (N - 1)
        const rad = Math.sqrt(Math.max(0, 1 - y * y))
        const th = i * GA
        const jitter = 1 + (Math.random() - 0.5) * 0.05
        return {
          ux: Math.cos(th) * rad * jitter,
          uy: y * jitter,
          uz: Math.sin(th) * rad * jitter,
          r: 1.6 + Math.random() * 2.2,
          state: 'clean' as State,
          t: 0,
          seed: Math.random() * Math.PI * 2,
          neighbors: [] as number[],
          sx: 0, sy: 0, scale: 1, zr: 0,
        }
      })

      const linkDist = 2 * Math.sin(Math.PI / Math.sqrt(N)) * 1.42
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const a = nodes[i]
          const b = nodes[j]
          const dx = a.ux - b.ux
          const dy = a.uy - b.uy
          const dz = a.uz - b.uz
          if (dx * dx + dy * dy + dz * dz < linkDist * linkDist) {
            a.neighbors.push(j)
            b.neighbors.push(i)
          }
        }
      }

      ambient = Array.from({ length: mobile ? 14 : 26 }, () => {
        const rr = 1.25 + Math.random() * 0.9
        const th = Math.random() * Math.PI * 2
        const ph = Math.acos(2 * Math.random() - 1)
        return {
          ux: rr * Math.sin(ph) * Math.cos(th),
          uy: rr * Math.cos(ph),
          uz: rr * Math.sin(ph) * Math.sin(th),
          r: 0.8 + Math.random() * 1.4,
          sx: 0, sy: 0, scale: 1, zr: 0,
        }
      })

      computeWaypoints()
      const start = journeyTarget(window.scrollY)
      cx = start.cx
      cy = start.cy
      R = R0 * start.m
      alpha = start.o

      seedOutbreak()
    }

    function seedOutbreak() {
      const zero = nodes[Math.floor(Math.random() * nodes.length)]
      if (zero) {
        zero.state = 'infected'
        zero.t = 0
      }
    }

    function reset() {
      nodes.forEach(n => { n.state = 'clean'; n.t = 0 })
      sweepAngle = -1
      phaseClock = 0
      seedOutbreak()
    }

    function rotate(x: number, y: number, z: number): [number, number, number] {
      const cyw = Math.cos(yaw + yawOffset)
      const syw = Math.sin(yaw + yawOffset)
      const cp = Math.cos(basePitch + pitchOffset)
      const sp = Math.sin(basePitch + pitchOffset)
      const x1 = x * cyw - z * syw
      const z1 = x * syw + z * cyw
      const y2 = y * cp - z1 * sp
      const z2 = y * sp + z1 * cp
      return [x1, y2, z2]
    }

    function projectSurface(n: SurfaceNode) {
      const [x, y, z] = rotate(n.ux * R, n.uy * R, n.uz * R)
      const s = CAMERA / (CAMERA + z)
      n.scale = s
      n.zr = z
      n.sx = cx + x * s
      n.sy = cy + y * s
    }

    function projectAmbient(n: AmbientNode) {
      const [x, y, z] = rotate(n.ux * R, n.uy * R, n.uz * R)
      const s = CAMERA / (CAMERA + z)
      n.scale = s
      n.zr = z
      n.sx = cx + x * s
      n.sy = cy + y * s
    }

    function step(dt: number) {
      phaseClock += dt
      spreadClock += dt
      yaw += dt * 0.00009 + scrollBoost
      scrollBoost *= 0.92
      yawOffset += (targetYawOffset - yawOffset) * 0.045
      pitchOffset += (targetPitchOffset - pitchOffset) * 0.045
      for (const n of nodes) n.t = Math.min(1, n.t + dt * 0.0018)

      // Journey: follow the scroll waypoint smoothly
      const target = journeyTarget(window.scrollY)
      cx = lerp(cx, target.cx, 0.075)
      cy = lerp(cy, target.cy, 0.075)
      R = lerp(R, R0 * target.m, 0.075)
      alpha = lerp(alpha, target.o, 0.09)
      canvas!.style.opacity = alpha.toFixed(3)

      // Contagion along the surface adjacency
      if (spreadClock > 210) {
        spreadClock = 0
        const fresh: number[] = []
        nodes.forEach(n => {
          if (n.state !== 'infected') return
          for (const j of n.neighbors) {
            if (nodes[j].state === 'clean' && Math.random() < 0.30) fresh.push(j)
          }
        })
        for (const j of fresh) {
          nodes[j].state = 'infected'
          nodes[j].t = 0
        }
      }

      // Launch the sweep once the campaign is visibly global
      const infected = nodes.filter(n => n.state === 'infected').length
      if (sweepAngle < 0 && (infected > nodes.length * 0.30 || phaseClock > 10000)) {
        let ox = 0, oy = 0, oz = 0
        for (const n of nodes) {
          if (n.state === 'infected') { ox += n.ux; oy += n.uy; oz += n.uz }
        }
        const len = Math.hypot(ox, oy, oz) || 1
        sweepOrigin = [ox / len, oy / len, oz / len]
        sweepAngle = 0
      }

      if (sweepAngle >= 0) {
        sweepAngle += dt * 0.00062
        const cosSweep = Math.cos(sweepAngle)
        for (const n of nodes) {
          if (n.state !== 'infected') continue
          const dot = n.ux * sweepOrigin[0] + n.uy * sweepOrigin[1] + n.uz * sweepOrigin[2]
          const nl = Math.hypot(n.ux, n.uy, n.uz) || 1
          if (dot / nl > cosSweep) {
            n.state = 'detected'
            n.t = 0
          }
        }
        if (sweepAngle > Math.PI * 1.05) {
          if (phaseClock > 0) phaseClock = -3000
          sweepAngle = -1
        }
      }

      if (phaseClock < 0 && phaseClock + dt >= 0) reset()
    }

    function draw() {
      ctx!.clearRect(0, 0, width, height)

      const glow = ctx!.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.65)
      glow.addColorStop(0, 'rgba(30, 60, 100, 0.16)')
      glow.addColorStop(0.55, 'rgba(18, 38, 68, 0.10)')
      glow.addColorStop(1, 'rgba(8, 14, 26, 0)')
      ctx!.fillStyle = glow
      ctx!.fillRect(cx - R * 1.7, cy - R * 1.7, R * 3.4, R * 3.4)

      for (const n of nodes) projectSurface(n)
      for (const a of ambient) projectAmbient(a)

      // Wireframe edges — depth-fogged
      ctx!.lineWidth = 1
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        for (const j of a.neighbors) {
          if (j <= i) continue
          const b = nodes[j]
          const depth = ((a.scale + b.scale) / 2 - 0.74) / 0.5
          const eAlpha = Math.max(0.04, depth * 0.5)

          let stroke = `rgba(96, 130, 178, ${eAlpha})`
          if (a.state === 'detected' || b.state === 'detected') {
            stroke = `rgba(0, 212, 170, ${Math.max(0.06, depth * 0.55)})`
          } else if (a.state === 'infected' && b.state === 'infected') {
            stroke = `rgba(239, 68, 68, ${Math.max(0.06, depth * 0.6)})`
          } else if (a.state === 'infected' || b.state === 'infected') {
            stroke = `rgba(245, 158, 11, ${Math.max(0.06, depth * 0.62)})`
          }
          ctx!.strokeStyle = stroke
          ctx!.beginPath()
          ctx!.moveTo(a.sx, a.sy)
          ctx!.lineTo(b.sx, b.sy)
          ctx!.stroke()
        }
      }

      // Sweep ring — a true circle on the sphere
      if (sweepAngle > 0.02 && sweepAngle < Math.PI) {
        const [ox, oy, oz] = sweepOrigin
        let vx = -oy, vy = ox, vz = 0
        const vLen = Math.hypot(vx, vy, vz)
        if (vLen < 0.001) { vx = 1; vy = 0; vz = 0 } else { vx /= vLen; vy /= vLen; vz /= vLen }
        const wx = oy * vz - oz * vy
        const wy = oz * vx - ox * vz
        const wz = ox * vy - oy * vx

        const ringR = Math.sin(sweepAngle)
        const ringH = Math.cos(sweepAngle)
        const SAMPLES = 72
        let started = false
        ctx!.beginPath()
        for (let k = 0; k <= SAMPLES; k++) {
          const t = (k / SAMPLES) * Math.PI * 2
          const px = (ox * ringH + (Math.cos(t) * vx + Math.sin(t) * wx) * ringR) * R
          const py = (oy * ringH + (Math.cos(t) * vy + Math.sin(t) * wy) * ringR) * R
          const pz = (oz * ringH + (Math.cos(t) * vz + Math.sin(t) * wz) * ringR) * R
          const [x, y, z] = rotate(px, py, pz)
          const s = CAMERA / (CAMERA + z)
          const sx = cx + x * s
          const sy = cy + y * s
          if (z < 0) {
            if (!started) { ctx!.moveTo(sx, sy); started = true } else ctx!.lineTo(sx, sy)
          } else {
            started = false
          }
        }
        ctx!.strokeStyle = 'rgba(0, 212, 170, 0.75)'
        ctx!.lineWidth = 1.6
        ctx!.shadowBlur = 10
        ctx!.shadowColor = DETECTED
        ctx!.stroke()
        ctx!.shadowBlur = 0
      }

      // Orbit paths + monitoring satellites
      const tNow = performance.now()
      for (const orbit of ORBITS) {
        const [vx, vy, vz] = orbit.v
        const [wx, wy, wz] = orbit.w
        const orbR = R * orbit.radius

        const SAMPLES = 64
        let started = false
        ctx!.beginPath()
        for (let k = 0; k <= SAMPLES; k++) {
          const t = (k / SAMPLES) * Math.PI * 2
          const px = (Math.cos(t) * vx + Math.sin(t) * wx) * orbR
          const py = (Math.cos(t) * vy + Math.sin(t) * wy) * orbR
          const pz = (Math.cos(t) * vz + Math.sin(t) * wz) * orbR
          const [x, y, z] = rotate(px, py, pz)
          const s = CAMERA / (CAMERA + z)
          if (z < 60) {
            const sx = cx + x * s
            const sy = cy + y * s
            if (!started) { ctx!.moveTo(sx, sy); started = true } else ctx!.lineTo(sx, sy)
          } else {
            started = false
          }
        }
        ctx!.strokeStyle = 'rgba(96, 130, 178, 0.16)'
        ctx!.lineWidth = 1
        ctx!.stroke()

        for (let si = 0; si < orbit.sats; si++) {
          const t = tNow * orbit.speed + orbit.phase + (si * Math.PI * 2) / orbit.sats
          const px = (Math.cos(t) * vx + Math.sin(t) * wx) * orbR
          const py = (Math.cos(t) * vy + Math.sin(t) * wy) * orbR
          const pz = (Math.cos(t) * vz + Math.sin(t) * wz) * orbR
          const [x, y, z] = rotate(px, py, pz)
          const s = CAMERA / (CAMERA + z)
          const behind = z > 0
          ctx!.globalAlpha = behind ? 0.35 : 1
          ctx!.shadowBlur = behind ? 0 : 9
          ctx!.shadowColor = DETECTED
          ctx!.fillStyle = DETECTED
          ctx!.beginPath()
          ctx!.arc(cx + x * s, cy + y * s, 2.1 * s, 0, Math.PI * 2)
          ctx!.fill()
          ctx!.shadowBlur = 0
          ctx!.globalAlpha = 1
        }
      }

      // Ambient particles
      for (const a of ambient) {
        const aAlpha = 0.14 + 0.4 * Math.max(0, (a.scale - 0.7))
        ctx!.fillStyle = `rgba(110, 140, 185, ${aAlpha})`
        ctx!.beginPath()
        ctx!.arc(a.sx, a.sy, a.r * a.scale, 0, Math.PI * 2)
        ctx!.fill()
      }

      // Surface nodes, far → near
      const order = [...nodes].sort((a, b) => b.zr - a.zr)
      const now = performance.now()
      for (const n of order) {
        const depth = Math.max(0, Math.min(1, (n.scale - 0.74) / 0.5))
        const baseAlpha = 0.18 + 0.82 * depth
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.0022 + n.seed)

        if (n.state === 'infected') {
          const r = (n.r + 1.0 + pulse * 1.2) * n.scale
          ctx!.globalAlpha = baseAlpha
          ctx!.shadowBlur = 13 * depth
          ctx!.shadowColor = INFECTED
          ctx!.fillStyle = INFECTED
          ctx!.beginPath()
          ctx!.arc(n.sx, n.sy, r, 0, Math.PI * 2)
          ctx!.fill()
          ctx!.shadowBlur = 0
        } else if (n.state === 'detected') {
          const r = (n.r + 0.8) * n.scale
          ctx!.globalAlpha = baseAlpha
          ctx!.shadowBlur = 11 * depth
          ctx!.shadowColor = DETECTED
          ctx!.fillStyle = DETECTED
          ctx!.beginPath()
          ctx!.arc(n.sx, n.sy, r, 0, Math.PI * 2)
          ctx!.fill()
          ctx!.shadowBlur = 0

          if (depth > 0.45) {
            const ease = 1 - Math.pow(1 - Math.min(1, n.t * 3.2), 3)
            const box = (15 - 7.5 * ease) * n.scale
            const rAlpha = 0.9 * (1 - Math.max(0, n.t * 1.4 - 0.5)) * depth
            if (rAlpha > 0.02) {
              ctx!.strokeStyle = `rgba(0, 212, 170, ${rAlpha})`
              ctx!.lineWidth = 1.2
              const c = 4 * n.scale
              const corners: [number, number, number, number][] = [
                [-box, -box, 1, 1], [box, -box, -1, 1], [-box, box, 1, -1], [box, box, -1, -1],
              ]
              for (const [oxx, oyy, sxx, syy] of corners) {
                ctx!.beginPath()
                ctx!.moveTo(n.sx + oxx, n.sy + oyy + syy * c)
                ctx!.lineTo(n.sx + oxx, n.sy + oyy)
                ctx!.lineTo(n.sx + oxx + sxx * c, n.sy + oyy)
                ctx!.stroke()
              }
            }
          }
        } else {
          const r = (n.r + 0.4) * n.scale
          ctx!.globalAlpha = baseAlpha
          ctx!.fillStyle = 'rgba(100, 134, 182, 0.95)'
          ctx!.beginPath()
          ctx!.arc(n.sx, n.sy, r, 0, Math.PI * 2)
          ctx!.fill()
          ctx!.strokeStyle = 'rgba(150, 182, 224, 0.55)'
          ctx!.lineWidth = 0.8
          ctx!.stroke()
        }
        ctx!.globalAlpha = 1
      }
    }

    let last = performance.now()
    function frame(now: number) {
      if (!running) return
      const dt = Math.min(48, now - last)
      last = now
      step(dt)
      draw()
      raf = requestAnimationFrame(frame)
    }

    function onMove(e: PointerEvent) {
      const nx = e.clientX / window.innerWidth - 0.5
      const ny = e.clientY / window.innerHeight - 0.5
      targetYawOffset = nx * 0.5
      targetPitchOffset = ny * 0.32
    }
    function onLeave() {
      targetYawOffset = 0
      targetPitchOffset = 0
    }
    function onScroll() {
      const y = window.scrollY
      scrollBoost = Math.max(-0.035, Math.min(0.035, scrollBoost + (y - lastScrollY) * 0.00005))
      lastScrollY = y
    }

    build()
    if (reduced) {
      nodes.forEach((n, i) => { n.state = i % 3 === 0 ? 'detected' : 'clean' })
      for (const n of nodes) projectSurface(n)
      draw()
    } else {
      raf = requestAnimationFrame(frame)
    }

    // Section positions shift as fonts/ticker load — refresh the route
    const wpTimer = setInterval(computeWaypoints, 2000)

    const onResize = () => build()
    window.addEventListener('resize', onResize)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerleave', onLeave)
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      running = false
      cancelAnimationFrame(raf)
      clearInterval(wpTimer)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        zIndex: 1,
        pointerEvents: 'none',
      }}
    />
  )
}
