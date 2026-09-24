import { NextResponse } from 'next/server'

// Allow up to 60s so a cold-starting free-tier backend still returns real data
export const maxDuration = 60

const BACKEND = process.env.BACKEND_API_URL ?? 'http://localhost:8000'

export type DeepfakeVerdict =
  | 'LIKELY_MANIPULATED'
  | 'POSSIBLY_MANIPULATED'
  | 'LIKELY_AUTHENTIC'
  | 'ANALYSIS_FAILED'

export interface DeepfakeResult {
  status:             'complete' | 'failed'
  source:             'backend' | 'mock'
  manipulation_score: number // 0-100
  verdict:            DeepfakeVerdict
  confidence:         number // 0-1
  ela_image_base64:   string
  signals:            string[]
  metadata_flags:     string[]
  analysis_summary:   string
  metadata_summary:   Record<string, unknown>
}

// Backend response shape (backend/agents/deepfake_detector.py)
interface BackendResponse {
  manipulation_probability: number
  ela_image_base64:         string
  metadata_summary:         Record<string, unknown>
  ai_generated_probability?: number | null
  ai_model_used?:            string | null
}

const EDITING_TOOLS = [
  'photoshop', 'gimp', 'lightroom', 'pixelmator', 'facetune', 'snapseed', 'afterlight', 'canva',
]

// Presentation layer only — labels the exact heuristics the backend agent scored
function deriveSignals(backend: BackendResponse, score: number): { signals: string[]; flags: string[] } {
  const meta = backend.metadata_summary
  const signals: string[] = []
  const flags: string[] = []

  if (Object.keys(meta).length === 0) {
    flags.push('No EXIF data — metadata stripped (common after editing or re-sharing)')
  } else {
    const software = meta['Software']
    if (typeof software === 'string') {
      const lowered = software.toLowerCase()
      flags.push(
        EDITING_TOOLS.some(tool => lowered.includes(tool))
          ? `Edited with: ${software}`
          : `Processing software recorded: ${software}`,
      )
    }
    if (!('DateTime' in meta)) {
      flags.push('Missing capture timestamp')
    }
  }
  signals.push(...flags.map(flag => `EXIF: ${flag}`))

  if (score > 65) {
    signals.unshift('High ELA response — compression inconsistencies suggest editing')
  } else if (score > 35) {
    signals.unshift('Moderate ELA response — possible localized editing')
  }

  if (typeof backend.ai_generated_probability === 'number' && backend.ai_model_used) {
    const pct = Math.round(backend.ai_generated_probability * 100)
    signals.unshift(
      backend.ai_generated_probability >= 0.5
        ? `AI-generation model: ${pct}% likely AI-generated (${backend.ai_model_used})`
        : `AI-generation model: ${pct}% AI probability — likely camera-captured (${backend.ai_model_used})`,
    )
  }

  return { signals, flags }
}

function verdictFor(score: number): DeepfakeVerdict {
  if (score > 65) return 'LIKELY_MANIPULATED'
  if (score > 35) return 'POSSIBLY_MANIPULATED'
  return 'LIKELY_AUTHENTIC'
}

function summaryFor(verdict: DeepfakeVerdict, signalCount: number): string {
  switch (verdict) {
    case 'LIKELY_MANIPULATED':
      return `Image shows strong evidence of manipulation. ${signalCount} forensic signal${signalCount === 1 ? '' : 's'} detected. ELA analysis reveals compression inconsistencies consistent with digital editing.`
    case 'POSSIBLY_MANIPULATED':
      return `Image shows some anomalies that may indicate manipulation. ${signalCount} signal${signalCount === 1 ? '' : 's'} require further investigation.`
    default:
      return 'No significant manipulation detected. Compression patterns appear consistent with authentic photography.'
  }
}

export async function POST(request: Request) {
  const body = await request.json()
  const image_url = (body as { image_url?: string; url?: string }).image_url
    ?? (body as { url?: string }).url

  if (typeof image_url !== 'string' || !image_url.trim()) {
    return Response.json({ error: 'image_url is required' }, { status: 400 })
  }

  try {
    const response = await fetch(`${BACKEND}/deepfake/analyze`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ image_url }),
      signal:  AbortSignal.timeout(55000),
    })
    if (!response.ok) throw new Error('Backend unavailable')
    const backend = (await response.json()) as BackendResponse

    if (backend.metadata_summary?.analysis_failed === true) {
      const result: DeepfakeResult = {
        status:             'failed',
        source:             'backend',
        manipulation_score: 0,
        verdict:            'ANALYSIS_FAILED',
        confidence:         0,
        ela_image_base64:   '',
        signals:            [],
        metadata_flags:     [],
        analysis_summary:   String(backend.metadata_summary.error ?? 'Analysis failed'),
        metadata_summary:   backend.metadata_summary,
      }
      return NextResponse.json(result)
    }

    const score = Math.round(backend.manipulation_probability * 100)
    const verdict = verdictFor(score)
    const { signals, flags } = deriveSignals(backend, score)
    const result: DeepfakeResult = {
      status:             'complete',
      source:             'backend',
      manipulation_score: score,
      verdict,
      confidence:         Math.round(Math.min(0.95, 0.4 + score / 200) * 100) / 100,
      ela_image_base64:   backend.ela_image_base64,
      signals,
      metadata_flags:     flags,
      analysis_summary:   summaryFor(verdict, signals.length),
      metadata_summary:   backend.metadata_summary,
    }
    return NextResponse.json(result)
  } catch {
    const result: DeepfakeResult = {
      status:             'complete',
      source:             'mock',
      manipulation_score: 73,
      verdict:            'LIKELY_MANIPULATED',
      confidence:         0.81,
      ela_image_base64:   '',
      signals: [
        'High ELA response — compression inconsistencies suggest editing',
        'EXIF: Edited with: Adobe Photoshop',
        'EXIF: Missing capture timestamp',
      ],
      metadata_flags:   ['Edited with: Adobe Photoshop', 'Missing capture timestamp'],
      analysis_summary: 'Image shows strong evidence of manipulation. 3 forensic signals detected. (Backend unreachable — mock response.)',
      metadata_summary: { note: 'backend unreachable — mock response' },
    }
    return NextResponse.json(result)
  }
}
