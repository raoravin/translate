import { NextResponse } from 'next/server'
import dbConnect from '@/db/client'
import BareActSectionModel from '@/model/bareAct/BareActSectionModel'
import BareActSectionTranslationModel from '@/model/bareAct/BareActSectionTranslationModel'
import mongoose from 'mongoose'
import { resolveLang } from '@/lib/coi'
import { compareSections, displayTitle } from '@/lib/bareActSectionSort'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const actId = searchParams.get('act_id')?.trim()
    const chapterId = searchParams.get('chapter_id')?.trim()
    const chapterItemId = searchParams.get('chapter_item_id')?.trim()
    const q = searchParams.get('query')?.trim()
    const lang = resolveLang(searchParams.get('tr'))

    if (!actId || !mongoose.Types.ObjectId.isValid(actId)) {
      return NextResponse.json(
        { success: false, error: 'Valid act_id query parameter is required.' },
        { status: 400 }
      )
    }

    if (chapterId && !mongoose.Types.ObjectId.isValid(chapterId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid chapter_id.' },
        { status: 400 }
      )
    }

    if (chapterItemId && !mongoose.Types.ObjectId.isValid(chapterItemId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid chapter_item_id.' },
        { status: 400 }
      )
    }

    const page = Math.max(1, parseInt(searchParams.get('page')) || 1)
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit')) || 20), 100)
    const skip = (page - 1) * limit

    await dbConnect()

    const filter = { act_id: new mongoose.Types.ObjectId(actId) }
    if (chapterItemId) {
      filter.chapter_item_id = new mongoose.Types.ObjectId(chapterItemId)
    } else if (chapterId) {
      filter.chapter_id = new mongoose.Types.ObjectId(chapterId)
    }

    // Patterns (plain strings, for reuse in the $regexMatch rank stage below).
    let numberPattern = null
    let textPattern = null

    if (q) {
      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

      // Users naturally type "Section 32" / "Sec 32" / "u/s 32" to mean the
      // number, but section_number only stores "32" — matching the raw
      // string as one contiguous literal regex never finds it since "Section"
      // isn't adjacent to "32" in any field. Strip the stopword so the
      // number (and any remaining keywords) are what actually get matched.
      const STOPWORDS = new Set(['section', 'sections', 'sec', 'secs', 'u/s'])
      const tokens = q.split(/\s+/).filter(Boolean)
      const meaningfulTokens = tokens.filter(
        (t) => !STOPWORDS.has(t.replace(/[.,]+$/, '').toLowerCase())
      )
      const searchTokens = meaningfulTokens.length ? meaningfulTokens : tokens

      const orConditions = []

      // A bare number/alphanumeric token (e.g. "32", "498A") most likely
      // names an exact section, not a text fragment — match it precisely
      // so "Section 32" finds section 32 and not "320", "132", etc.
      const numberToken = searchTokens.find((t) => /^\d+[A-Za-z]{0,3}$/.test(t))
      if (numberToken) {
        numberPattern = `^${escapeRegex(numberToken)}$`
        orConditions.push({ section_number: new RegExp(numberPattern, 'i') })
      }

      const textQuery = searchTokens.join(' ')
      if (textQuery) {
        textPattern = escapeRegex(textQuery)
        const rx = new RegExp(textPattern, 'i')
        orConditions.push({ section_number: rx }, { section_title: rx }, { content: rx })
      }

      if (orConditions.length) filter.$or = orConditions
    }

    // Rank matches so section-number hits outrank title hits, which outrank
    // content-only hits, instead of every match being ordered purely by
    // section number regardless of where the query actually matched.
    const rankPattern = numberPattern || textPattern
    const rankRegex = rankPattern ? new RegExp(rankPattern, 'i') : null
    const textRegex = textPattern ? new RegExp(textPattern, 'i') : null

    function matchRank(doc) {
      if (!rankRegex) return 0
      if (rankRegex.test(doc.section_number || '')) return 0
      if (textRegex) {
        if (textRegex.test(doc.section_title || '')) return 1
        if (textRegex.test(doc.content || '')) return 2
      }
      return 3
    }

    // Sorting mixes Roman numerals with plain numbers depending on the act,
    // so it can't be done as a Mongo $sort — pull the matched set into JS
    // (needed anyway to test `content` for rank 2) and sort/paginate there.
    const needsContent = Boolean(textPattern)
    const projection = { footnote: 0, section_id_ref: 0 }
    if (!needsContent) projection.content = 0

    const matched = await BareActSectionModel.find(filter, projection).lean()
    matched.sort((a, b) => {
      const ra = matchRank(a)
      const rb = matchRank(b)
      if (ra !== rb) return ra - rb
      return compareSections(a, b)
    })

    const total = matched.length
    const data = matched.slice(skip, skip + limit).map((doc) => {
      const rest = { ...doc }
      delete rest.content
      rest.section_title = displayTitle(doc)
      return rest
    })

    // Overlay translated titles from the bareact_section_translations cache.
    // Each item carries the language code it was actually served in: the
    // requested language when a cached translated title exists, else `en`.
    // The list never triggers runtime translation — it only reuses titles
    // already cached by the section-detail endpoint.
    for (const section of data) section.language = 'en'

    if (lang !== 'en' && data.length) {
      const ids = data.map((d) => d._id)
      const translations = await BareActSectionTranslationModel.find(
        { section_id: { $in: ids }, lang },
        { section_id: 1, section_title: 1 }
      ).lean()
      const titleBySection = new Map(
        translations.filter((t) => t.section_title).map((t) => [String(t.section_id), t.section_title])
      )
      for (const section of data) {
        const translated = titleBySection.get(String(section._id))
        if (translated) {
          section.section_title = translated
          section.language = lang
        }
      }
      // Record that these cached translations were served.
      const servedIds = translations.filter((t) => t.section_title).map((t) => t.section_id)
      if (servedIds.length) {
        // timestamps:false so a read doesn't bump `updatedAt` (content-change time).
        await BareActSectionTranslationModel.updateMany(
          { section_id: { $in: servedIds }, lang },
          { $set: { last_read_at: new Date() } },
          { timestamps: false }
        )
      }
    }

    return NextResponse.json(
      {
        success: true,
        lang,
        data,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[bare-acts/sections]', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
