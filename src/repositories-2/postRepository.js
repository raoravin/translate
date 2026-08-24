/**
 * Post Repository v2 — Fast, production-grade data access.
 *
 * Key differences vs v1:
 *  - Awaits connectDB() before every query (no buffering reliance)
 *  - Uses lean find() instead of heavy aggregation where possible
 */
import mongoose from 'mongoose';
import { connectDB } from '../config/mongodb.js';
import { Post, Media, Category, User, Tag } from '../model/index.js';

function getPublishedMatch(source) {
  const match = { _status: 'published' };
  if (source === 'desktop') {
    match.onlyForMobile = { $nin: [true, "true", 1] };
  }
  return match;
}

// ─── Hindi category exclusion for search ─────────────────────────
// Hindi categories consistently use a "-hindi" slug suffix (or the
// bare "hindi" slug), e.g. "supreme-court-hindi", "judgments-hindi".
let hindiCategoryIdsCache = null;
let hindiCategoryIdsCacheAt = 0;
const HINDI_CACHE_TTL_MS = 5 * 60 * 1000;

async function getHindiCategoryIds() {
  const now = Date.now();
  if (hindiCategoryIdsCache && now - hindiCategoryIdsCacheAt < HINDI_CACHE_TTL_MS) {
    return hindiCategoryIdsCache;
  }
  await connectDB();
  const hindiCategories = await Category.find(
    { slug: { $regex: /hindi/i } },
    { _id: 1 }
  ).lean().exec();
  hindiCategoryIdsCache = hindiCategories.map((c) => c._id);
  hindiCategoryIdsCacheAt = now;
  return hindiCategoryIdsCache;
}

const POST_FIELDS = {
  _id: 1,
  title: 1,
  slug: 1,
  publishedAt: 1,
  updatedAt: 1,
  createdAt: 1,
  _status: 1,
  type: 1,
  excerpt: 1,
  meta: 1,
  heroImage: 1,
  categories: 1,
  authors: 1,
  tags: 1,
  isPremium: 1,
};

async function populateRelations(posts) {
  if (!posts.length) return posts;

  const heroIds = new Set();
  const categoryIds = new Set();
  const authorIds = new Set();
  const tagIds = new Set();

  for (const p of posts) {
    if (p.heroImage) heroIds.add(String(p.heroImage));
    (p.categories || []).forEach((id) => categoryIds.add(String(id)));
    (p.authors || []).forEach((id) => authorIds.add(String(id)));
    (p.tags || []).forEach((id) => tagIds.add(String(id)));
  }

  const [hero, cats, auths, tgs] = await Promise.all([
    heroIds.size
      ? Media.find(
          { _id: { $in: [...heroIds] } },
          { url: 1, alt: 1, caption: 1, width: 1, height: 1, sizes: 1, filename: 1, mimeType: 1 }
        ).lean().exec()
      : [],
    categoryIds.size
      ? Category.find(
          { _id: { $in: [...categoryIds] } },
          { title: 1, slug: 1, breadcrumbs: 1 }
        ).lean().exec()
      : [],
    authorIds.size
      ? User.find(
          { _id: { $in: [...authorIds] } },
          { name: 1, email: 1, slug: 1 }
        ).lean().exec()
      : [],
    tagIds.size
      ? Tag.find(
          { _id: { $in: [...tagIds] } },
          { title: 1, slug: 1 }
        ).lean().exec()
      : [],
  ]);

  const heroMap = new Map(hero.map((m) => [String(m._id), m]));
  const catMap = new Map(cats.map((c) => [String(c._id), c]));
  const authMap = new Map(auths.map((a) => [String(a._id), a]));
  const tagMap = new Map(tgs.map((t) => [String(t._id), t]));

  for (const p of posts) {
    p._heroImage = p.heroImage ? heroMap.get(String(p.heroImage)) || null : null;
    p._categories = (p.categories || []).map((id) => catMap.get(String(id))).filter(Boolean);
    p._authors = (p.authors || []).map((id) => authMap.get(String(id))).filter(Boolean);
    p._tags = (p.tags || []).map((id) => tagMap.get(String(id))).filter(Boolean);
  }

  return posts;
}

async function paginated(match, { page = 1, limit = 10, sort = -1 }) {
  await connectDB();
  const skip = (page - 1) * limit;

  const [posts, total] = await Promise.all([
    Post.find(match, POST_FIELDS)
      .sort({ publishedAt: sort })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),
    Post.countDocuments(match).exec(),
  ]);

  await populateRelations(posts);
  return { posts, total };
}

