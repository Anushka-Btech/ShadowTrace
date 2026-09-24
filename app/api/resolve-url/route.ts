import { NextResponse } from 'next/server'
import { resolveUrl, ResolveError, type ResolveErrorCode } from '@/lib/resolveUrl'

// Uses node:dns / node:https — must not run on the edge runtime.
export const runtime     = 'nodejs'
export const maxDuration = 30

const STATUS: Record<ResolveErrorCode, number> = {
  invalid_url: 400,
  blocked:     403,
  unsupported: 415,
  no_text:     422,
  timeout:     504,
  unreachable: 502,
}

// Turns a web address into readable text for the analysis pipeline.
// Does not analyse anything itself.
export async function POST(request: Request) {
  let url: unknown
  try {
    ({ url } = (await request.json()) as { url?: unknown })
  } catch {
    return NextResponse.json({ error: { code: 'invalid_url', message: 'Send a JSON body with a url.' } }, { status: 400 })
  }
  if (typeof url !== 'string' || !url.trim() || url.length > 2048) {
    return NextResponse.json({ error: { code: 'invalid_url', message: 'Enter a web address.' } }, { status: 400 })
  }

  try {
    return NextResponse.json(await resolveUrl(url))
  } catch (err) {
    if (err instanceof ResolveError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: STATUS[err.code] })
    }
    return NextResponse.json({ error: { code: 'unreachable', message: 'Could not read that page.' } }, { status: 502 })
  }
}
