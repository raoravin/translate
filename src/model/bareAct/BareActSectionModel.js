import mongoose from 'mongoose'

const BareActSectionSchema = new mongoose.Schema(
  {
    act_id: { type: mongoose.Schema.Types.ObjectId, index: true },
    act_title: { type: String },
    chapter_id: { type: mongoose.Schema.Types.ObjectId, default: null },
    chapter_item_id: { type: mongoose.Schema.Types.ObjectId, default: null },
    type: { type: String, index: true },
    section_number: { type: String },
    section_title: { type: String },
    section_id_ref: { type: String },
    content: { type: String },
    footnote: { type: String, default: null },
    slug: { type: String },
    state: { type: String },
    state_slug: { type: String },
    // Set instead of section_title/section_number's plain "Section" framing
    // when this entry is actually an Order/Form/Schedule part, etc.
    // (e.g. order_type: "order", order_title: "Order XXIX PLEADINGS GENERALLY").
    order_title: { type: String, default: null },
    order_type: { type: String, default: null },
  },
  { collection: 'sections' }
)

BareActSectionSchema.index({ act_id: 1, chapter_id: 1 })
BareActSectionSchema.index({ act_id: 1, chapter_item_id: 1 })

export default mongoose.models.BareActSection || mongoose.model('BareActSection', BareActSectionSchema)