const DETAIL_FIELDS = {
  ...POST_FIELDS,
  content: 1,
  lexical: 1,
  highlights: 1,
  relatedPosts: 1,
};

async function populateDetail(post, source) {
  if (!post) return null;

  const heroIds = new Set();
  const categoryIds = new Set();
  const authorIds = new Set();
  const tagIds = new Set();
  const relatedIds = new Set();

  if (post.heroImage) heroIds.add(String(post.heroImage));
  if (post.meta?.image) heroIds.add(String(post.meta.image));
  (post.categories || []).forEach((id) => categoryIds.add(String(id)));
  (post.authors || []).forEach((id) => authorIds.add(String(id)));
  (post.tags || []).forEach((id) => tagIds.add(String(id)));
  (post.relatedPosts || []).forEach((id) => relatedIds.add(String(id)));

  const [media, cats, auths, tgs, related] = await Promise.all([
    heroIds.size
      ? Media.find(
          { _id: { $in: [...heroIds] } },
          { url: 1, alt: 1, caption: 1, width: 1, height: 1, sizes: 1 }
        ).lean().exec()
      : [],
    categoryIds.size
      ? Category.find(
          { _id: { $in: [...categoryIds] } },
          { title: 1, slug: 1, breadcrumbs: 1 }
        ).lean().exec()
      : [],
    authorIds.size
      ? User.find(
          { _id: { $in: [...authorIds] } },
          { name: 1, email: 1, slug: 1, bio: 1 }
        ).lean().exec()
      : [],
    tagIds.size
      ? Tag.find(
          { _id: { $in: [...tagIds] } },
          { title: 1, slug: 1 }
        ).lean().exec()
      : [],
    relatedIds.size
      ? Post.find(
          { _id: { $in: [...relatedIds] }, ...getPublishedMatch(source) },
          { title: 1, slug: 1, publishedAt: 1, heroImage: 1 }
        ).lean().exec()
      : [],
  ]);

  const mediaMap = new Map(media.map((m) => [String(m._id), m]));

  post._heroImage = post.heroImage ? mediaMap.get(String(post.heroImage)) || null : null;
  post._metaImage = post.meta?.image ? mediaMap.get(String(post.meta.image)) || null : null;
  post._categories = (post.categories || []).map((id) => {
    return cats.find((c) => String(c._id) === String(id));
  }).filter(Boolean);
  post._authors = (post.authors || []).map((id) => {
    return auths.find((a) => String(a._id) === String(id));
  }).filter(Boolean);
  post._tags = (post.tags || []).map((id) => {
    return tgs.find((t) => String(t._id) === String(id));
  }).filter(Boolean);

  // Populate hero images for related posts in one extra query
  const relatedHeroIds = related.map((r) => r.heroImage).filter(Boolean);
  if (relatedHeroIds.length) {
    const relatedHero = await Media.find(
      { _id: { $in: relatedHeroIds } },
      { url: 1, alt: 1, sizes: 1 }
    ).lean().exec();
    const relatedHeroMap = new Map(relatedHero.map((m) => [String(m._id), m]));
    for (const r of related) {
      r._heroImage = r.heroImage ? relatedHeroMap.get(String(r.heroImage)) || null : null;
    }
  }
  post._relatedPosts = related;

  return post;
}

class PostRepositoryV2 {
  async findBySlug(slug, source) {
    await connectDB();
    const post = await Post.findOne(
      { ...getPublishedMatch(source), slug },
      DETAIL_FIELDS
    ).lean().exec();
    return populateDetail(post, source);
  }

  async findById(id, source) {
    await connectDB();
    const post = await Post.findOne(
      { _id: id, ...getPublishedMatch(source) },
      DETAIL_FIELDS
    ).lean().exec();
    return populateDetail(post, source);
  }

  async findByWordpressId(wordpressId, source) {
    await connectDB();
    const post = await Post.findOne(
      { wordpress_id: Number(wordpressId), ...getPublishedMatch(source) },
      DETAIL_FIELDS
    ).lean().exec();
    return populateDetail(post, source);
  }

