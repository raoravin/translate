import mongoose from 'mongoose'

// Full English content for a single Constitution of India entry (article /
// schedule item / appendix item / amendment section). The `_id` of an entry
// matches the entry `_id` nested inside coi_hierarchy. strict:false tolerates
// the embedded parent/section sub-documents stored on each record.
const CoiEntrySchema = new mongoose.Schema(
  {
    type: { type: String, index: true },
    number: { type: String },
    title: { type: String },
    slug: { type: String, index: true },
    content: { type: String },
    footnotes: { type: Array },
    parent: { type: Object },
    section: { type: Object },
  },
  { collection: 'coi_entries', strict: false }
)

CoiEntrySchema.index({ 'parent._id': 1 })

export default mongoose.models.CoiEntry ||
  mongoose.model('CoiEntry', CoiEntrySchema)
