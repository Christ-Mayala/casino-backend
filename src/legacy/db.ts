import { MongoClient, Db } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

function getUri(): string | null {
  return process.env.MONGODB_URI || process.env.MONGO_URI || null;
}

export async function connectDatabase(): Promise<Db | null> {
  if (db) return db;
  const uri = getUri();
  if (!uri) {
    console.warn('⚠️ MongoDB URI not configured. Set MONGODB_URI or MONGO_URI');
    return null;
  }

  if (uri === 'memory://') {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mem = await MongoMemoryServer.create();
    client = new MongoClient(mem.getUri());
  } else {
    client = new MongoClient(uri);
  }
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    db = client.db(process.env.MONGODB_DB_NAME || 'super-u');
    return db;
  } catch (e) {
    console.error('❌ Failed to connect to MongoDB:', e);
    return null;
  }
}

export async function getDatabase(): Promise<Db | null> {
  if (!db) await connectDatabase();
  return db;
}

export async function getCollections() {
  const database = await getDatabase();
  if (!database) throw new Error('MongoDB unavailable');
  return {
    users: database.collection('users'),
    categories: database.collection('categories'),
    products: database.collection('products'),
    favorites: database.collection('favorites'),
    ratings: database.collection('ratings'),
    cartItems: database.collection('cart_items'),
    pickupSlots: database.collection('pickup_slots'),
    orders: database.collection('orders'),
    orderItems: database.collection('order_items'),
    refreshTokens: database.collection('refresh_tokens'),
    activityLogs: database.collection('activity_logs'),
    staff: database.collection('staff'),
  } as const;
}
