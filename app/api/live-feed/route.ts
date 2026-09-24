import { NextResponse } from 'next/server'

// Allow up to 60s so a cold-starting free-tier backend still returns real data
export const maxDuration = 60

const BACKEND = process.env.BACKEND_API_URL ?? 'http://localhost:8000'

const MOCK_FEED = {
  items: [
    {
      id: 'mock1',
      title: 'Viral claim about EVM tampering in Maharashtra elections is false',
      summary:
        'A widely shared video claiming to show EVM manipulation has been fact-checked and found to be misleading. The video is from 2019 and shows a demonstration, not actual tampering.',
      url: 'https://www.altnews.in',
      published: new Date().toISOString(),
      source: 'AltNews',
      source_color: 'red',
      language: 'en',
      ai_score: 87,
      risk_level: 'HIGH',
      keywords: ['election', 'EVM', 'viral', 'misleading'],
    },
    {
      id: 'mock2',
      title: 'False claim about COVID vaccine side effects circulating on WhatsApp',
      summary:
        'A message claiming that a new study found severe side effects in 40% of vaccinated individuals is fabricated. No such study exists.',
      url: 'https://boomlive.in',
      published: new Date(Date.now() - 3600000).toISOString(),
      source: 'Boom',
      source_color: 'yellow',
      language: 'en',
      ai_score: 91,
      risk_level: 'HIGH',
      keywords: ['vaccine', 'health', 'WhatsApp', 'fabricated'],
    },
    {
      id: 'mock3',
      title: 'Morphed image of PM Modi shared with false caption goes viral',
      summary:
        'An AI-generated image of the Prime Minister has been shared with a fabricated quote. Reverse image search confirms the image is synthetically generated.',
      url: 'https://www.factchecker.in',
      published: new Date(Date.now() - 7200000).toISOString(),
      source: 'FactChecker',
      source_color: 'blue',
      language: 'en',
      ai_score: 94,
      risk_level: 'HIGH',
      keywords: ['deepfake', 'morphed', 'viral', 'fabricated'],
    },
  ],
  last_updated: new Date().toISOString(),
  total_count: 3,
  sources: ['AltNews', 'Boom', 'FactChecker', 'TheQuint'],
}

export async function GET() {
  try {
    const response = await fetch(`${BACKEND}/live-feed`, {
      next: { revalidate: 300 }, // cache 5 minutes
      signal: AbortSignal.timeout(55000),
    })
    if (!response.ok) throw new Error('Backend unavailable')
    const data = await response.json()
    if (!Array.isArray(data.items) || data.items.length === 0) throw new Error('Empty feed')
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(MOCK_FEED)
  }
}
