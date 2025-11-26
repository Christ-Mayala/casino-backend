import { categoryRepo } from '../repositories/categoryRepo';
import { ProductModel } from '../models/Product';
import { getCollections } from '../legacy/db';
import { ObjectId } from 'mongodb';

export const categoryService = {
  async list(params: { page?: number; limit?: number }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    const [items, total] = await Promise.all([
      categoryRepo.list({}, page, limit),
      categoryRepo.count({}),
    ]);

    let legacyProducts: any | null = null;
    try {
      const { products } = await getCollections();
      legacyProducts = products;
    } catch {}

    const enriched = await Promise.all(
      items.map(async (cat: any) => {
        const o = cat.toObject ? cat.toObject() : cat;
        const oid = (o._id as any) || o.id;
        const idStr = (oid as any)?.toString?.() ?? String(oid);
        const [mCount, lCount] = await Promise.all([
          ProductModel.countDocuments({ categoryId: oid, status: { $ne: 'archived' } }).exec(),
          legacyProducts
            ? legacyProducts.countDocuments({
                $and: [
                  { $or: [
                    { categoryId: idStr },
                    (()=>{ try { return { categoryId: new ObjectId(idStr) }; } catch { return { _skip: true } as any; } })(),
                    { category: o.slug },
                  ]},
                  { isActive: { $ne: false } },
                ]
              })
            : Promise.resolve(0 as any),
        ]);
        if (process.env.NODE_ENV !== 'production') {
          console.log('[categoryService] count', { categoryId: idStr, mCount, lCount });
        }
        return { ...o, productCount: (mCount || 0) + (lCount || 0) };
      })
    );

    return { items: enriched, total, page, limit };
  },
  get: (id: string) => categoryRepo.get(id),
  create: (data: any) => categoryRepo.create(data),
  update: (id: string, data: any) => categoryRepo.update(id, data),
  remove: (id: string) => categoryRepo.remove(id),
};
