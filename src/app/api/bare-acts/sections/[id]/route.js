import { NextResponse } from 'next/server'
import dbConnect from '@/db/client'
import BareActSectionModel from '@/model/bareAct/BareActSectionModel'
import BareActSectionTranslationModel from '@/model/bareAct/BareActSectionTranslationModel'
import mongoose from 'mongoose'
import { resolveLang } from '@/lib/coi'
import { translateSection } from '@/lib/bareActTranslate'
import { compareSections, displayTitle } from '@/lib/bareActSectionSort'

export const dynamic = 'force-dynamic'

// Overlays translated fields onto the section; missing fields keep the English value.
function applyTranslation(section, tr) {
  if (tr.section_title) section.section_title = tr.section_title
  if (tr.content) section.content = tr.content
  if (tr.footnote) section.footnote = tr.footnote
}

export async function GET(request, { params }) {
  try {
    const { id } = params

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid section ID.' },
        { status: 400 }
      )
    }

    const { searchParams } = new URL(request.url)
    const lang = resolveLang(searchParams.get('tr'))

    await dbConnect()

    const section = await BareActSectionModel.findById(id).lean()

    if (!section) {
      return NextResponse.json(
        { success: false, error: 'Section not found.' },
        { status: 404 }
      )
    }

    // Resolve a non-English language through the translation cache:
    //   1. Cache hit in bareact_section_translations -> serve it directly.
    //   2. Cache miss                                 -> translate at runtime, cache it, serve it.
    //   3. Translation fails                           -> fall back to the English section.
    // `source` tells the caller where the served copy came from.
    let resolvedLang = 'en'
    let source = 'base'
    if (lang !== 'en') {
      const cached = await BareActSectionTranslationModel.findOne({ section_id: section._id, lang }).lean()
      if (cached) {
        applyTranslation(section, cached)
        resolvedLang = lang
        source = 'cache'
        // Record that this cached translation was served.
        // timestamps:false so a read doesn't bump `updatedAt` (content-change time).
        await BareActSectionTranslationModel.updateOne(
          { section_id: section._id, lang },
          { $set: { last_read_at: new Date() } },
          { timestamps: false }
        )
      } else {
        try {
          const translated = await translateSection(section, lang)
          // Upsert so concurrent misses don't create duplicates.
          await BareActSectionTranslationModel.updateOne(
            { section_id: section._id, lang },
            {
              $set: {
                act_id: section.act_id,
                section_number: section.section_number,
                section_title: translated.section_title,
                content: translated.content,
                footnote: translated.footnote,
                source: 'runtime',
                last_read_at: new Date(),
              },
            },
            { upsert: true }
          )
          applyTranslation(section, translated)
          resolvedLang = lang
          source = 'runtime'
        } catch (err) {
          // Translation failed — fall back to English.
          console.error('[bare-acts/sections/translate]', err)
        }
      }
    }

    // Echo the served language code on the section object itself.
    section.language = resolvedLang
    section.section_title = displayTitle(section)

    // Fetch all sections for the same act (id, number, title only) to compute prev/next
    const siblings = await BareActSectionModel.find(
      { act_id: section.act_id },
      { _id: 1, section_number: 1, section_title: 1, order_title: 1 }
    ).lean()

    siblings.sort(compareSections)

    const idx = siblings.findIndex((s) => s._id.toString() === id)
    const previous = idx > 0 ? siblings[idx - 1] : null
    const next = idx !== -1 && idx < siblings.length - 1 ? siblings[idx + 1] : null

    return NextResponse.json(
      {
        success: true,
        requested_lang: lang,
        lang: resolvedLang,
        source,
        data: section,
        previous: previous
          ? { _id: previous._id, section_number: previous.section_number, section_title: displayTitle(previous) }
          : null,
        next: next
          ? { _id: next._id, section_number: next.section_number, section_title: displayTitle(next) }
          : null,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[bare-acts/sections/[id]]', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
