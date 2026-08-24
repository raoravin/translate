import { translateTexts } from './googleTranslate'

// ---------------------------------------------------------------------------
// Runtime translator for bare-act / subordinate-legislation sections, backed
// by the Google Cloud Translation API (format: 'html' preserves markup in
// `content`). Signature: (section, lang) -> { section_title, content, footnote }.
//
// Throws to signal a translation failure — callers fall back to English.
// ---------------------------------------------------------------------------
export async function translateSection(section, lang) {
  const [section_title, content, footnote] = await translateTexts(
    [section.section_title, section.content, section.footnote],
    lang
  )

  return {
    section_title: section_title ?? section.section_title,
    content: content ?? section.content,
    footnote: footnote ?? section.footnote,
  }
}
