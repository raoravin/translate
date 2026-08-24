import mongoose from 'mongoose'

// Runtime translation cache for news posts. One document per (post_id, lang):
// the first time a post is requested in a given language it is translated on
// the fly and stored here, so subsequent requests are served directly from
// the cache. `post_id` references the Payload-managed `posts` collection's
// `_id` (see src/model/index.js Post).
const PostTranslationSchema = new mongoose.Schema(
  {
    post_id: { type: mongoose.Schema.Types.ObjectId, index: true },
    lang: { type: String, index: true },
    slug: { type: String },
    title: { type: String },
    meta_description: { type: String },
    content: { type: String }, // translated HTML (lexicalToHtml output); response field is renamed to post_content
    source: { type: String, default: 'runtime' }, // runtime | manual
    last_read_at: { type: Date }, // last time this cached translation was served to a reader
  },
  { collection: 'post_translations', strict: false, timestamps: true }
)

PostTranslationSchema.index({ post_id: 1, lang: 1 }, { unique: true })

export default mongoose.models.PostTranslation ||
  mongoose.model('PostTranslation', PostTranslationSchema)
