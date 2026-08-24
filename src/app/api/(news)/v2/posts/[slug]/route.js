import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { Types } from 'mongoose'
import { postRepository } from '@/repositories-2/postRepository.js'
import { lexicalToHtml } from '@/lib/v2/lexicalToHtml.js'
import { Media } from '@/model/index.js'
import { resolveLang } from '@/lib/coi'
import { translateTexts } from '@/lib/googleTranslate'
import PostTranslationModel from '@/model/post/PostTranslationModel'

export const dynamic = 'force-dynamic'

// ─── Helper: Extract image sizes from Payload heroImage ─────────
function buildImageSizes(heroImage) {
  if (!heroImage?.sizes) return {}
  const sizes = {}
  for (const [key, value] of Object.entries(heroImage.sizes)) {
    if (value?.url) {
      sizes[key] = value.url
    }
  }
  return sizes
}

// ─── Helper: Build similar post in v2 shape ─────────────────────
function shapeSimilarPost(post) {
  const heroImage = post._heroImage || null
  const categories = post._categories || []
  return {
    ID: post._id,
    post_title: post.title || '',
    post_name: post.slug || '',
    post_date: post.publishedAt || post.createdAt || null,
    thumbnail_url: heroImage?.url || null,
    imageSizes: buildImageSizes(heroImage),
    categories: categories.map((c) => c.title || c),
  }
}

// ─── Helper: Extract the first <a href="..."> from HTML content ─
function extractFirstLink(htmlContent) {
  if (!htmlContent) return null
  const match = htmlContent.match(/<a\s+[^>]*href="([^"]+)"/)
  return match ? match[1] : null
}

// ─── Helper: Resolve media IDs to full media objects in Lexical tree ───
async function resolveMediaInLexical(lexicalJson) {
  if (!lexicalJson) return lexicalJson

  const root = lexicalJson.root || lexicalJson
  const mediaIds = new Set()

  // Collect all media IDs from the tree
  function collectMediaIds(node) {
    if (!node) return

    // Check for mediaBlock with media as ID
    if (node.type === 'block' && node.fields?.blockType === 'mediaBlock' && typeof node.fields?.media === 'string') {
      mediaIds.add(node.fields.media)
    }

    // Check for upload nodes
    if (node.type === 'upload' && typeof node.value === 'string') {
      mediaIds.add(node.value)
    }

    if (Array.isArray(node.children)) {
      node.children.forEach(collectMediaIds)
    }
  }

  if (root.children) {
    root.children.forEach(collectMediaIds)
  }

  // Fetch all media in one query
  const mediaMap = new Map()
  if (mediaIds.size > 0) {
    const validIds = Array.from(mediaIds).filter(id => Types.ObjectId.isValid(id))
    if (validIds.length > 0) {
      const mediaDocuments = await Media.find({ _id: { $in: validIds } })
      mediaDocuments.forEach(doc => {
        mediaMap.set(doc._id.toString(), {
          _id: doc._id,
          url: doc.url,
          alt: doc.alt || '',
          caption: doc.caption || '',
          filename: doc.filename,
          mimeType: doc.mimeType,
          sizes: doc.sizes || {},
        })
      })
    }
  }

  // Replace media IDs with full objects
  function resolveMediaIds(node) {
    if (!node) return

    // Resolve mediaBlock media ID to object
    if (node.type === 'block' && node.fields?.blockType === 'mediaBlock' && typeof node.fields?.media === 'string') {
      const mediaObj = mediaMap.get(node.fields.media)
      if (mediaObj) {
        node.fields.media = mediaObj
      }
    }

    // Resolve upload node media ID to object
    if (node.type === 'upload' && typeof node.value === 'string') {
      const mediaObj = mediaMap.get(node.value)
      if (mediaObj) {
        node.value = mediaObj
      }
    }

    if (Array.isArray(node.children)) {
      node.children.forEach(resolveMediaIds)
    }
  }

  if (root.children) {
    root.children.forEach(resolveMediaIds)
  }

  return lexicalJson
}

