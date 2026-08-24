import mongoose from 'mongoose'

const SubordinateSectionSchema = new mongoose.Schema(
  {
    item_id: { type: mongoose.Schema.Types.ObjectId },
    item_title: { type: String },
    type: { type: String, index: true },
    act_id: { type: String },
    act_short_title: { type: String },
    section_number: { type: String },
    section_title: { type: String },
    content: { type: String },
    footnote: { type: String, default: null },
  },
  { collection: 'subordinate_sections' }
)

SubordinateSectionSchema.index({ item_id: 1 })

export default mongoose.models.SubordinateSection ||
  mongoose.model('SubordinateSection', SubordinateSectionSchema)
