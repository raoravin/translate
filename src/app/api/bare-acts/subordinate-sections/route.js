import { NextResponse } from 'next/server'
import dbConnect from '@/db/client'
import SubordinateSectionModel from '@/model/bareAct/SubordinateSectionModel'
import SubordinateSectionTranslationModel from '@/model/bareAct/SubordinateSectionTranslationModel'
import mongoose from 'mongoose'
import { resolveLang } from '@/lib/coi'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const itemId = (searchParams.get('subordinate_id') || searchParams.get('item_id'))?.trim()
    const lang = resolveLang(searchParams.get('tr'))

    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      return NextResponse.json(
        { success: false, error: 'Valid subordinate_id query parameter is required.' },
        { status: 400 }
      )
    }

    const page = Math.max(1, parseInt(searchParams.get('page')) || 1)
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit')) || 20), 100)
    const skip = (page - 1) * limit

    await dbConnect()

    const filter = { item_id: new mongoose.Types.ObjectId(itemId) }

    const [data, total] = await Promise.all([
      SubordinateSectionModel.aggregate([
        { $match: filter },
        {
          $addFields: {
            _sortNum: {
              $toInt: {
                $let: {
                  vars: {
                    m: { $regexFind: { input: { $ifNull: ['$section_number', '0'] }, regex: /^\d+/ } },
                  },
                  in: { $cond: [{ $eq: ['$$m', null] }, '0', '$$m.match'] },
                },
              },
            },
          },
        },
        { $sort: { _sortNum: 1, section_number: 1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            _sortNum: 0,
            content: 0,
            footnote: 0,
          },
        },
      ]),
      SubordinateSectionModel.countDocuments(filter),
    ])

    // Overlay translated titles from the subordinate_section_translations cache.
    // Each item carries the language code it was actually served in: the
    // requested language when a cached translated title exists, else `en`.
    // The list never triggers runtime translation — it only reuses titles
    // already cached by the section-detail endpoint.
    for (const section of data) section.language = 'en'

    if (lang !== 'en' && data.length) {
      const ids = data.map((d) => d._id)
      const translations = await SubordinateSectionTranslationModel.find(
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
        await SubordinateSectionTranslationModel.updateMany(
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
    console.error('[bare-acts/subordinate-sections]', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
