import { campaigns } from '@/lib/mockData'

const BACKEND = process.env.BACKEND_API_URL ?? 'http://localhost:8000'

export async function GET() {
  // ── 1. FastAPI backend (primary) ──────────────────────────────────────────
  try {
    const res = await fetch(`${BACKEND}/campaigns`, {
      signal: AbortSignal.timeout(5000),
      next:   { revalidate: 60 },
    })
    if (res.ok) return Response.json(await res.json())
  } catch {
    // backend not running — fall through to mock data
  }

  // ── 2. TypeScript mock data (fallback) ────────────────────────────────────
  return Response.json(campaigns)
}
