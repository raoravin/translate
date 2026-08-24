import mongoose from 'mongoose'

// Navigation tree for the Constitution of India (Parts, Schedules, Appendix,
// Amendments). Each document carries title_translations for every supported
// language and nests sections -> entries used to bootstrap the UI. strict:false
// keeps the model tolerant of the rich/nested shape stored in the collection.
const CoiHierarchySchema = new mongoose.Schema(
  {
    type: { type: String, index: true },
    number: { type: String },
    title: { type: String },
    title_translations: { type: Object },
    slug: { type: String, index: true },
    meta: { type: Object },
    sections: { type: Array },
  },
  { collection: 'coi_hierarchy', strict: false }
)

export default mongoose.models.CoiHierarchy ||
  mongoose.model('CoiHierarchy', CoiHierarchySchema)
