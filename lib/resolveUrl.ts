/**
 * URL ingestion for "Start investigation → URL".
 *
 * The analysis backend takes text (and image URLs) — it cannot open a web page.
 * This adapter fetches a page server-side and reduces it to readable text so
 * the real pipeline can analyse it. It does no analysis of its own.
 *
 * Because it makes server-side requests to a user-supplied address, it is
 * hardened against SSRF:
 *   • http/https only, default ports only
 *   • every resolved address is validated AT CONNECT TIME via a custom `lookup`
 *     (so a DNS-rebinding answer cannot swap in a private IP after a pre-check)
 *   • IP-literal hosts are validated up front (Node skips `lookup` for those)
 *   • redirects are followed manually (max 3) and re-validated at each hop
 *   • response size, time and content-type are capped
 *
 * No Next.js imports — usable from tests with plain Node.
 */

import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import zlib from 'node:zlib'

export type ResolveErrorCode =
  | 'invalid_url' | 'blocked' | 'unreachable' | 'unsupported' | 'timeout' | 'no_text'

export class ResolveError extends Error {
  code: ResolveErrorCode
  constructor(code: ResolveErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'ResolveError'
  }
}

export interface ResolvedPage {
  url:       string        // final URL after redirects
  host:      string
  title:     string
  text:      string        // readable text, capped
  chars:     number        // characters of readable text before capping
  truncated: boolean
}

const MAX_BYTES     = 1_500_000
const MAX_TEXT      = 6_000
const MAX_REDIRECTS = 3
const TIMEOUT_MS    = 8_000

// ─── Address validation ───────────────────────────────────────────────────────

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0
}

const V4_BLOCKS: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
]

function blockedV4(ip: string): boolean {
  const n = ipv4ToInt(ip)
  return V4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
    return (n & mask) >>> 0 === (ipv4ToInt(base) & mask) >>> 0
  })
}

/** Expand an IPv6 literal into 8 16-bit groups. */
function expandV6(ip: string): number[] | null {
  let s = ip.split('%')[0]
  const v4tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (v4tail) {
    const n = ipv4ToInt(v4tail[1])
    s = s.replace(v4tail[1], `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`)
  }
  const [head, tail] = s.split('::')
  const h = head ? head.split(':') : []
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : []
  const fill = tail !== undefined ? 8 - h.length - t.length : 0
  if (fill < 0) return null
  const groups = [...h, ...Array(fill).fill('0'), ...t].map(g => parseInt(g || '0', 16))
  return groups.length === 8 && groups.every(g => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null
}

function blockedV6(ip: string): boolean {
  const g = expandV6(ip)
  if (!g) return true
  if (g.every(x => x === 0)) return true                              // ::
  if (g.slice(0, 7).every(x => x === 0) && g[7] === 1) return true   // ::1
  if ((g[0] & 0xfe00) === 0xfc00) return true                        // fc00::/7  ULA
  if ((g[0] & 0xffc0) === 0xfe80) return true                        // fe80::/10 link-local
  if ((g[0] & 0xff00) === 0xff00) return true                        // ff00::/8  multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true                // documentation
  if (g[0] === 0x0064 && g[1] === 0xff9b) return true                // NAT64
  // IPv4-mapped / compatible → validate the embedded v4 address
  if (g.slice(0, 5).every(x => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    const v4 = `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`
    return blockedV4(v4)
  }
  return false
}

export function isBlockedAddress(ip: string): boolean {
  const fam = net.isIP(ip)
  if (fam === 4) return blockedV4(ip)
  if (fam === 6) return blockedV6(ip)
  return true
}

// ─── Fetching ─────────────────────────────────────────────────────────────────

interface Options { allowPrivate?: boolean }

function makeLookup(allowPrivate: boolean) {
  return (
    hostname: string,
    options: dns.LookupOptions,
    callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void,
  ) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, [])
      const list = addresses as dns.LookupAddress[]
      if (!allowPrivate && (list.length === 0 || list.some(a => isBlockedAddress(a.address)))) {
        const e: NodeJS.ErrnoException = new Error('blocked address')
        e.code = 'ST_BLOCKED'
        return callback(e, [])
      }
      if (options.all) return callback(null, list)
      callback(null, list[0].address, list[0].family)
    })
  }
}

function parseTarget(raw: string): URL {
  let u: URL
  try { u = new URL(raw.trim()) } catch { throw new ResolveError('invalid_url', 'That is not a valid web address.') }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new ResolveError('invalid_url', 'Only http and https links can be investigated.')
  }
  if (u.username || u.password) throw new ResolveError('invalid_url', 'Links with embedded credentials are not supported.')
  const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80)
  if (port !== 80 && port !== 443) throw new ResolveError('blocked', 'Only standard web ports are allowed.')
  return u
}

interface RawResponse { status: number; headers: http.IncomingHttpHeaders; body: Buffer }

