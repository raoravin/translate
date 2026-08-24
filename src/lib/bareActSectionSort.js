const ROMAN_VALUES = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }
const ROMAN_RE = /^[IVXLCDM]+$/

function romanToInt(str) {
  let total = 0
  for (let i = 0; i < str.length; i++) {
    const value = ROMAN_VALUES[str[i]]
    const next = ROMAN_VALUES[str[i + 1]]
    total += next && value < next ? -value : value
  }
  return total
}

// section_number is either plain/alphanumeric ("32", "498A") or a Roman
// numeral ("XXIX") depending on the act/schedule — a naive string or
// leading-digit sort puts "XXIX" before "XXV" alphabetically, so numerals
// need their own key.
export function sectionSortKey(sectionNumber) {
  const raw = String(sectionNumber ?? '').trim().toUpperCase()
  const numMatch = raw.match(/^(\d+)(.*)$/)
  if (numMatch) return { rank: 0, num: parseInt(numMatch[1], 10), suffix: numMatch[2] }
  if (raw && ROMAN_RE.test(raw)) return { rank: 0, num: romanToInt(raw), suffix: '' }
  return { rank: 1, num: 0, suffix: raw }
}

export function compareSections(a, b) {
  const ka = sectionSortKey(a.section_number)
  const kb = sectionSortKey(b.section_number)
  if (ka.rank !== kb.rank) return ka.rank - kb.rank
  if (ka.num !== kb.num) return ka.num - kb.num
  if (ka.suffix !== kb.suffix) return ka.suffix < kb.suffix ? -1 : 1
  return 0
}

// Schedule parts/tables carry their heading in order_title with a null
// section_title (see order_type: "schedule_part") — fall back to it so the
// list/detail views never show a blank title. If neither is set, fall back
// to "Section {number}" rather than an empty string.
export function displayTitle(section) {
  if (section.section_title) return section.section_title
  if (section.order_title) return section.order_title
  return `Section ${section.section_number ?? ''}`.trim()
}
