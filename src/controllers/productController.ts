import { Request, Response } from 'express';
import { z } from 'zod';
import { productService } from '../services/productService';
import { logActivity } from '../services/activity';

const productSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  price: z.number().positive(),
  categoryId: z.string().min(1),
  description: z.string().optional(),
  images: z.array(z.string().url()).min(1, "Au moins une image requise").max(10, "Maximum 10 images"),
  stock: z.number().int().min(0).optional(),
  status: z.enum(['active','archived']).default('active'),
});

export const productController = {
  list: async (req: Request, res: Response) => {
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '20', 10);
    const q = (req.query.q as string) || undefined;
    const categoryId = (req.query.categoryId as string) || undefined;
    const categorySlug = (req.query.categorySlug as string) || undefined;
    const data = await productService.list({ page, limit, q, categoryId, categorySlug });
    res.json({ success: true, data });
  },
  get: async (req: Request, res: Response) => {
    const item = await productService.get(req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: item });
  },
  create: async (req: Request, res: Response) => {
    const payload = productSchema.parse(req.body);
    const item = await productService.create(payload);
    try { await logActivity({ staffId: (req as any).user?.id, staffName: (req as any).user?.email, staffRole: (req as any).user?.role, action: 'created_product', entityType: 'product', entityId: (item as any)?._id?.toString?.() || (item as any)?.id, details: `SKU=${payload.sku} name=${payload.name}` }); } catch {}
    res.status(201).json({ success: true, data: item });
  },
  update: async (req: Request, res: Response) => {
    const payload = productSchema.partial().parse(req.body);
    const item = await productService.update(req.params.id, payload);
    try { await logActivity({ staffId: (req as any).user?.id, staffName: (req as any).user?.email, staffRole: (req as any).user?.role, action: 'updated_product', entityType: 'product', entityId: req.params.id, details: `fields=${Object.keys(payload).join(',')}` }); } catch {}
    res.json({ success: true, data: item });
  },
  remove: async (_req: Request, res: Response) => {
    await productService.remove(_req.params.id);
    try { await logActivity({ staffId: (_req as any).user?.id, staffRole: (_req as any).user?.role, action: 'deleted_product', entityType: 'product', entityId: _req.params.id }); } catch {}
    res.status(204).end();
  },
};
