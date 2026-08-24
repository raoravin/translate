import { NextResponse } from 'next/server'
import dbConnect from '@/db/client'
import CoiHierarchyModel from '@/model/constitution/CoiHierarchyModel'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import { COI_TYPES, COI_TYPE_GROUP, resolveLang, pickTitle, sortNodes } from '@/lib/coi'

export const dynamic = 'force-dynamic'

const rateLimiter = new RateLimiterMemory({ points: 60, duration: 60 })

// Builds the trimmed shape returned for each hierarchy node. When `all` is true
// the full title_translations object is returned; otherwise titles are resolved
// to the requested language.
function mapNode(node, lang, all, includeSections) {
  // The language code is echoed on every node/section/entry (`all` for the
  // full-translations mode) so each object is self-describing.
  const language = all ? 'all' : lang

  const out = {
    _id: node._id,
    type: node.type,
    number: node.number,
    slug: node.slug,
    meta: node.meta,
    language,
  }

  if (all) {
    out.title = node.title
    out.title_translations = node.title_translations
  } else {
    out.title = pickTitle(node, lang)
  }

  if (includeSections && Array.isArray(node.sections)) {
    out.sections = node.sections.map((sec) => ({
      _id: sec._id,
      slug: sec.slug,
      language,
      ...(all
        ? { title: sec.title, title_translations: sec.title_translations }
        : { title: pickTitle(sec, lang) }),
      entries: Array.isArray(sec.entries)
        ? sec.entries.map((en) => ({
            _id: en._id,
            number: en.number,
            slug: en.slug,
            language,
            ...(all
              ? { title: en.title, title_translations: en.title_translations }
              : { title: pickTitle(en, lang) }),
          }))
        : [],
    }))
  }

  return out
}

export async function GET(request) {
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

  try {
    const { searchParams } = new URL(request.url)

    const langParam = searchParams.get('lang')
    const all = langParam === 'all'
    const lang = all ? null : resolveLang(langParam)

    const typeFilter = searchParams.get('type')?.trim().toLowerCase()
    // Sections (and their nested entries) are included by default — pass
    // `sections=false` to get just the top-level Parts/Schedules/... list.
    const includeSections = searchParams.get('sections') !== 'false'

    const filter = {}
    if (typeFilter) {
      if (!COI_TYPES.includes(typeFilter)) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid type. Must be one of: ${COI_TYPES.join(', ')}.`,
          },
          { status: 400 }
        )
      }
      filter.type = typeFilter
    }

    await dbConnect()

    const docs = await CoiHierarchyModel.find(filter).lean()

    const grouped = { parts: [], schedules: [], appendix: [], amendments: [] }
    for (const d of docs) {
      const group = COI_TYPE_GROUP[d.type]
      if (group) grouped[group].push(mapNode(d, lang, all, includeSections))
    }
    for (const key of Object.keys(grouped)) grouped[key].sort(sortNodes)

    return NextResponse.json(
      {
        success: true,
        lang: all ? 'all' : lang,
        counts: {
          parts: grouped.parts.length,
          schedules: grouped.schedules.length,
          appendix: grouped.appendix.length,
          amendments: grouped.amendments.length,
        },
        data: grouped,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[constitution-of-india/hierarchy]', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
