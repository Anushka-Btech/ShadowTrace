/**
 * URL resolver: address classifier, SSRF refusals, and page extraction.
 *   Run:  node --experimental-strip-types --no-warnings tests/resolveUrl.test.mts
 * No dependencies. Needs Node 22+. The success-path fixtures bind port 80 (see note below).
 */
import http from 'node:http'
import zlib from 'node:zlib'
import { resolveUrl, isBlockedAddress, extractReadable, ResolveError } from '../lib/resolveUrl.ts'

let pass = 0, fail = 0
const ok = (name: string, cond: boolean, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`) }

// ── 1. address classifier
const blocked = ['127.0.0.1','10.1.2.3','172.16.5.5','172.31.255.255','192.168.0.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','255.255.255.255',
                 '::1','::','fe80::1','fc00::1','fd12:3456::1','ff02::1','::ffff:127.0.0.1','::ffff:10.0.0.1','::ffff:7f00:1','64:ff9b::1','2001:db8::1']
const allowed = ['8.8.8.8','1.1.1.1','93.184.216.34','172.15.0.1','172.32.0.1','2606:4700:4700::1111','2a00:1450:4009:81c::200e','::ffff:8.8.8.8']
for (const ip of blocked) ok(`blocks ${ip}`, isBlockedAddress(ip))
for (const ip of allowed) ok(`allows ${ip}`, !isBlockedAddress(ip))

// ── 2. live SSRF attempts through the public entry point (default options = strict)
const attacks = ['http://127.0.0.1/', 'http://localhost/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.5/', 'http://2130706433/', 'http://0x7f.1/', 'http://[::ffff:127.0.0.1]/', 'http://0.0.0.0/', 'http://192.168.1.1/', 'http://127.1/']
for (const a of attacks) {
  try { await resolveUrl(a); ok(`SSRF ${a}`, false, 'was NOT blocked') }
  catch (e) { ok(`SSRF ${a}`, e instanceof ResolveError && (e.code === 'blocked'), e instanceof ResolveError ? e.code : String(e)) }
}
for (const [u, code] of [['ftp://example.com/x','invalid_url'],['file:///etc/passwd','invalid_url'],['javascript:alert(1)','invalid_url'],['not a url','invalid_url'],['http://user:pw@example.com/','invalid_url'],['http://example.com:8080/','blocked'],['http://example.com:22/','blocked']] as const) {
  try { await resolveUrl(u); ok(`reject ${u}`, false) } catch (e) { ok(`reject ${u}`, e instanceof ResolveError && e.code === code, e instanceof ResolveError ? e.code : String(e)) }
}

// ── 3. success path against a local fixture (port 80 so parseTarget allows it; allowPrivate is the test-only switch)
const ARTICLE = `<!doctype html><html><head><meta charset="utf-8"><title>Fallback title</title>
<meta property="og:title" content="Officials deny &quot;secret&quot; poll changes">
<meta name="description" content="A short description of the story."></head>
<body><nav><a>Home</a><a>World</a></nav><script>var x = "SHOULD NOT APPEAR";</script><style>.a{color:red}</style>
<article><h1>Officials deny secret poll changes</h1>
<p>Election officials said on Tuesday that no voting dates had been altered in any district, contradicting a viral message.</p>
<p>The message claimed 847 machines were pre-programmed; the commission called that claim &ldquo;baseless&rdquo; &amp; fabricated.</p>
<p>Short.</p></article><footer>Copyright junk footer text that should be removed entirely from output</footer></body></html>`
const big = '<html><body><article>' + '<p>' + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do. '.repeat(30) + '</p>'.repeat(1) .repeat(1) + '</article></body></html>'
const server = http.createServer((req, res) => {
  const u = req.url ?? ''
  if (u === '/article')   { res.writeHead(200, {'content-type':'text/html; charset=utf-8'}); return res.end(ARTICLE) }
  if (u === '/gzip')      { res.writeHead(200, {'content-type':'text/html','content-encoding':'gzip'}); return res.end(zlib.gzipSync(ARTICLE)) }
  if (u === '/redir')     { res.writeHead(302, {location:'/article'}); return res.end() }
  if (u === '/loop')      { res.writeHead(302, {location:'/loop'}); return res.end() }
  if (u === '/pdf')       { res.writeHead(200, {'content-type':'application/pdf'}); return res.end('%PDF') }
  if (u === '/img')       { res.writeHead(200, {'content-type':'image/png'}); return res.end('x') }
  if (u === '/404')       { res.writeHead(404, {'content-type':'text/html'}); return res.end('nope') }
  if (u === '/empty')     { res.writeHead(200, {'content-type':'text/html'}); return res.end('<html><body><div id=root></div><script>render()</script></body></html>') }
  if (u === '/plain')     { res.writeHead(200, {'content-type':'text/plain'}); return res.end('Plain text forward: doctors confirm lemon water cures cancer. Government hiding this. Share widely!') }
  if (u === '/huge')      { res.writeHead(200, {'content-type':'text/html'}); return res.end('<html><body><article><p>' + 'Very long sentence that keeps going and going for the size cap test. '.repeat(40000) + '</p></article></body></html>') }
  if (u === '/hang')      { return }   // never answers → timeout
  res.writeHead(404); res.end()
})
// The resolver only allows ports 80/443, so the fixture server must bind port 80 (needs root or a container).
try { await new Promise<void>((r, j) => { server.once('error', j); server.listen(80, '127.0.0.1', () => r()) }) }
catch { console.log('\nSKIP  fixture tests: cannot bind 127.0.0.1:80 here (run as root / in a container). Classifier + SSRF tests above still ran.');
        console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0) }
const base = 'http://127.0.0.1'
const opt = { allowPrivate: true }

let r = await resolveUrl(base + '/article', opt)
ok('extracts og:title', r.title === 'Officials deny "secret" poll changes', JSON.stringify(r.title))
ok('drops script/style/nav/footer', !/SHOULD NOT APPEAR|color:red|Copyright junk|Home/.test(r.text))
ok('keeps article body + decodes entities', r.text.includes('baseless') && r.text.includes('& fabricated') && r.text.includes('contradicting a viral message'), JSON.stringify(r.text.slice(0, 120)))
ok('prepends description', r.text.startsWith('A short description'))
ok('host reported', r.host === '127.0.0.1')
r = await resolveUrl(base + '/gzip', opt);   ok('gzip body decoded', r.text.includes('baseless'))
r = await resolveUrl(base + '/redir', opt);  ok('follows redirect', r.url.endsWith('/article') && r.text.includes('baseless'), r.url)
r = await resolveUrl(base + '/plain', opt);  ok('text/plain accepted', r.text.startsWith('Plain text forward'))
r = await resolveUrl(base + '/huge', opt);   ok('caps text at 6000, flags truncated', r.text.length === 6000 && r.truncated === true, `len=${r.text.length} chars=${r.chars}`)
for (const [p, code] of [['/loop','unreachable'],['/pdf','unsupported'],['/img','unsupported'],['/404','unreachable'],['/empty','no_text']] as const) {
  try { await resolveUrl(base + p, opt); ok(`error ${p}`, false) } catch (e) { ok(`error ${p} → ${code}`, e instanceof ResolveError && e.code === code, e instanceof ResolveError ? e.code + ': ' + e.message : String(e)) }
}
const t0 = Date.now()
try { await resolveUrl(base + '/hang', opt); ok('timeout', false) } catch (e) { ok('timeout ~8s', e instanceof ResolveError && e.code === 'timeout' && Date.now() - t0 < 10000, `${Date.now() - t0}ms`) }
// strict mode really does refuse the same local fixture
try { await resolveUrl(base + '/article'); ok('strict mode refuses loopback fixture', false) } catch (e) { ok('strict mode refuses loopback fixture', e instanceof ResolveError && e.code === 'blocked') }
server.close()
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0)
