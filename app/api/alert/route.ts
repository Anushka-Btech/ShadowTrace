import { groq } from '@/lib/groq'
import { campaigns } from '@/lib/mockData'
import type { Alert } from '@/types'

const BACKEND = process.env.BACKEND_API_URL ?? 'http://localhost:8000'

export async function POST(request: Request) {
  const body = await request.json()
  const { campaign_id } = body as { campaign_id?: string }

  if (!campaign_id) {
    return Response.json({ error: 'campaign_id is required' }, { status: 400 })
  }

  // ── 1. Teammate's /generate-alert endpoint (primary) ─────────────────────
  // Build the payload the README specifies from campaign metadata.
  // Fetch campaign from backend (already loaded from teammate's JSON files).
  try {
    const campRes = await fetch(`${BACKEND}/campaigns/${campaign_id}`, {
      signal: AbortSignal.timeout(4000),
    })
    if (campRes.ok) {
      const camp = await campRes.json()
      const botCount = (camp.nodes as Array<{ type: string }>)
        .filter(n => n.type === 'bot').length
      const botPressure = Math.round((botCount / Math.max(camp.nodes.length, 1)) * 100)
      const confidenceScore = Math.round(camp.confidence * 100)

      const alertRes = await fetch(`${BACKEND}/generate-alert`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: {
            campaign_detected:  true,
            confidence_score:   confidenceScore,
            cluster_count:      3,
            bot_pressure:       botPressure,
            content_risk_score: confidenceScore,
          },
        }),
        signal: AbortSignal.timeout(8000),
      })
      if (alertRes.ok) {
        // Teammate's ThreatClassifierResponse → frontend Alert shape
        const tr = await alertRes.json() as {
          threat_type: string
          severity: string          // "critical" | "high" | "medium" | "low"
          explanation: string
          structured_alert: { confidence?: number }
        }
        const sev = (tr.severity ?? '').toLowerCase()
        const alert: Alert = {
          id:           `alert-${Date.now()}`,
          campaign_id,
          severity:     sev === 'critical' || sev === 'high' ? 'HIGH' : sev === 'medium' ? 'MED' : 'LOW',
          message:      `${tr.threat_type} — ${tr.explanation}`,
          timestamp:    new Date().toISOString(),
          recommendation: 'Escalate to threat intelligence team. Flag all identified accounts for platform review and notify relevant authorities.',
        }
        return Response.json(alert)
      }
    }
  } catch {
    // backend not running — fall through to Groq
  }

  const campaign = campaigns.find((c) => c.id === campaign_id)
  if (!campaign) {
    return Response.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_key') {
    const mock: Alert = {
      id: `alert-${Date.now()}`,
      campaign_id,
      severity: campaign.threat_level,
      message: `THREAT DETECTED — ${campaign.name}: ${campaign.narrative.slice(0, 120)}...`,
      timestamp: new Date().toISOString(),
      recommendation:
        'Immediate escalation recommended. Flag all identified accounts for platform review and notify relevant authorities.',
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
            'You are a threat intelligence analyst. Generate concise, professional threat alerts. Respond with JSON only — no markdown, no explanation.',
        },
        {
          role: 'user',
          content: `Generate a threat alert for this campaign:\n${JSON.stringify({
            name: campaign.name,
            threat_level: campaign.threat_level,
            account_count: campaign.account_count,
            narrative: campaign.narrative,
            confidence: campaign.confidence,
          })}\n\nReturn JSON with exactly these fields: message (string, 2-3 sentences), recommendation (string, 1-2 sentences).`,
        },
      ],
      max_tokens: 300,
    })

    const text = completion.choices[0].message.content ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const parsed = JSON.parse(jsonMatch[0]) as { message: string; recommendation: string }
    const alert: Alert = {
      id: `alert-${Date.now()}`,
      campaign_id,
      severity: campaign.threat_level,
      message: parsed.message,
      timestamp: new Date().toISOString(),
      recommendation: parsed.recommendation,
    }
    return Response.json(alert)
  } catch {
    return Response.json({ error: 'Failed to generate alert' }, { status: 500 })
  }
}
