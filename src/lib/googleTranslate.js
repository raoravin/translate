const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2'

// ---------------------------------------------------------------------------
// Legal abbreviation expansion.
//
// Google Translate misreads Indian legal "X&Y" abbreviations as foreign
// entities — e.g. "P&H High Court" comes back as "PH & Herzegovina High
// Court" in Hindi (confused with B&H / Bosnia and Herzegovina). Expanding
// them to their full names before translation gives the engine real context
// and produces the correct localized names.
//
// Only unambiguous &-pair abbreviations are expanded. Two-letter initialisms
// like SC/HC are deliberately left alone (SC = Supreme Court vs Scheduled
// Caste — context dependent).
//
// Content is translated as HTML, so "&" may appear as "&amp;".
// ---------------------------------------------------------------------------
const AMP = '\\s*(?:&|&amp;)\\s*'
// Longer patterns first — "J&K&L" must be consumed before the "J&K" rule
// can nibble its front half.
const LEGAL_ABBREVIATIONS = [
  [new RegExp(`\\bJ${AMP}K${AMP}L\\b`, 'g'), 'Jammu, Kashmir and Ladakh'],
  [new RegExp(`\\bP${AMP}H\\b`, 'g'), 'Punjab and Haryana'],
  [new RegExp(`\\bJ${AMP}K\\b`, 'g'), 'Jammu and Kashmir'],
  [new RegExp(`\\bA${AMP}N\\b`, 'g'), 'Andaman and Nicobar'],
  [new RegExp(`\\bD${AMP}NH\\b`, 'g'), 'Dadra and Nagar Haveli'],
]

export function expandLegalAbbreviations(text) {
  let out = text
  for (const [pattern, replacement] of LEGAL_ABBREVIATIONS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

// ---------------------------------------------------------------------------
// Thin wrapper around the Google Cloud Translation API (v2, API-key auth).
// Batches multiple strings into a single request and preserves HTML markup
// (format: 'html') so tags in section/entry content survive translation
// untouched — only text nodes are translated.
//
// Empty/non-string entries are skipped and come back as null so callers can
// zip the results back onto their original field positions.
// ---------------------------------------------------------------------------
export async function translateTexts(texts, targetLang, { format = 'html', sourceLang = 'en' } = {}) {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY
  if (!apiKey) throw new Error('GOOGLE_TRANSLATE_API_KEY is not configured')

  const indices = []
  const q = []
  texts.forEach((t, i) => {
    if (typeof t === 'string' && t.length) {
      indices.push(i)
      q.push(expandLegalAbbreviations(t))
    }
  })
  if (!q.length) return texts.map(() => null)

  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ q, target: targetLang, source: sourceLang, format }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Google Translate request failed (${res.status}): ${body}`)
  }

  const json = await res.json()
  const translations = json?.data?.translations
  if (!Array.isArray(translations) || translations.length !== q.length) {
    throw new Error('Google Translate returned an unexpected response')
  }

  const out = texts.map(() => null)
  indices.forEach((origIdx, i) => {
    out[origIdx] = translations[i]?.translatedText ?? null
  })
  return out
}
