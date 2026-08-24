import mongoose from 'mongoose'

// Runtime translation cache for Constitution of India entries. One document per
// (entry_id, lang): the first time an entry is requested in a given language it
// is translated on the fly and stored here, so subsequent requests are served
// directly from the cache. `entry_id` references coi_entries._id.
const CoiTranslationSchema = new mongoose.Schema(
  {
    entry_id: { type: mongoose.Schema.Types.ObjectId, index: true },
    lang: { type: String, index: true },
    type: { type: String },
    number: { type: String },
    slug: { type: String },
    title: { type: String },
    content: { type: String },
    footnotes: { type: Array },
    source: { type: String, default: 'runtime' }, // runtime | manual
    last_read_at: { type: Date }, // last time this cached translation was served to a reader
  },
  { collection: 'coi_translations', strict: false, timestamps: true }
)

CoiTranslationSchema.index({ entry_id: 1, lang: 1 }, { unique: true })

export default mongoose.models.CoiTranslation ||
  mongoose.model('CoiTranslation', CoiTranslationSchema)
