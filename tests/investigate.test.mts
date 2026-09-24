/**
 * Investigation runner: how every input type is routed and how each failure mode degrades.
 * Endpoints are stubbed, so no backend or network is needed.
 *   Run:  npx tsx --tsconfig tsconfig.json tests/investigate.test.mts
 */
import { runInvestigation, parseHandles, InvestigationError } from '../lib/investigate'

let pass = 0, fail = 0
const ok = (n: string, c: boolean, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`) }

type Handler = (body: any) => { status?: number; json: any }
function stub(routes: Record<string, Handler>) {
  ;(globalThis as any).fetch = async (path: string, init: any) => {
    const h = routes[path]
    if (!h) throw new Error('unstubbed ' + path)
    const r = h(JSON.parse(init.body)); const status = r.status ?? 200
    return { ok: status < 400, status, json: async () => r.json }
  }
}
const acct = (o: any) => ({
  status: 'complete', source: 'backend', accounts_analyzed: 3, data_sources: o.ds,
  temporal: { score: o.t ?? 80, flagged_pairs: 4, median_delay_seconds: 8.3, timeline: (o.posts ?? {}) && Object.entries(o.posts ?? {}).map(([account, n]) => ({ account, posts: Array.from({ length: n as number }, (_, i) => ({ timestamp: i, text_preview: 'x' })) })) },
  linguistic: { score: o.l ?? 70, clusters: 2, accounts: [], similarity_matrix: [] },
  ai_operation: { score: o.a ?? 60, accounts: [{ handle: '@a', ai_score: 82, signals: {}, verdict: 'LIKELY_AI' }, { handle: '@b', ai_score: 20, signals: {}, verdict: 'LIKELY_HUMAN' }] },
  verdict: o.v ?? 'HIGH', confidence: 0.84, summary: 'Strong evidence of coordinated inauthentic behavior across the analyzed accounts.',
})

console.log('parseHandles →', JSON.stringify(parseHandles('  @A, b  @a\n@@c;d ')))
ok('parseHandles dedupes, normalizes, splits on , ; whitespace', JSON.stringify(parseHandles('  @A, b  @a\n@@c;d ')) === '["@A","@b","@a","@c","@d"]')

// ── account: all handles have data
stub({ '/api/account-intel': () => ({ json: acct({ ds: { '@a': 'graph', '@b': 'bluesky', '@c': 'graph' }, posts: { '@a': 5, '@b': 6, '@c': 4 } }) }) })
let r = await runInvestigation('account', '@a @b @c')
ok('account/with data: real result, scored', !r.inconclusive && !r.sample && r.score === 70 && r.sev === 'HIGH' && r.confidence === 84, `score=${r.score} sev=${r.sev}`)
ok('account/with data: accounts of interest lists only non-human', r.evidence[0]?.items.length === 1 && /likely AI-operated/.test(r.evidence[0].items[0]))
ok('account/with data: three signal bars', r.signals.length === 3)

// ── account: only one handle has data → inconclusive
stub({ '/api/account-intel': () => ({ json: acct({ ds: { '@a': 'graph', '@b': 'none', '@c': 'none' }, posts: { '@a': 5, '@b': 0, '@c': 0 }, v: 'LOW' }) }) })
r = await runInvestigation('account', '@a @b @c')
ok('account/1 of 3 with data: inconclusive, no score', r.inconclusive === true && r.score === null && r.confidence === null, r.verdict.slice(0, 80))
ok('account/1 of 3: names the accounts with no posts', /@b, @c/.test(r.notes[0] ?? ''))

// ── account: none have data
stub({ '/api/account-intel': () => ({ json: acct({ ds: { '@a': 'none', '@b': 'none' }, posts: { '@a': 0, '@b': 0 }, v: 'LOW' }) }) })
r = await runInvestigation('account', '@a @b')
ok('account/no data: inconclusive with actionable advice', r.inconclusive === true && /spelled correctly/.test(r.verdict))

// ── account: partial (2 of 3) → real result, with a note about the missing one
stub({ '/api/account-intel': () => ({ json: acct({ ds: { '@a': 'graph', '@b': 'graph', '@c': 'none' }, posts: { '@a': 5, '@b': 6, '@c': 0 } }) }) })
r = await runInvestigation('account', '@a @b @c')
ok('account/2 of 3: scored but notes the gap', !r.inconclusive && r.score === 70 && /@c/.test(r.notes[0] ?? '') && r.facts[0].value === '2', r.notes[0])

// ── account: older backend with no data_sources → falls back to timeline post counts
stub({ '/api/account-intel': () => ({ json: acct({ ds: undefined, posts: { '@a': 3, '@b': 0 } }) }) })
r = await runInvestigation('account', '@a @b')
ok('account/no provenance field: uses post counts', r.inconclusive === true)

// ── account: mock fallback is flagged, never inconclusive-hidden
stub({ '/api/account-intel': () => ({ json: { ...acct({ ds: {}, posts: {} }), source: 'mock' } }) })
r = await runInvestigation('account', '@a @b')
ok('account/mock: flagged as sample', r.sample === true && /sample output/i.test(r.notes[0]))

// ── account: validation
for (const [inp, msg] of [['@only', /at least two/], ['@1 @2 @3 @4 @5 @6 @7 @8 @9 @10 @11', /up to 10/i]] as const) {
  try { await runInvestigation('account', inp); ok('account validation ' + inp.slice(0, 10), false) } catch (e) { ok('account validation ' + inp.slice(0, 10), e instanceof InvestigationError && msg.test(e.message), (e as Error).message) }
}

// ── text pipeline: all good
const inv = (o: any = {}) => ({ steps: [{ agent: 'WhatsAppAnalyzer', duration_ms: 3, summary: 'Forward detected' }, { agent: 'ContentAnalyzer', duration_ms: 400, summary: 'Groq LLM misinformation score: 91/100' }, { agent: 'FactCheckCrossRef', duration_ms: 480, summary: '1 related debunked claim(s)' }, { agent: 'ThreatClassifier', duration_ms: 90, summary: 'x' }], misinformation_score: 91, risk_level: 'HIGH', language: 'en', claim_extracted: 'EVMs in 847 booths were pre-programmed', red_flags: ['Urgency'], fact_check_matches: [{ title: 'Fact check: EVM claim', source: 'AltNews', url: 'https://x/y', matched_terms: [] }], threat_alert: { threat_type: 'Possible State-Level Operation', severity: 'critical', explanation: 'Coordinated.' }, ...o })
const ana = (o: any = {}) => ({ source: 'backend', is_misinformation: true, confidence: 0.88, threat_level: 'HIGH', narrative_category: 'Election Manipulation', summary: 'Misinformation score: 91/100. Confidence: 88%.', indicators: ['Lexical signal: 90%'], ...o })
stub({ '/api/analyze': () => ({ json: ana() }), '/api/investigate': () => ({ json: inv() }) })
r = await runInvestigation('text', 'EVM machines in 847 polling booths were pre-programmed')
ok('text/full: score from pipeline, CRITICAL from classifier', r.score === 91 && r.sev === 'CRITICAL' && r.confidence === 88)
ok('text/full: matches Operation Pulse', r.campaign === 'Operation Pulse')
ok('text/full: fact-check matches + 4 real steps with ms', r.matches.length === 1 && r.steps.length === 4 && r.steps[1].ms === 400)

// ── low severity → no campaign suggestion
stub({ '/api/analyze': () => ({ json: ana({ threat_level: 'LOW', is_misinformation: false }) }), '/api/investigate': () => ({ json: inv({ misinformation_score: 12, risk_level: 'LOW', threat_alert: { threat_type: 'Organic Misinformation', severity: 'low', explanation: 'fine' }, fact_check_matches: [] }) }) })
r = await runInvestigation('claim', 'The election is on Tuesday in most districts')
ok('text/low: does not suggest a tracked campaign', r.campaign === null && r.sev === 'LOW')

// ── pipeline down, analyze ok → single-model result + note
stub({ '/api/analyze': () => ({ json: ana({ threat_level: 'MED', summary: 'Misinformation score: 55/100. Confidence: 60%.', confidence: 0.6 }) }), '/api/investigate': () => ({ status: 502, json: { error: 'backend unreachable' } }) })
r = await runInvestigation('text', 'some text that is long enough to run')
ok('text/pipeline down: degrades with an explicit note', r.score === 55 && r.sev === 'MEDIUM' && r.steps.length === 0 && /multi-agent pipeline was unreachable/.test(r.notes.join(' ')))

// ── analyze down, investigate ok
stub({ '/api/analyze': () => ({ status: 500, json: { error: 'Analysis failed' } }), '/api/investigate': () => ({ json: inv({ threat_alert: { threat_type: 'Coordinated Inauthentic Behavior', severity: 'high', explanation: 'e' } }) }) })
r = await runInvestigation('text', 'some text that is long enough to run')
ok('text/analyze down: pipeline result, confidence omitted, campaign still inferred from claim', r.confidence === null && r.sev === 'HIGH' && r.campaign !== undefined && r.notes.some(n => /single-model check was unavailable/.test(n)))

// ── analyze returns canned mock, pipeline down → SAMPLE, never a real result
stub({ '/api/analyze': () => ({ json: { source: 'mock', is_misinformation: true, confidence: 0.87, threat_level: 'HIGH', narrative_category: 'Health Misinformation', summary: 'canned', indicators: ['a'] } }), '/api/investigate': () => ({ status: 502, json: {} }) })
r = await runInvestigation('text', 'totally unrelated text about football')
ok('text/mock fallback: flagged sample with no score', r.sample === true && r.score === null && /not an analysis of your input/.test(r.notes[0]))

// ── analyze returns canned mock BUT the pipeline works → mock is ignored entirely
stub({ '/api/analyze': () => ({ json: { source: 'mock', is_misinformation: true, confidence: 0.87, threat_level: 'HIGH', narrative_category: 'Health Misinformation', summary: 'canned', indicators: ['canned indicator'] } }), '/api/investigate': () => ({ json: inv({ claim_extracted: 'football score claim', misinformation_score: 8, risk_level: 'LOW', threat_alert: { threat_type: 'Organic Misinformation', severity: 'low', explanation: 'benign' }, fact_check_matches: [] }) }) })
r = await runInvestigation('text', 'totally unrelated text about football')
ok('text/mock + real pipeline: canned narrative/indicators are NOT shown', !r.sample && !JSON.stringify(r).includes('Health Misinformation') && !JSON.stringify(r).includes('canned indicator') && r.confidence === null)

// ── both down
stub({ '/api/analyze': () => ({ status: 502, json: {} }), '/api/investigate': () => ({ status: 502, json: {} }) })
try { await runInvestigation('text', 'some text that is long enough to run'); ok('both down: error', false) } catch (e) { ok('both down: clear error', e instanceof InvestigationError && /unreachable/.test((e as Error).message)) }

// ── URL: page → text → pipeline; image-URL routes to the image endpoint
let seen: any = {}
stub({
  '/api/resolve-url': b => ({ json: { url: b.url, host: 'example.com', title: 'Poll dates changed?', text: 'Body '.repeat(50), chars: 9000, truncated: true } }),
  '/api/analyze': b => { seen.analyze = b; return { json: ana() } }, '/api/investigate': b => { seen.inv = b; return { json: inv() } },
  '/api/deepfake': b => { seen.deepfake = b; return { json: { status: 'complete', source: 'backend', manipulation_score: 73, verdict: 'LIKELY_MANIPULATED', confidence: 0.81, ela_image_base64: 'AAA', signals: ['High ELA response'], metadata_flags: [], analysis_summary: 'Strong evidence.', metadata_summary: {} } } },
})
r = await runInvestigation('url', 'https://example.com/story')
ok('url: page text (title + body) is what gets analysed', seen.analyze.content.startsWith('Poll dates changed?\n\n') && r.title === 'Poll dates changed?')
ok('url: source host + truncation note surfaced', r.facts[0].label === 'Source' && r.facts[0].value === 'example.com' && /first 250 characters/.test(r.notes[0]), r.notes[0])
seen = {}
r = await runInvestigation('url', 'https://example.com/pic.JPG?x=1')
ok('url pointing at an image → image forensics', r.kind === 'image' && seen.deepfake?.image_url === 'https://example.com/pic.JPG?x=1' && !seen.analyze)
ok('image: sev/score/ELA map', r.sev === 'HIGH' && r.score === 73 && r.elaImage === 'AAA')

// ── image failure gives a safe message, not the backend exception text
stub({ '/api/deepfake': () => ({ json: { status: 'failed', source: 'backend', analysis_summary: "HTTPSConnectionPool(host='x'): Max retries" } }) })
try { await runInvestigation('image', 'https://example.com/a.png'); ok('image failure', false) } catch (e) { ok('image failure hides raw exception text', !/HTTPSConnectionPool/.test((e as Error).message) && /could not be downloaded/.test((e as Error).message), (e as Error).message) }

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0)
