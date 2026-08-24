import mongoose from 'mongoose'

// Runtime translation cache for subordinate-legislation section entries. One
// document per (section_id, lang): the first time a section is requested in
// a given language it is translated on the fly and stored here, so
// subsequent requests are served directly from the cache. `section_id`
// references subordinate_sections._id (SubordinateSectionModel).
const SubordinateSectionTranslationSchema = new mongoose.Schema(
  {
    section_id: { type: mongoose.Schema.Types.ObjectId, index: true },
    lang: { type: String, index: true },
    item_id: { type: mongoose.Schema.Types.ObjectId },
    section_number: { type: String },
    section_title: { type: String },
    content: { type: String },
    footnote: { type: String },
    source: { type: String, default: 'runtime' }, // runtime | manual
    last_read_at: { type: Date }, // last time this cached translation was served to a reader
  },
  { collection: 'subordinate_section_translations', strict: false, timestamps: true }
)

SubordinateSectionTranslationSchema.index({ section_id: 1, lang: 1 }, { unique: true })

export default mongoose.models.SubordinateSectionTranslation ||
  mongoose.model('SubordinateSectionTranslation', SubordinateSectionTranslationSchema)
