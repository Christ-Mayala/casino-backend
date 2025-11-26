import { productRepo } from '../repositories/productRepo';

export const productService = {
  // Product listing with filter + mapping stockQuantity -> stock for client compatibility
  async list(params: { q?: string; categoryId?: string; categorySlug?: string; page?: number; limit?: number }) {
    const filter: any = {};
    if (params.q) filter.name = { $regex: params.q, $options: 'i' };
    if (params.categoryId) filter.categoryId = params.categoryId;
    if (!params.categoryId && params.categorySlug) {
      try {
        const { CategoryModel } = await import('../models/Category');
        const cat = await CategoryModel.findOne({ slug: params.categorySlug }).exec();
        if (cat?._id) filter.categoryId = cat._id;
      } catch {}
    }
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const [docs, total] = await Promise.all([
      productRepo.list(filter, page, limit),
      productRepo.count(filter),
    ]);
    const items = docs.map((d: any) => {
      const o = d.toObject ? d.toObject() : d;
      return { ...o, stock: o.stockQuantity ?? 0 };
    });
    return { items, total, page, limit };
  },
  // Product detail with stock alias for client compatibility
  async get(id: string) {
    const d: any = await productRepo.get(id);
    if (!d) return null as any;
    const o = d.toObject ? d.toObject() : d;
    return { ...o, stock: o.stockQuantity ?? 0 } as any;
  },
  async create(data: any) {
    const exists = await productRepo.getBySKU(data.sku);
    if (exists) throw new Error('SKU must be unique');
    return productRepo.create(data);
  },
  update: (id: string, data: any) => productRepo.update(id, data),
  remove: (id: string) => productRepo.remove(id),
};
