import { ObjectId } from 'mongodb';
import { getCollections } from './db';
import { notifyLowStock } from '../services/notify';

export interface IStorage {
  getUser(id: string): Promise<any | undefined>;
  getUserByUsername(username: string): Promise<any | undefined>;
  getUserByEmail(email: string): Promise<any | undefined>;
  createUser(user: any): Promise<any>;
  updateUser(id: string, data: any): Promise<any | undefined>;

  getCategories(): Promise<any[]>;
  getCategoryById(id: string): Promise<any | undefined>;
  getCategoryBySlug(slug: string): Promise<any | undefined>;
  createCategory(category: any): Promise<any>;

  getProducts(filters?: { search?: string; categoryId?: string; sort?: string; page?: number; pageSize?: number }): Promise<{ results: any[]; count: number }>;
  getProductById(id: string): Promise<any | undefined>;
  getProductSuggestions(query: string): Promise<{ id: string; name: string; thumbUrl: string }[]>;
  createProduct(product: any): Promise<any>;
  updateProductRating(productId: string): Promise<void>;

  getUserFavorites(userId: string): Promise<(any & { product: any })[]>;
  addFavorite(userId: string, productId: string): Promise<any>;
  removeFavorite(userId: string, productId: string): Promise<void>;

  getProductRatings(productId: string, page?: number): Promise<{ results: (any & { user: { id: string; username: string } })[], count: number }>;
  createRating(userId: string, rating: any): Promise<any>;

  getUserCart(userId: string): Promise<(any & { product: any })[]>;
  getSessionCart(sessionId: string): Promise<(any & { product: any })[]>;
  addToCart(item: any): Promise<any>;
  updateCartItem(id: string, quantity: number): Promise<any | undefined>;
  removeFromCart(id: string): Promise<void>;

  getPickupSlots(date?: string): Promise<any[]>;
  getPickupSlotById(id: string): Promise<any | undefined>;
  createPickupSlot(slot: any): Promise<any>;
  updateSlotCapacity(id: string, remaining: number): Promise<void>;

