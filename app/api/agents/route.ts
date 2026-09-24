import { NextResponse } from 'next/server'

export const maxDuration = 60

const BACKEND = process.env.BACKEND_API_URL ?? 'http://localhost:8000'

export async function GET() {
  try {
    const response = await fetch(`${BACKEND}/agents/status`, {
      signal: AbortSignal.timeout(55000),
      cache:  'no-store',
    })
    if (!response.ok) throw new Error('Backend unavailable')
    return NextResponse.json(await response.json())
  } catch {
    return NextResponse.json({ error: 'backend unreachable' }, { status: 502 })
  }
}
