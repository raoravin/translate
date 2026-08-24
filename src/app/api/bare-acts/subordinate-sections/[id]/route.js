import { NextResponse } from 'next/server'
import dbConnect from '@/db/client'
import SubordinateSectionModel from '@/model/bareAct/SubordinateSectionModel'
import SubordinateSectionTranslationModel from '@/model/bareAct/SubordinateSectionTranslationModel'
import mongoose from 'mongoose'
import { resolveLang } from '@/lib/coi'
import { translateSection } from '@/lib/bareActTranslate'

export const dynamic = 'force-dynamic'

function parseSectionNumber(num) {
  const match = String(num || '0').match(/^(\d+)([a-zA-Z]*)/)
  return match ? [parseInt(match[1], 10), match[2].toLowerCase()] : [0, '']
}

function sortSections(a, b) {
  const [numA, letterA] = parseSectionNumber(a.section_number)
  const [numB, letterB] = parseSectionNumber(b.section_number)
  return numA !== numB ? numA - numB : letterA.localeCompare(letterB)
}

// Overlays translated fields onto the section; missing fields keep the English value.
function applyTranslation(section, tr) {
  if (tr.section_title) section.section_title = tr.section_title
  if (tr.content) section.content = tr.content
  if (tr.footnote) section.footnote = tr.footnote
}

export async function GET(request, { params }) {
  try {
    const { id } = params

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Invalid section ID.' },
        { status: 400 }
      )
    }

    const { searchParams } = new URL(request.url)
    const lang = resolveLang(searchParams.get('tr'))

    await dbConnect()

    let section = null

    if (mongoose.Types.ObjectId.isValid(id)) {
      section = await SubordinateSectionModel.findById(id).lean()
    }

    if (!section) {
      return NextResponse.json(
        { success: false, error: 'Section not found.' },
        { status: 404 }
      )
    }

    // Resolve a non-English language through the translation cache:
    //   1. Cache hit in subordinate_section_translations -> serve it directly.
    //   2. Cache miss                                     -> translate at runtime, cache it, serve it.
    //   3. Translation fails                               -> fall back to the English section.
    // `source` tells the caller where the served copy came from.
    let resolvedLang = 'en'
    let source = 'base'
    if (lang !== 'en') {
      const cached = await SubordinateSectionTranslationModel.findOne({ section_id: section._id, lang }).lean()
      if (cached) {
        applyTranslation(section, cached)
        resolvedLang = lang
        source = 'cache'
        // Record that this cached translation was served.
        // timestamps:false so a read doesn't bump `updatedAt` (content-change time).
        await SubordinateSectionTranslationModel.updateOne(
          { section_id: section._id, lang },
          { $set: { last_read_at: new Date() } },
          { timestamps: false }
        )
      } else {
        try {
          const translated = await translateSection(section, lang)
          // Upsert so concurrent misses don't create duplicates.
          await SubordinateSectionTranslationModel.updateOne(
            { section_id: section._id, lang },
            {
              $set: {
                item_id: section.item_id,
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
          console.error('[bare-acts/subordinate-sections/translate]', err)
        }
      }
    }

    // Echo the served language code on the section object itself.
    section.language = resolvedLang

    const siblings = await SubordinateSectionModel.find(
      { item_id: section.item_id },
      { _id: 1, section_number: 1, section_title: 1 }
    ).lean()

    siblings.sort(sortSections)

    const idx = siblings.findIndex((s) => s._id.toString() === section._id.toString())
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
          ? { _id: previous._id, section_number: previous.section_number, section_title: previous.section_title }
          : null,
        next: next
          ? { _id: next._id, section_number: next.section_number, section_title: next.section_title }
          : null,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[bare-acts/subordinate-sections/[id]]', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
