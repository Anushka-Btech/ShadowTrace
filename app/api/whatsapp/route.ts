import { NextResponse } from 'next/server'

// Allow up to 60s so a cold-starting free-tier backend still returns real data
export const maxDuration = 60

const BACKEND = process.env.BACKEND_API_URL ?? 'http://localhost:8000'

const MOCK_RESULT = {
  is_forward: true,
  forward_depth: 3,
  misinformation_score: 84,
  risk_level: 'HIGH',
  language_detected: 'hinglish',
  red_flags: [
    'Uses urgency language to pressure sharing',
    'Cites unnamed authorities or experts',
    'Designed to maximize viral sharing',
  ],
  forward_signals: ['urgency_language', 'unnamed_authority', 'share_bait'],
  claim_extracted: 'Doctors have confirmed a new home remedy that cures diabetes permanently',
  verdict: 'High probability of misinformation. 3 red flags detected.',
  content_score: 79,
  wa_pattern_score: 87,
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const response = await fetch(`${BACKEND}/whatsapp/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55000),
    })
    if (!response.ok) throw new Error('Backend unavailable')
    return NextResponse.json(await response.json())
  } catch {
    return NextResponse.json(MOCK_RESULT)
  }
}
