import mongoose from 'mongoose'

// Runtime translation cache for bare-act section entries. One document per
// (section_id, lang): the first time a section is requested in a given
// language it is translated on the fly and stored here, so subsequent
// requests are served directly from the cache. `section_id` references
// sections._id (BareActSectionModel).
const BareActSectionTranslationSchema = new mongoose.Schema(
  {
    section_id: { type: mongoose.Schema.Types.ObjectId, index: true },
    lang: { type: String, index: true },
    act_id: { type: mongoose.Schema.Types.ObjectId },
    section_number: { type: String },
    section_title: { type: String },
    content: { type: String },
    footnote: { type: String },
    source: { type: String, default: 'runtime' }, // runtime | manual
    last_read_at: { type: Date }, // last time this cached translation was served to a reader
  },
  { collection: 'bareact_section_translations', strict: false, timestamps: true }
)

BareActSectionTranslationSchema.index({ section_id: 1, lang: 1 }, { unique: true })

export default mongoose.models.BareActSectionTranslation ||
  mongoose.model('BareActSectionTranslation', BareActSectionTranslationSchema)
