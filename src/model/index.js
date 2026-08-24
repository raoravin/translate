/**
 * Mongoose Models for Payload CMS Collections
 * 
 * These schemas map to the existing Payload-created MongoDB collections.
 * We use { strict: false } to avoid conflicts with Payload's own schema
 * management while still getting Mongoose query benefits.
 * 
 * CONNECTION STRATEGY:
 * connectDB() is called once at module load time. Mongoose buffers all
 * query operations until the connection is established, so repositories
 * don't need to call connectDB() before every query. This is safe because:
 *  1. The connection promise is cached (no duplicate connections)
 *  2. Mongoose's built-in buffering queues ops until ready
 *  3. If connection fails, buffered ops reject with a clear error
 * 
 * Collections:
 *  - posts       → Post
 *  - categories  → Category
 *  - users       → User
 *  - media       → Media
 *  - searches    → Search
 */
import mongoose from 'mongoose';
import { connectDB } from '../config/mongodb.js';

// ─── Initialize connection once at module load ──────────────────
// Mongoose buffers commands, so queries work immediately even 
// before the connection is fully established.
connectDB();

// ─── Helper: Get or create model (prevents OverwriteModelError in dev) ───
function getModel(name, schema, collection) {
  return mongoose.models[name] || mongoose.model(name, schema, collection);
}

// ─── Post Schema ────────────────────────────────────────────────
const postSchema = new mongoose.Schema({}, {
  strict: false,
  collection: 'posts',
  timestamps: false,
});

export const Post = getModel('Post', postSchema, 'posts');

// ─── Category Schema ───────────────────────────────────────────
const categorySchema = new mongoose.Schema({}, {
  strict: false,
  collection: 'categories',
  timestamps: false,
});

export const Category = getModel('Category', categorySchema, 'categories');

// ─── User (Author) Schema ──────────────────────────────────────
const userSchema = new mongoose.Schema({}, {
  strict: false,
  collection: 'cms_users',
  timestamps: false,
});

export const User = getModel('CmsUser', userSchema, 'cms_users');

// ─── Media Schema ───────────────────────────────────────────────
const mediaSchema = new mongoose.Schema({}, {
  strict: false,
  collection: 'media',
  timestamps: false,
});

export const Media = getModel('Media', mediaSchema, 'media');

// ─── Search Schema ──────────────────────────────────────────────
const searchSchema = new mongoose.Schema({}, {
  strict: false,
  collection: 'searches',
  timestamps: false,
});

export const Search = getModel('Search', searchSchema, 'searches');

// ─── Tag Schema ─────────────────────────────────────────────────
const tagSchema = new mongoose.Schema({}, {
  strict: false,
  collection: 'tags',
  timestamps: false,
});

export const Tag = getModel('Tag', tagSchema, 'tags');