export async function GET(request, { params }) {
  const { slug } = await params

  try {
    const { searchParams } = new URL(request.url)
    const lang = resolveLang(searchParams.get('tr'))

    const isShortNumeric = /^\d{1,9}$/.test(slug)
    const post = await (
      isShortNumeric
        ? postRepository.findByWordpressId(slug)
        : Types.ObjectId.isValid(slug)
          ? postRepository.findById(slug)
          : postRepository.findBySlug(slug)
    )

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // ─── Extract data from Payload document ───────────────────
    const heroImage = post._heroImage || null
    const metaImage = post._metaImage || null
    const authors = post._authors || []
    const categories = post._categories || []
    const tags = post._tags || []

    // Build the HTML content field
    // - WordPress-migrated posts: content is already an HTML string
    // - New Payload posts: content is a Lexical JSON object → convert to HTML
    let postContent = ''
    let lexicalForOutput = null
    if (post.lexical) {
      // Resolve media IDs to full objects before converting to HTML
      lexicalForOutput = await resolveMediaInLexical(post.lexical)
    } else if (typeof post.content === 'object' && post.content?.root) {
      lexicalForOutput = await resolveMediaInLexical(post.content)
    }
    const englishContent = lexicalForOutput ? lexicalToHtml(lexicalForOutput) : ''

    // Resolve a non-English language through the translation cache:
    //   1. Cache hit in post_translations -> serve it directly.
    //   2. Cache miss                      -> translate at runtime, cache it, serve it.
    //   3. Translation fails                -> fall back to the English post.
    // The whole post is translated as HTML (format: 'html') rather than
    // per Lexical text-leaf — translating leaves independently breaks
    // sentences apart wherever a link/bold/italic span sits mid-sentence,
    // which loses context and produces garbled output (e.g. repeated names).
    let translatedTitle = post.title || ''
    let translatedMetaDescription = post.meta?.description || ''
    postContent = englishContent
    if (lang !== 'en') {
      const cached = await PostTranslationModel.findOne({ post_id: post._id, lang }).lean()
      if (cached) {
        if (cached.title) translatedTitle = cached.title
        if (cached.meta_description) translatedMetaDescription = cached.meta_description
        if (cached.content) postContent = cached.content
        // Record that this cached translation was served.
        // timestamps:false so a read doesn't bump `updatedAt` (content-change time).
        await PostTranslationModel.updateOne(
          { post_id: post._id, lang },
          { $set: { last_read_at: new Date() } },
          { timestamps: false }
        )
      } else {
        try {
          const [title, metaDescription, content] = await translateTexts(
            [post.title, post.meta?.description, englishContent],
            lang
          )

          // Upsert so concurrent misses don't create duplicates.
          await PostTranslationModel.updateOne(
            { post_id: post._id, lang },
            {
              $set: {
                slug: post.slug,
                title: title ?? post.title,
                meta_description: metaDescription ?? post.meta?.description,
                content: content ?? englishContent,
                source: 'runtime',
                last_read_at: new Date(),
              },
            },
            { upsert: true }
          )

          if (title) translatedTitle = title
          if (metaDescription) translatedMetaDescription = metaDescription
          postContent = content ?? englishContent
        } catch (err) {
          // Translation failed — fall back to English.
          console.error('[news/v2/posts/translate]', err)
        }
      }
    }

    // Determine the author
    const author = authors[0] || null
    const authorEmail = author?.email || 'courtbook.in@gmail.com'
    const authorName = author?.name || 'Court Book (Admin)'

    // Build gravatar
    const hash = crypto
      .createHash('md5')
      .update(authorEmail.trim().toLowerCase())
      .digest('hex')
    const avatar = `https://www.gravatar.com/avatar/${hash}?s=256&d=identicon`

    // Build image sizes
    const imageSizes = buildImageSizes(heroImage)

    // Tags & categories as string arrays (v2 format)
    const tagNames = tags.map((t) => t.title || '')
    const categoryNames = categories.map((c) => c.title || '')

    // Meta keywords: tags joined by comma
    const meta_keyword = tagNames.length > 0 ? tagNames.join(', ') : ''

    // Extract file download URL from HTML content
    const file_download_url = extractFirstLink(postContent)

    // ─── Fetch recommendations (at least 12 posts) ────────────
    const categoryIds = post.categories || []
    const tagIds = post.tags || []
    const curatedIds = post.relatedPosts || []
    const relatedRaw = await postRepository.findRecommendations(
      post._id,
      {
        categoryIds,
        tagIds,
        curatedIds,
        limit: 12
      }
    )
    const similarPosts = relatedRaw.map(shapeSimilarPost)

    // ─── Build v2-compatible response ─────────────────────────
    const formattedPost = {
      ID: post._id,
      post_author: author?._id || 1,
      post_date: post.publishedAt || null,
      post_date_gmt: post.publishedAt || null,
      post_content: postContent,
      // English: raw Lexical JSON, as before. Other languages: no translated
      // Lexical tree exists, so fall back to the translated HTML (post_content)
      // rather than returning English lexContent alongside translated fields.
      lexContent: lang === 'en' ? post.lexical || null : postContent || null,
      post_title: translatedTitle,
      post_excerpt: translatedMetaDescription,
      post_status: post._status === 'published' ? 'publish' : post._status || 'publish',
      comment_status: 'open',
      ping_status: 'open',
      post_password: '',
      post_name: post.slug || '',
      to_ping: '',
      pinged: '',
      post_modified: post.updatedAt || null,
      post_modified_gmt: post.updatedAt || null,
      post_content_filtered: '',
      post_parent: 0,
      menu_order: 0,
      post_type: 'post',
      post_mime_type: '',
      comment_count: 0,
      author_id: author?._id || 1,
      author_name: authorName,
      author_email: authorEmail,
      thumbnail_id: heroImage?._id?.toString() || null,
      thumbnail_url: heroImage?.url || metaImage?.url || null,
      meta_description: translatedMetaDescription,
      language: lang,
      image_source: null,
      isPremium: !!post.isPremium,
      file_download_url,
      tags: tagNames,
      categories: categoryNames,
      meta_keyword,
      imageSizes,
      similarPosts,
      relatedPosts: (post._relatedPosts || []).map(shapeSimilarPost),
      author: {
        ID: author?._id || 1,
        display_name: authorName,
        user_email: authorEmail,
        website: 'https://courtbook.in',
        facebook: null,
        twitter: null,
        linkedin: null,
        instagram: null,
        author_image: avatar,
      },
    }

    return NextResponse.json(formattedPost, { status: 200 })
  } catch (error) {
    console.error('Error fetching post:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