  getOrders(userId?: string): Promise<any[]>;
  getOrderById(id: string): Promise<(any & { items: any[], pickupSlot: any }) | undefined>;
  createOrder(order: any, items: any[]): Promise<any>;
  updateOrderStatus(id: string, status: string, codes?: { tempPickupCode?: string; finalPickupCode?: string }): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string) {
    const { users } = await getCollections();
    const user = await users.findOne({ _id: new ObjectId(id) });
    return user ? this.formatUser(user) : undefined;
  }
  async getUserByUsername(username: string) {
    const { users } = await getCollections();
    const user = await users.findOne({ username });
    return user ? this.formatUser(user) : undefined;
  }
  async getUserByEmail(email: string) {
    const { users } = await getCollections();
    const user = await users.findOne({ email });
    return user ? this.formatUser(user) : undefined;
  }
  async createUser(insertUser: any) {
    const { users } = await getCollections();
    const doc = { ...insertUser, createdAt: new Date().toISOString() };
    const result = await users.insertOne(doc as any);
    return this.formatUser({ _id: result.insertedId, ...doc });
  }
  async updateUser(id: string, data: any) {
    const { users } = await getCollections();
    const updateData = { ...data, updatedAt: new Date().toISOString() };
    const result = await users.findOneAndUpdate({ _id: new ObjectId(id) }, { $set: updateData }, { returnDocument: 'after' });
    return result.value ? this.formatUser(result.value) : undefined;
  }

  async getCategories() {
    const { categories } = await getCollections();
    const cats = await categories.find({}).sort({ name: 1 }).toArray();
    return cats.map(c => this.formatCategory(c));
  }
  async getCategoryById(id: string) {
    const { categories } = await getCollections();
    const cat = await categories.findOne({ _id: new ObjectId(id) });
    return cat ? this.formatCategory(cat) : undefined;
  }
  async getCategoryBySlug(slug: string) {
    const { categories } = await getCollections();
    const cat = await categories.findOne({ slug });
    return cat ? this.formatCategory(cat) : undefined;
  }
  async createCategory(category: any) {
    const { categories } = await getCollections();
    const doc = { ...category, productCount: 0 };
    const result = await categories.insertOne(doc as any);
    return this.formatCategory({ _id: result.insertedId, ...doc });
  }

  async getProducts(filters: any = {}) {
    const { products } = await getCollections();
    const { search, categoryId, sort = 'newest', page = 1, pageSize = 20 } = filters;
    const query: any = { $or: [{ isActive: true }, { status: 'active' }] };
    if (search) query.$text = { $search: search };
    if (categoryId) query.categoryId = categoryId;
    let sortObj: any = { createdAt: -1 };
    if (sort === 'price_asc') sortObj = { price: 1 };
    else if (sort === 'price_desc') sortObj = { price: -1 };
    else if (sort === 'popular') sortObj = { ratingCount: -1 };
    const [results, count] = await Promise.all([
      products.find(query).sort(sortObj).limit(pageSize).skip((page - 1) * pageSize).toArray(),
      products.countDocuments(query),
    ]);
    return { results: results.map(p => this.formatProduct(p)), count };
  }
  async getProductById(id: string) {
    const { products } = await getCollections();
    const product = await products.findOne({ _id: new ObjectId(id) });
    return product ? this.formatProduct(product) : undefined;
  }
  async getProductSuggestions(query: string) {
    const { products } = await getCollections();
    const results = await products.find({ $and: [ { name: { $regex: query, $options: 'i' } }, { $or: [ { isActive: true }, { status: 'active' } ] } ] }).limit(5).toArray();
    return results.map(p => ({ id: p._id.toString(), name: p.name, thumbUrl: (p.images && p.images.length > 0) ? p.images[0] : '' }));
  }
  async createProduct(product: any) {
    const { products, categories } = await getCollections();
    const doc = { ...product, ratingAverage: 0, ratingCount: 0, createdAt: new Date().toISOString() };
    const result = await products.insertOne(doc as any);
    const formatted = this.formatProduct({ _id: result.insertedId, ...doc });
    if (product.categoryId) {
      await categories.updateOne({ _id: new ObjectId(product.categoryId) }, { $inc: { productCount: 1 } });
    }
    return formatted;
  }
  async updateProductRating(productId: string) {
    const { products, ratings } = await getCollections();
    const ratingDocs = await ratings.find({ productId }).toArray();
    const count = ratingDocs.length;
    const avg = count > 0 ? ratingDocs.reduce((sum, r) => sum + r.rating, 0) / count : 0;
    await products.updateOne({ _id: new ObjectId(productId) }, { $set: { ratingAverage: parseFloat(avg.toFixed(2)), ratingCount: count } });
  }

  async getUserFavorites(userId: string) {
    const { favorites, products } = await getCollections();
    const favs = await favorites.find({ userId }).toArray();
    const results = await Promise.all(favs.map(async (fav) => {
      const product = await products.findOne({ _id: new ObjectId(fav.productId) });
      return { ...this.formatFavorite(fav), product: product ? this.formatProduct(product) : {} };
    }));
    return results as any[];
  }
  async addFavorite(userId: string, productId: string) {
    const { favorites } = await getCollections();
    const doc = { userId, productId, addedAt: new Date().toISOString() };
    const result = await favorites.insertOne(doc as any);
    return this.formatFavorite({ _id: result.insertedId, ...doc });
  }
  async removeFavorite(userId: string, productId: string) {
    const { favorites } = await getCollections();
    await favorites.deleteOne({ userId, productId });
  }

  async getProductRatings(productId: string, page: number = 1) {
    const { ratings, users } = await getCollections();
    const pageSize = 10;
    const [ratingDocs, count] = await Promise.all([
      ratings.find({ productId }).sort({ createdAt: -1 }).limit(pageSize).skip((page - 1) * pageSize).toArray(),
      ratings.countDocuments({ productId }),
    ]);
    const results = await Promise.all(ratingDocs.map(async (r) => {
      const user = await users.findOne({ _id: new ObjectId(r.userId) });
      return { ...this.formatRating(r), user: user ? { id: user._id.toString(), username: user.username } : { id: '', username: 'Anonymous' } };
    }));
    return { results, count };
  }
  async createRating(userId: string, rating: any) {
    const { ratings } = await getCollections();
    const doc = { ...rating, userId, createdAt: new Date().toISOString() };
    const result = await ratings.insertOne(doc as any);
    await this.updateProductRating(rating.productId);
    return this.formatRating({ _id: result.insertedId, ...doc });
  }

  async getUserCart(userId: string) {
    const { cartItems, products } = await getCollections();
    const items = await cartItems.find({ userId }).toArray();
    const results = await Promise.all(items.map(async (item) => {
      const product = await products.findOne({ _id: new ObjectId(item.productId) });
      return { ...this.formatCartItem(item), product: product ? this.formatProduct(product) : {} };
    }));
    return results as any[];
  }
  async getSessionCart(sessionId: string) {
    const { cartItems, products } = await getCollections();
    const items = await cartItems.find({ sessionId }).toArray();
    const results = await Promise.all(items.map(async (item) => {
      const product = await products.findOne({ _id: new ObjectId(item.productId) });
      return { ...this.formatCartItem(item), product: product ? this.formatProduct(product) : {} };
    }));
    return results as any[];
  }
  async addToCart(item: any) {
    const { cartItems } = await getCollections();
    const doc = { ...item, createdAt: new Date().toISOString() };
    const result = await cartItems.insertOne(doc as any);
    return this.formatCartItem({ _id: result.insertedId, ...doc });
  }
  async updateCartItem(id: string, quantity: number) {
    const { cartItems } = await getCollections();
    const result = await cartItems.findOneAndUpdate({ _id: new ObjectId(id) }, { $set: { quantity } }, { returnDocument: 'after' });
    return result.value ? this.formatCartItem(result.value) : undefined;
  }
  async removeFromCart(id: string) {
    const { cartItems } = await getCollections();
    await cartItems.deleteOne({ _id: new ObjectId(id) });
  }

  async getPickupSlots(date?: string) {
    const { pickupSlots } = await getCollections();
    const query: any = { isActive: true };
    if (date) query.date = date;
    const slots = await pickupSlots.find(query).sort({ date: 1, timeFrom: 1 }).toArray();
    return slots.map(s => this.formatPickupSlot(s));
  }
  async getPickupSlotById(id: string) {
    const { pickupSlots } = await getCollections();
    const slot = await pickupSlots.findOne({ _id: new ObjectId(id) });
    return slot ? this.formatPickupSlot(slot) : undefined;
  }
  async createPickupSlot(slot: any) {
    const { pickupSlots } = await getCollections();
    const result = await pickupSlots.insertOne(slot as any);
    return this.formatPickupSlot({ _id: result.insertedId, ...slot });
  }
  async updateSlotCapacity(id: string, remaining: number) {
    const { pickupSlots } = await getCollections();
    await pickupSlots.updateOne({ _id: new ObjectId(id) }, { $set: { remaining } });
  }

  async getOrders(userId?: string) {
    const { orders } = await getCollections();
    const query = userId ? { userId } : {};
    const docs = await orders.find(query).sort({ createdAt: -1 }).toArray();
    return docs.map(o => this.formatOrder(o));
  }
  async getOrderById(id: string) {
    const { orders, orderItems, pickupSlots } = await getCollections();
    const order = await orders.findOne({ _id: new ObjectId(id) });
    if (!order) return undefined;
    const [items, slot] = await Promise.all([
      orderItems.find({ orderId: id }).toArray(),
      pickupSlots.findOne({ _id: new ObjectId(order.pickupSlotId) }),
    ]);
    return { ...this.formatOrder(order), items: items.map(i => this.formatOrderItem(i)), pickupSlot: slot ? this.formatPickupSlot(slot) : {} } as any;
  }
  async createOrder(order: any, items: any[]) {
    const { orders, orderItems, products } = await getCollections();
    const orderDoc = { ...order, createdAt: new Date().toISOString() };
    const result = await orders.insertOne(orderDoc as any);
    const orderId = result.insertedId.toString();
    if (items.length > 0) {
      await orderItems.insertMany(items.map(item => ({ ...item, orderId })) as any[]);
      // Reserve/decrement stock and alert if low
      for (const it of items) {
        await products.updateOne({ _id: new ObjectId(it.productId) }, { $inc: { stock: -Number(it.quantity || 0) } });
        const p = await products.findOne({ _id: new ObjectId(it.productId) });
        if (p && typeof p.stock === 'number' && p.stock < 5) {
          await notifyLowStock(p.name, p.stock);
        }
      }
    }
    return this.formatOrder({ _id: result.insertedId, ...orderDoc });
  }
  async updateOrderStatus(id: string, status: string, codes?: { tempPickupCode?: string; finalPickupCode?: string }) {
    const { orders, orderItems, products } = await getCollections();
    const updateData: any = { status };
    if (codes?.tempPickupCode) updateData.tempPickupCode = codes.tempPickupCode;
    if (codes?.finalPickupCode) updateData.finalPickupCode = codes.finalPickupCode;
    await orders.updateOne({ _id: new ObjectId(id) }, { $set: updateData });
    // If canceled, restore stock
    if (status === 'canceled') {
      const items = await orderItems.find({ orderId: id }).toArray();
      for (const it of items) {
        await products.updateOne({ _id: new ObjectId(it.productId) }, { $inc: { stock: Number(it.quantity || 0) } });
      }
    }
  }

  private formatUser(doc: any) { return { id: doc._id.toString(), username: doc.username, email: doc.email, password: doc.password, phone: doc.phone, passwordResetToken: doc.passwordResetToken, passwordResetExpires: doc.passwordResetExpires, twoFactorCode: doc.twoFactorCode, twoFactorExpires: doc.twoFactorExpires, createdAt: doc.createdAt, updatedAt: doc.updatedAt }; }
  private formatCategory(doc: any) { return { id: doc._id.toString(), name: doc.name, slug: doc.slug, imageUrl: doc.imageUrl, description: doc.description, productCount: doc.productCount || 0 }; }
  private formatProduct(doc: any) { return { id: doc._id.toString(), sku: doc.sku, name: doc.name, description: doc.description, price: doc.price, images: doc.images || [], stock: doc.stock ?? doc.stockQuantity ?? 0, categoryId: (doc.categoryId && doc.categoryId.toString) ? doc.categoryId.toString() : doc.categoryId, isActive: doc.isActive ?? (doc.status !== 'archived'), isPerishable: doc.isPerishable, ratingAverage: doc.ratingAverage || 0, ratingCount: doc.ratingCount || 0, createdAt: doc.createdAt }; }
  private formatFavorite(doc: any) { return { id: doc._id.toString(), userId: doc.userId, productId: doc.productId, addedAt: doc.addedAt }; }
  private formatRating(doc: any) { return { id: doc._id.toString(), userId: doc.userId, productId: doc.productId, rating: doc.rating, comment: doc.comment, createdAt: doc.createdAt }; }
  private formatCartItem(doc: any) { return { id: doc._id.toString(), userId: doc.userId, sessionId: doc.sessionId, productId: doc.productId, quantity: doc.quantity, createdAt: doc.createdAt }; }
  private formatPickupSlot(doc: any) { return { id: doc._id.toString(), date: doc.date, timeFrom: doc.timeFrom, timeTo: doc.timeTo, capacity: doc.capacity, remaining: doc.remaining, isActive: doc.isActive }; }
  private formatOrder(doc: any) { return { id: doc._id.toString(), orderNumber: doc.orderNumber, userId: doc.userId, customerName: doc.customerName, customerPhone: doc.customerPhone, customerEmail: doc.customerEmail, pickupSlotId: doc.pickupSlotId, status: doc.status, amount: doc.amount, currency: doc.currency, paymentMethod: doc.paymentMethod, paymentProvider: doc.paymentProvider, tempPickupCode: doc.tempPickupCode, finalPickupCode: doc.finalPickupCode, notes: doc.notes, expiresAt: doc.expiresAt, createdAt: doc.createdAt }; }
  private formatOrderItem(doc: any) { return { id: doc._id.toString(), orderId: doc.orderId, productId: doc.productId, productName: doc.productName, productPrice: doc.productPrice, quantity: doc.quantity, subtotal: doc.subtotal }; }
}

export const storage = new DatabaseStorage();
