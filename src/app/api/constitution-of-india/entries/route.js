import { NextResponse } from 'next/server'
import dbConnect from '@/db/client'
import mongoose from 'mongoose'
import CoiEntryModel from '@/model/constitution/CoiEntryModel'
import CoiTranslationModel from '@/model/constitution/CoiTranslationModel'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import { resolveLang, sortByNumber } from '@/lib/coi'

export const dynamic = 'force-dynamic'

const rateLimiter = new RateLimiterMemory({ points: 60, duration: 60 })

// Entry fields returned in list responses — content/footnotes are excluded;
// call the single-entry endpoint for the full body.
const LIST_PROJECTION = {
  type: 1,
  number: 1,
  title: 1,
  slug: 1,
  parent: 1,
  section: 1,
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

    const parentId = searchParams.get('parent_id')?.trim()
    const sectionId = searchParams.get('section_id')?.trim()
    const lang = resolveLang(searchParams.get('tr'))

    let page = Math.max(1, parseInt(searchParams.get('page')) || 1)
    let limit = Math.min(Math.max(1, parseInt(searchParams.get('limit')) || 50), 200)

    if (!parentId || !mongoose.Types.ObjectId.isValid(parentId)) {
      return NextResponse.json(
        { success: false, error: 'A valid parent_id is required.' },
        { status: 400 }
      )
    }
    if (sectionId && !mongoose.Types.ObjectId.isValid(sectionId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid section_id.' },
        { status: 400 }
      )
    }

    await dbConnect()

    const filter = { 'parent._id': new mongoose.Types.ObjectId(parentId) }
    if (sectionId) filter['section._id'] = new mongoose.Types.ObjectId(sectionId)

    // Per-parent entry counts are small, so sort alphanumerically in memory
    // (1, 1A, 2, 10) then paginate.
    const all = await CoiEntryModel.find(filter).select(LIST_PROJECTION).lean()
    all.sort(sortByNumber)

    const total = all.length
    const skip = (page - 1) * limit
    const data = all.slice(skip, skip + limit)

    // Overlay translated titles from the coi_translations cache.
    // Each item carries the language code it was actually served in: the
    // requested language when a cached translated title exists, else `en`.
    // The list never triggers runtime translation — it only reuses titles
    // already cached in coi_translations by the entry-detail endpoint.
    for (const entry of data) entry.language = 'en'

    if (lang !== 'en' && data.length) {
      const ids = data.map((d) => d._id)
      const translations = await CoiTranslationModel.find(
        { entry_id: { $in: ids }, lang },
        { entry_id: 1, title: 1 }
      ).lean()
      const titleByEntry = new Map(
        translations.filter((t) => t.title).map((t) => [String(t.entry_id), t.title])
      )
      for (const entry of data) {
        const translated = titleByEntry.get(String(entry._id))
        if (translated) {
          entry.title = translated
          entry.language = lang
        }
      }
      // Record that these cached translations were served.
      const servedIds = translations.filter((t) => t.title).map((t) => t.entry_id)
      if (servedIds.length) {
        // timestamps:false so a read doesn't bump `updatedAt` (content-change time).
        await CoiTranslationModel.updateMany(
          { entry_id: { $in: servedIds }, lang },
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
    console.error('[constitution-of-india/entries]', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