  async findRelated(postId, categoryIds, limit = 6, source) {
    if (!categoryIds?.length) return [];
    await connectDB();
    const posts = await Post.find(
      {
        ...getPublishedMatch(source),
        _id: { $ne: postId },
        categories: { $in: categoryIds },
      },
      { title: 1, slug: 1, publishedAt: 1, heroImage: 1 }
    )
      .sort({ publishedAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    // Populate hero images in one batched query
    const heroIds = posts.map((p) => p.heroImage).filter(Boolean);
    if (heroIds.length) {
      const heroes = await Media.find(
        { _id: { $in: heroIds } },
        { url: 1, alt: 1, sizes: 1 }
      ).lean().exec();
      const heroMap = new Map(heroes.map((m) => [String(m._id), m]));
      for (const p of posts) {
        p._heroImage = p.heroImage ? heroMap.get(String(p.heroImage)) || null : null;
      }
    }
    return posts;
  }

  async findByCategory(categoryId, { page = 1, limit = 10, sort = 'latest', source } = {}) {
    const match = {
      ...getPublishedMatch(source),
      ...(categoryId && { categories: categoryId }),
    };
    return paginated(match, { page, limit, sort: sort === 'oldest' ? 1 : -1 });
  }

  async findByTag(tagId, { page = 1, limit = 12, sort = 'latest', source } = {}) {
    const match = {
      ...getPublishedMatch(source),
      tags: tagId,
    };
    return paginated(match, { page, limit, sort: sort === 'oldest' ? 1 : -1 });
  }

  async findByAuthor(authorId, { page = 1, limit = 10, sort = 'latest', source } = {}) {
    const match = {
      ...getPublishedMatch(source),
      authors: authorId,
    };
    return paginated(match, { page, limit, sort: sort === 'oldest' ? 1 : -1 });
  }

  async search(query, { page = 1, limit = 10, source } = {}) {
    await connectDB();
    const skip = (page - 1) * limit;
    const hindiCategoryIds = await getHindiCategoryIds();
    const match = {
      ...getPublishedMatch(source),
      $text: { $search: query },
      ...(hindiCategoryIds.length && { categories: { $nin: hindiCategoryIds } }),
    };

    const [posts, total] = await Promise.all([
      Post.find(match, { ...POST_FIELDS, _relevanceScore: { $meta: 'textScore' } })
        .sort({ _relevanceScore: { $meta: 'textScore' } })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Post.countDocuments(match).exec(),
    ]);

    await populateRelations(posts);
    return { posts, total };
  }

  async searchPartial(query, { page = 1, limit = 10, source } = {}) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hindiCategoryIds = await getHindiCategoryIds();
    const match = {
      ...getPublishedMatch(source),
      title: { $regex: escaped, $options: 'i' },
      ...(hindiCategoryIds.length && { categories: { $nin: hindiCategoryIds } }),
    };
    return paginated(match, { page, limit, sort: -1 });
  }

  /**
   * Find recommended posts using a dynamic scoring system (curated > tags > categories > latest).
   * @param {import('mongoose').Types.ObjectId|string} postId
   * @param {{ categoryIds: Array, tagIds: Array, curatedIds: Array, limit: number }} options
   * @returns {Promise<Array>}
   */
  async findRecommendations(postId, { categoryIds = [], tagIds = [], curatedIds = [], limit = 12, source } = {}) {
    await connectDB();

    const parseId = (id) => {
      if (!id) return null;
      try {
        return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
      } catch {
        return null;
      }
    };

    const parsedPostId = parseId(postId);
    const parsedCuratedIds = (curatedIds || []).map(parseId).filter(Boolean);
    const parsedCategoryIds = (categoryIds || []).map(parseId).filter(Boolean);
    const parsedTagIds = (tagIds || []).map(parseId).filter(Boolean);

    const pipeline = [
      {
        $match: {
          ...getPublishedMatch(source),
          _id: { $ne: parsedPostId }
        }
      },
      {
        $addFields: {
          isCurated: { $cond: [{ $in: ["$_id", parsedCuratedIds] }, 1, 0] },
          tagOverlap: {
            $cond: [
              { $isArray: "$tags" },
              { $size: { $setIntersection: ["$tags", parsedTagIds] } },
              0
            ]
          },
          categoryOverlap: {
            $cond: [
              { $isArray: "$categories" },
              { $size: { $setIntersection: ["$categories", parsedCategoryIds] } },
              0
            ]
          }
        }
      },
      {
        $addFields: {
          score: {
            $add: [
              { $multiply: ["$isCurated", 1000] },
              { $multiply: ["$tagOverlap", 10] },
              "$categoryOverlap"
            ]
          }
        }
      },
      { $sort: { score: -1, publishedAt: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          title: 1,
          slug: 1,
          publishedAt: 1,
          heroImage: 1,
          categories: 1,
          authors: 1,
          tags: 1,
        }
      }
    ];

    const posts = await Post.aggregate(pipeline).exec();
    await populateRelations(posts);
    return posts;
  }
}

export const postRepository = new PostRepositoryV2();
