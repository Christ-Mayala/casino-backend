import mongoose from 'mongoose';
import { env } from './env';
import { log, error } from './logger';

export async function connectMongo(maxRetries = 5): Promise<void> {
  // Support in-memory MongoDB for local/dev when MONGO_URI=memory://
  if (env.mongoUri === 'memory://') {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    log('MongoDB (in-memory) connected');
    return;
  }

  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      await mongoose.connect(env.mongoUri, { dbName: process.env.MONGODB_DB_NAME || 'super-u' } as any);
      log(`MongoDB connected (db=${process.env.MONGODB_DB_NAME || 'super-u'})`);
      return;
    } catch (err) {
      attempt++;
      error(`MongoDB connection failed (attempt ${attempt}/${maxRetries})`, err);
      await new Promise((r) => setTimeout(r, 1000 * Math.min(10, attempt * 2)));
    }
  }
  throw new Error('MongoDB connection failed after retries');
}
