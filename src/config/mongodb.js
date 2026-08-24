/**
 * MongoDB Connection Singleton via Mongoose
 * 
 * Reuses a single connection across hot-reloads in development
 * and across serverless invocations via global caching.
 * 
 * bufferCommands: true (default) — Mongoose queues operations
 * until connection is ready. This is REQUIRED for the connect-once
 * strategy used in models/index.js.
 */
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGO_URI;

if (!MONGODB_URI) {
  throw new Error('MONGO_URI environment variable is not defined');
}

/**
 * Global cache to prevent multiple connections during hot-reload (dev)
 * and across serverless function invocations (prod).
 */
let cached = global._mongooseConnection;

if (!cached) {
  cached = global._mongooseConnection = { conn: null, promise: null };
}

/**
 * Returns a Mongoose connection, creating one if necessary.
 * Connection is pooled and reused across requests.
 */
export async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      // bufferCommands defaults to true — Mongoose queues all
      // operations until the connection is established.
      // bufferTimeoutMS is a safety net: fail buffered ops
      // if connection hasn't been established within 10s.
      bufferTimeoutMS: 10000,
    });

    // Log connection events (once)
    mongoose.connection.on('connected', () => {
      console.log('[MongoDB] Connected successfully');
    });
    mongoose.connection.on('error', (err) => {
      console.error('[MongoDB] Connection error:', err.message);
    });
    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] Disconnected');
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}
