import { NextResponse } from 'next/server'
import dbConnect from '@/db/client'
import mongoose from 'mongoose'
import CoiEntryModel from '@/model/constitution/CoiEntryModel'
import CoiTranslationModel from '@/model/constitution/CoiTranslationModel'
import { resolveLang, sortByNumber } from '@/lib/coi'
import { translateEntry } from '@/lib/coiTranslate'

// Overlays translated fields onto the entry; missing fields keep the English value.
function applyTranslation(entry, tr) {
  if (tr.title) entry.title = tr.title
  if (tr.content) entry.content = tr.content
  if (Array.isArray(tr.footnotes) && tr.footnotes.length) entry.footnotes = tr.footnotes
}

export const dynamic = 'force-dynamic'

export async function GET(request, { params }) {
  try {
    const { id } = params

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid entry ID.' },
        { status: 400 }
      )
    }

    const { searchParams } = new URL(request.url)
    const lang = resolveLang(searchParams.get('tr'))

    await dbConnect()

    const entry = await CoiEntryModel.findById(id).lean()
    if (!entry) {
      return NextResponse.json(
        { success: false, error: 'Entry not found.' },
        { status: 404 }
      )
    }

    // Resolve a non-English language through the translation cache:
    //   1. Cache hit in coi_translations  -> serve it directly.
    //   2. Cache miss                      -> translate at runtime, cache it, serve it.
    //   3. Translation fails               -> fall back to the English entry.
    // `source` tells the caller where the served copy came from.
    let resolvedLang = 'en'
    let source = 'base'
    if (lang !== 'en') {
      const cached = await CoiTranslationModel.findOne({ entry_id: entry._id, lang }).lean()
      if (cached) {
        applyTranslation(entry, cached)
        resolvedLang = lang
        source = 'cache'
        // Record that this cached translation was served.
        // timestamps:false so a read doesn't bump `updatedAt` (content-change time).
        await CoiTranslationModel.updateOne(
          { entry_id: entry._id, lang },
          { $set: { last_read_at: new Date() } },
          { timestamps: false }
        )
      } else {
        try {
          const translated = await translateEntry(entry, lang)
          // Upsert so concurrent misses don't create duplicates.
          await CoiTranslationModel.updateOne(
            { entry_id: entry._id, lang },
            {
              $set: {
                type: entry.type,
                number: entry.number,
                slug: entry.slug,
                title: translated.title,
                content: translated.content,
                footnotes: translated.footnotes,
                source: 'runtime',
                last_read_at: new Date(),
              },
            },
            { upsert: true }
          )
          applyTranslation(entry, translated)
          resolvedLang = lang
          source = 'runtime'
        } catch (err) {
          // Translation failed — fall back to English.
          console.error('[constitution-of-india/translate]', err)
        }
      }
    }

    // Echo the served language code on the entry object itself.
    entry.language = resolvedLang

    // Previous / next navigation across all entries within the same parent
    // (Part / Schedule / Appendix / Amendment), ordered alphanumerically.
    let previous = null
    let next = null
    if (entry.parent?._id) {
      const siblings = await CoiEntryModel.find(
        { 'parent._id': entry.parent._id },
        { _id: 1, number: 1, title: 1, slug: 1 }
      ).lean()
      siblings.sort(sortByNumber)

      const idx = siblings.findIndex((s) => s._id.toString() === id)
      const prevSib = idx > 0 ? siblings[idx - 1] : null
      const nextSib =
        idx !== -1 && idx < siblings.length - 1 ? siblings[idx + 1] : null

      if (prevSib) {
        previous = {
          _id: prevSib._id,
          number: prevSib.number,
          title: prevSib.title,
          slug: prevSib.slug,
        }
      }
      if (nextSib) {
        next = {
          _id: nextSib._id,
          number: nextSib.number,
          title: nextSib.title,
          slug: nextSib.slug,
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        requested_lang: lang,
        lang: resolvedLang,
        source,
        data: entry,
        previous,
        next,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[constitution-of-india/entries/[id]]', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
