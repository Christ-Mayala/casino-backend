import { Request, Response } from 'express';
import { z } from 'zod';
import { categoryService } from '../services/categoryService';
import { logActivity } from '../services/activity';
import { categoryRepo } from '../repositories/categoryRepo';

const categorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  imageUrl: z.string().url().min(1, "L'image est obligatoire"),
  description: z.string().optional(),
});

function slugifyName(input: string): string {
  return input
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

async function ensureUniqueSlug(base: string, currentId?: string): Promise<string> {
  let slug = base || 'categorie';
  let i = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing: any = await categoryRepo.findBySlug(slug);
    if (!existing) return slug;
    if (currentId && existing._id?.toString?.() === currentId) return slug;
    slug = `${base}-${i++}`;
  }
}

export const categoryController = {
  list: async (req: Request, res: Response) => {
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '20', 10);
    const data = await categoryService.list({ page, limit });
    res.json({ success: true, data });
  },
  get: async (req: Request, res: Response) => {
    const item = await categoryService.get(req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: item });
  },
  create: async (req: Request, res: Response) => {
    const body = req.body || {};
    if (!body.slug && body.name) {
      body.slug = await ensureUniqueSlug(slugifyName(body.name));
    }
    const payload = categorySchema.parse(body);
    const item = await categoryService.create(payload);
    try { await logActivity({ staffId: (req as any).user?.id, staffName: (req as any).user?.email, staffRole: (req as any).user?.role, action: 'created_category', entityType: 'category', entityId: (item as any)?._id?.toString?.() || (item as any)?.id, details: `slug=${payload.slug} name=${payload.name}` }); } catch {}
    res.status(201).json({ success: true, data: item });
  },
  update: async (req: Request, res: Response) => {
    const body = req.body || {};
    if (!body.slug && body.name) {
      const base = slugifyName(body.name);
      body.slug = await ensureUniqueSlug(base, req.params.id);
    }
    const payload = categorySchema.partial().parse(body);
    const item = await categoryService.update(req.params.id, payload);
    try { await logActivity({ staffId: (req as any).user?.id, staffName: (req as any).user?.email, staffRole: (req as any).user?.role, action: 'updated_category', entityType: 'category', entityId: req.params.id, details: `fields=${Object.keys(payload).join(',')}` }); } catch {}
    res.json({ success: true, data: item });
  },
  remove: async (req: Request, res: Response) => {
    await categoryService.remove(req.params.id);
    try { await logActivity({ staffId: (req as any).user?.id, staffName: (req as any).user?.email, staffRole: (req as any).user?.role, action: 'deleted_category', entityType: 'category', entityId: req.params.id }); } catch {}
    res.status(204).end();
  },
};
