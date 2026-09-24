import Groq from 'groq-sdk'

// Lazy singleton — only instantiated when first called, so missing API key
// during static build (page data collection) doesn't throw at import time.
let _client: Groq | null = null

export const groq = new Proxy({} as Groq, {
  get(_target, prop) {
    if (!_client) {
      _client = new Groq({ apiKey: process.env.GROQ_API_KEY ?? '' })
    }
    return (_client as unknown as Record<string | symbol, unknown>)[prop]
  },
})
