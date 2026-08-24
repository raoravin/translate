// Shared helpers for the Constitution of India APIs.

// Languages present in coi_hierarchy `title_translations`.
export const COI_LANGUAGES = [
  'en', 'hi', 'gu', 'mr', 'pa', 'bn', 'or', 'ta', 'te', 'kn', 'ml', 'ne',
]

// Top-level document types in coi_hierarchy / coi_entries.
export const COI_TYPES = ['part', 'schedule', 'appendix', 'amendment']

// English display name for each supported language code.
export const COI_LANGUAGE_NAMES = {
  en: 'English',
  hi: 'Hindi',
  gu: 'Gujarati',
  mr: 'Marathi',
  pa: 'Punjabi',
  bn: 'Bengali',
  or: 'Odia',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
  ml: 'Malayalam',
  ne: 'Nepali',
}

// Maps a document `type` to its group key in the hierarchy response.
export const COI_TYPE_GROUP = {
  part: 'parts',
  schedule: 'schedules',
  appendix: 'appendix',
  amendment: 'amendments',
}

// Normalises a requested language to a supported one (defaults to English).
export function resolveLang(lang) {
  if (!lang) return 'en'
  const l = String(lang).trim().toLowerCase()
  return COI_LANGUAGES.includes(l) ? l : 'en'
}

// Picks the best title for a node: requested lang -> English -> raw title.
export function pickTitle(node, lang) {
  const t = node?.title_translations
  if (t && typeof t === 'object') {
    if (t[lang]) return t[lang]
    if (t.en) return t.en
  }
  return node?.title || ''
}

// Splits a Constitution number like "1", "1A", "10B" into a sortable tuple.
function parseEntryNumber(num) {
  const m = String(num ?? '0').match(/^(\d+)([a-zA-Z]*)/)
  return m ? [parseInt(m[1], 10), m[2].toLowerCase()] : [0, '']
}

// Sorts entries/nodes alphanumerically by `number`: 1, 1A, 2, 2B, 10, 10A.
export function sortByNumber(a, b) {
  const [na, la] = parseEntryNumber(a?.number)
  const [nb, lb] = parseEntryNumber(b?.number)
  return na !== nb ? na - nb : la.localeCompare(lb)
}

// Sorts hierarchy nodes by meta.sort_key when available, else by number.
export function sortNodes(a, b) {
  const ka = a?.meta?.sort_key
  const kb = b?.meta?.sort_key
  if (typeof ka === 'number' && typeof kb === 'number' && ka !== kb) {
    return ka - kb
  }
  return sortByNumber(a, b)
}
