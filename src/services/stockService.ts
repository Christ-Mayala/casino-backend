import { productRepo } from '../repositories/productRepo';
import { stockRepo } from '../repositories/stockRepo';

export const stockService = {
  async moveIn(productId: string, quantity: number, reason: string, createdBy: string) {
    if (quantity <= 0) throw new Error('Quantity must be > 0');
    const product = await productRepo.get(productId);
    if (!product) throw new Error('Product not found');
    const newQty = (product as any).stockQuantity + quantity;
    await productRepo.update(productId, { stockQuantity: newQty });
    await stockRepo.create({ productId, type: 'in', quantity, reason, createdBy });
    return { productId, stockQuantity: newQty };
  },
  async moveOut(productId: string, quantity: number, reason: string, createdBy: string) {
    if (quantity <= 0) throw new Error('Quantity must be > 0');
    const product = await productRepo.get(productId);
    if (!product) throw new Error('Product not found');
    const current = (product as any).stockQuantity;
    if (quantity > current) throw new Error('Insufficient stock');
    const newQty = current - quantity;
    await productRepo.update(productId, { stockQuantity: newQty });
    await stockRepo.create({ productId, type: 'out', quantity, reason, createdBy });
    return { productId, stockQuantity: newQty };
  },
  async adjust(productId: string, quantity: number, reason: string, createdBy: string) {
    if (quantity <= 0) throw new Error('Quantity must be > 0');
    const product = await productRepo.get(productId);
    if (!product) throw new Error('Product not found');
    const newQty = quantity;
    await productRepo.update(productId, { stockQuantity: newQty });
    await stockRepo.create({ productId, type: 'adjust', quantity, reason, createdBy });
    return { productId, stockQuantity: newQty };
  },
  async movements(params: { productId?: string; type?: 'in'|'out'|'adjust'; page?: number; limit?: number }) {
    const filter: any = {};
    if (params.productId) filter.productId = params.productId;
    if (params.type) filter.type = params.type;
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const [items, total] = await Promise.all([
      stockRepo.list(filter, page, limit),
      stockRepo.count(filter),
    ]);
    return { items, total, page, limit };
  },
};
