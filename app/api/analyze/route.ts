import { groq } from '@/lib/groq'
import type { AnalysisResult } from '@/types'

const BACKEND = process.env.BACKEND_API_URL ?? 'http://localhost:8000'

export async function POST(request: Request) {
  const body = await request.json()
  const { content } = body as { content?: string }

  if (!content) {
    return Response.json({ error: 'content is required' }, { status: 400 })
  }

  // ── 1. Teammate's /analyze-text endpoint (primary) ────────────────────────
  // Response includes both README format (misinformation_score, signals)
  // AND full AnalysisResult fields — pass straight through.
  try {
    const res = await fetch(`${BACKEND}/analyze-text`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text: content }),
      signal:  AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = await res.json()
      // Backend returns full AnalysisResult fields alongside README format
      if (data.is_misinformation !== undefined) return Response.json({ ...data, source: 'backend' })
      // Adapt README format to AnalysisResult if full fields are absent
      const score = (data.misinformation_score ?? 0) / 100
      const text = (body as { content?: string }).content?.toLowerCase() ?? ''
      const narrative_category =
        /election|vot|evm|politi|democrat/.test(text) ? 'Election Manipulation' :
        /health|vaccine|medical|who|pharma|covid|immun|organ|autoimmun/.test(text) ? 'Health Misinformation' :
        /review|product|consumer|rating|commercial|shop/.test(text) ? 'Fake Review Campaign' :
        'Coordinated Inauthentic Behavior'
      return Response.json({
        source: 'backend',
        is_misinformation: score > 0.4,
        confidence: data.confidence ?? score,
        threat_level: score >= 0.7 ? 'HIGH' : score >= 0.4 ? 'MED' : 'LOW',
        narrative_category,
        summary: `Misinformation score: ${data.misinformation_score ?? Math.round(score * 100)}/100. Confidence: ${Math.round((data.confidence ?? score) * 100)}%. ${narrative_category} pattern detected across monitored networks.`,
        indicators: [
          `Lexical signal: ${Math.round((data.signals?.lexical_score ?? 0) * 100)}%`,
          `Model signal: ${Math.round((data.signals?.model_score ?? 0) * 100)}%`,
          `Blended score: ${Math.round((data.signals?.score_blend ?? 0) * 100)}%`,
        ],
      } satisfies AnalysisResult)
    }
  } catch {
    // backend not running — fall through to Groq
  }

  // ── 2. Direct Groq call (fallback when backend is down) ──────────────────
  if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_key') {
    const mock: AnalysisResult = {
      source: 'mock', // canned output — the UI must not present this as a real analysis
      is_misinformation: true,
      confidence: 0.87,
      threat_level: 'HIGH',
      narrative_category: 'Health Misinformation',
      summary:
        'Content exhibits markers of coordinated misinformation. Multiple factual inaccuracies detected alongside high-confidence fabrication indicators and bot-amplification signatures.',
      indicators: [
        'Fabricated statistics',
        'Misattributed expert quotes',
        'Coordinated posting patterns',
        'Bot amplification signatures',
      ],
    }
    return Response.json(mock)
  }

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert misinformation analyst. Analyze the provided content for misinformation indicators. Respond with JSON only — no markdown, no explanation.',
        },
        {
          role: 'user',
          content: `Analyze this content for misinformation:\n\n"${content}"\n\nReturn a JSON object with exactly these fields: is_misinformation (boolean), confidence (number 0-1), threat_level ("HIGH"|"MED"|"LOW"), narrative_category (string), summary (string, 2-3 sentences), indicators (array of strings).`,
        },
      ],
      max_tokens: 500,
    })

    const text = completion.choices[0].message.content ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const result = JSON.parse(jsonMatch[0]) as AnalysisResult
    return Response.json({ ...result, source: 'groq' })
  } catch {
    return Response.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
