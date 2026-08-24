import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/db/client'

export const dynamic = 'force-dynamic'

// Liveness probe. Reports whether Mongo is reachable and whether the Google
// Translate API key is configured — a missing key is the failure mode that
// silently degrades every endpoint to English, so it is worth surfacing.
export async function GET() {
  const translateKeyConfigured = Boolean(process.env.GOOGLE_TRANSLATE_API_KEY)

  let db = 'down'
  try {
    await dbConnect()
    db = mongoose.connection.readyState === 1 ? 'up' : 'connecting'
  } catch (error) {
    console.error('[health]', error)
  }

  const ok = db === 'up' && translateKeyConfigured
  return NextResponse.json(
    { ok, db, translate_key_configured: translateKeyConfigured },
    { status: ok ? 200 : 503 }
  )
}
