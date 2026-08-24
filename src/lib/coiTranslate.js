import { translateTexts } from './googleTranslate'

// ---------------------------------------------------------------------------
// Runtime translator for Constitution of India entries, backed by the Google
// Cloud Translation API (format: 'html' preserves markup in `content`).
// Signature: (entry, lang) -> { title, content, footnotes }.
//
// `footnotes` elements are `{ number, text }` objects (mongoose `Array`,
// strict: false, no sub-schema) — `text` (HTML) is translated and `number`
// is preserved as-is. A bare string element is translated directly; any
// other shape is passed through untouched rather than guessed at.
//
// Throws to signal a translation failure — callers fall back to English.
// ---------------------------------------------------------------------------
export async function translateEntry(entry, lang) {
  const footnotesIn = Array.isArray(entry.footnotes) ? entry.footnotes : []

  const idx = []
  const toTranslate = [entry.title, entry.content]
  footnotesIn.forEach((f, i) => {
    if (typeof f === 'string' && f.length) {
      idx.push(i)
      toTranslate.push(f)
    } else if (f && typeof f === 'object' && typeof f.text === 'string' && f.text.length) {
      idx.push(i)
      toTranslate.push(f.text)
    }
  })

  const [title, content, ...footnoteResults] = await translateTexts(toTranslate, lang)

  const footnotes = footnotesIn.slice()
  idx.forEach((origIdx, i) => {
    const translated = footnoteResults[i]
    if (translated == null) return
    const orig = footnotesIn[origIdx]
    footnotes[origIdx] = typeof orig === 'string' ? translated : { ...orig, text: translated }
  })

  return {
    title: title ?? entry.title,
    content: content ?? entry.content,
    footnotes: footnotesIn.length ? footnotes : entry.footnotes,
  }
}
