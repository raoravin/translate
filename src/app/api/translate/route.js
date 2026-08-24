import { NextResponse } from 'next/server'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import { translateTexts } from '@/lib/googleTranslate'

export const dynamic = 'force-dynamic'

// Each request can carry a whole article, so the limit is deliberately modest.
const rateLimiter = new RateLimiterMemory({ points: 120, duration: 60 })

// Google's v2 endpoint caps a single request at 128 segments.
const MAX_SEGMENTS = 128

// Shared-secret auth. This service spends real money per call, so it must not
// be open to the internet. Returns null when the caller is authorised.
function authorize(request) {
  const expected = process.env.TRANSLATE_API_SECRET
  if (!expected) {
    console.error('[translate] TRANSLATE_API_SECRET is not configured')
    return NextResponse.json(
      { success: false, error: 'Service is not configured.' },
      { status: 503 }
    )
  }

  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : header
  if (token !== expected) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized.' },
      { status: 401 }
    )
  }

  return null
}

// POST /api/translate
//
//   { "q": ["<p>Hello</p>", null], "target": "hi", "source": "en", "format": "html" }
//     -> { "success": true, "translations": ["<p>नमस्ते</p>", null] }
//
// `translations` always has the same length and ordering as `q`; entries that
// were empty or not strings come back as null, so the caller can zip the
// result straight back onto its original field positions.
export async function POST(request) {
  const denied = authorize(request)
  if (denied) return denied

  try {
    const ip =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1'
    await rateLimiter.consume(ip)
  } catch {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please try again later.' },
      { status: 429 }
    )
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Request body must be valid JSON.' },
      { status: 400 }
    )
  }

  const { q, target, source = 'en', format = 'html' } = body || {}

  if (!Array.isArray(q)) {
    return NextResponse.json(
      { success: false, error: '`q` must be an array of strings.' },
      { status: 400 }
    )
  }
  if (q.length > MAX_SEGMENTS) {
    return NextResponse.json(
      { success: false, error: `\`q\` may contain at most ${MAX_SEGMENTS} segments.` },
      { status: 400 }
    )
  }
  if (!target || typeof target !== 'string') {
    return NextResponse.json(
      { success: false, error: '`target` language code is required.' },
      { status: 400 }
    )
  }
  if (format !== 'html' && format !== 'text') {
    return NextResponse.json(
      { success: false, error: "`format` must be either 'html' or 'text'." },
      { status: 400 }
    )
  }

  try {
    const translations = await translateTexts(q, target, { format, sourceLang: source })
    return NextResponse.json({ success: true, translations }, { status: 200 })
  } catch (error) {
    // Surface the failure so the caller can fall back to its source text.
    console.error('[translate]', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Translation failed.' },
      { status: 502 }
    )
  }
}
