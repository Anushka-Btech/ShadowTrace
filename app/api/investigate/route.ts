import { NextResponse } from 'next/server'

export const maxDuration = 60

const BACKEND = process.env.BACKEND_API_URL ?? 'http://localhost:8000'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const response = await fetch(`${BACKEND}/investigate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(55000),
    })
    if (!response.ok) throw new Error('Backend unavailable')
    return NextResponse.json(await response.json())
  } catch {
    return NextResponse.json({ error: 'backend unreachable' }, { status: 502 })
  }
}