function fetchOnce(u: URL, opts: Options): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const host = u.hostname.replace(/^\[|\]$/g, '')
    if (net.isIP(host) && !opts.allowPrivate && isBlockedAddress(host)) {
      return reject(new ResolveError('blocked', 'That address is not reachable from ShadowTrace.'))
    }
    const lib = u.protocol === 'https:' ? https : http
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: host,
        port:     u.port || (u.protocol === 'https:' ? 443 : 80),
        path:     `${u.pathname}${u.search}`,
        method:   'GET',
        lookup:   makeLookup(!!opts.allowPrivate) as never,
        timeout:  TIMEOUT_MS,
        headers: {
          'User-Agent':      'ShadowTraceBot/1.0 (+content investigation)',
          'Accept':          'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en,hi;q=0.8',
        },
      },
      res => {
        const enc = String(res.headers['content-encoding'] ?? '').toLowerCase()
        let stream: NodeJS.ReadableStream = res
        if (enc.includes('br'))        stream = res.pipe(zlib.createBrotliDecompress())
        else if (enc.includes('gzip')) stream = res.pipe(zlib.createGunzip())
        else if (enc.includes('deflate')) stream = res.pipe(zlib.createInflate())

        const chunks: Buffer[] = []
        let size = 0
        stream.on('data', (c: Buffer) => {
          size += c.length
          if (size > MAX_BYTES) {           // keep what we have; readable text is at the top
            chunks.push(c.subarray(0, c.length - (size - MAX_BYTES)))
            res.destroy()
            resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) })
            return
          }
          chunks.push(c)
        })
        stream.on('end',   () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }))
        stream.on('error', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }))
      },
    )
    req.on('timeout', () => { req.destroy(); reject(new ResolveError('timeout', 'The page took too long to respond.')) })
    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err instanceof ResolveError) return reject(err)
      if (err.code === 'ST_BLOCKED') return reject(new ResolveError('blocked', 'That address is not reachable from ShadowTrace.'))
      reject(new ResolveError('unreachable', 'Could not reach that address.'))
    })
    req.end()
  })
}

// ─── Text extraction ──────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…',
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' '
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

function metaContent(html: string, key: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i')
  const tag = html.match(re)?.[0]
  const val = tag?.match(/content=["']([^"']*)["']/i)?.[1]
  return val ? decodeEntities(val).trim() : ''
}

export function extractReadable(html: string): { title: string; text: string } {
  const title =
    metaContent(html, 'og:title') ||
    decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim() ||
    decodeEntities(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, ' ') ?? '').replace(/\s+/g, ' ').trim()
  const description = metaContent(html, 'og:description') || metaContent(html, 'description')

  let body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|canvas)[\s\S]*?<\/\1>/gi, ' ')

  const region =
    body.match(/<article[\s\S]*?<\/article>/i)?.[0] ??
    body.match(/<main[\s\S]*?<\/main>/i)?.[0] ??
    body.match(/<body[\s\S]*<\/body>/i)?.[0] ??
    body
  body = region.length > 400 ? region : body

  body = body
    .replace(/<(nav|header|footer|aside|form|button|select|option)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|section|article|blockquote|figcaption|table)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')

  const lines = decodeEntities(body)
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l.length >= 40 || /[.!?।]$/.test(l))

  let text = lines.join('\n')
  if (description && !text.includes(description.slice(0, 40))) text = `${description}\n${text}`
  return { title, text: text.trim() }
}

function decodeBody(buf: Buffer, contentType: string): string {
  const charset =
    contentType.match(/charset=([\w-]+)/i)?.[1] ??
    buf.subarray(0, 2048).toString('latin1').match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
    'utf-8'
  try { return new TextDecoder(charset).decode(buf) } catch { return new TextDecoder('utf-8').decode(buf) }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function resolveUrl(raw: string, opts: Options = {}): Promise<ResolvedPage> {
  let url = parseTarget(raw)

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetchOnce(url, opts)

    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      if (hop === MAX_REDIRECTS) throw new ResolveError('unreachable', 'Too many redirects.')
      try { url = parseTarget(new URL(String(res.headers.location), url).toString()) }
      catch (e) { throw e instanceof ResolveError ? e : new ResolveError('invalid_url', 'The page redirected somewhere invalid.') }
      continue
    }
    if (res.status >= 400) {
      throw new ResolveError('unreachable', `The site answered with HTTP ${res.status}.`)
    }

    const type = String(res.headers['content-type'] ?? '')
    if (!/text\/html|application\/xhtml|text\/plain/i.test(type)) {
      throw new ResolveError('unsupported', 'That link is not a web page or text. For pictures, use Image.')
    }

    const decoded = decodeBody(res.body, type)
    const { title, text } = /text\/plain/i.test(type)
      ? { title: '', text: decoded.replace(/\s+\n/g, '\n').trim() }
      : extractReadable(decoded)

    if (text.length < 40) {
      throw new ResolveError('no_text', 'No readable text found on that page — it may load its content with JavaScript.')
    }
    return {
      url:       url.toString(),
      host:      url.hostname.replace(/^www\./, ''),
      title:     title.slice(0, 200),
      text:      text.slice(0, MAX_TEXT),
      chars:     text.length,
      truncated: text.length > MAX_TEXT,
    }
  }
  throw new ResolveError('unreachable', 'Too many redirects.')
}
