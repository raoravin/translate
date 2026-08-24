import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Liveness probe. Reports whether the two required secrets are present — a
// missing Google key is the failure mode that makes every translate call fail
// (and silently degrades callers to their source text), so it is worth
// surfacing without having to spend an actual translation to find out.
export async function GET() {
  const translateKeyConfigured = Boolean(process.env.GOOGLE_TRANSLATE_API_KEY)
  const apiSecretConfigured = Boolean(process.env.TRANSLATE_API_SECRET)
  const ok = translateKeyConfigured && apiSecretConfigured

  return NextResponse.json(
    {
      ok,
      translate_key_configured: translateKeyConfigured,
      api_secret_configured: apiSecretConfigured,
    },
    { status: ok ? 200 : 503 }
  )
}
