import { Request, Response } from 'express';
import { z } from 'zod';
import { stockService } from '../services/stockService';

const movementSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
  reason: z.string().min(1),
});

export const stockController = {
  in: async (req: Request, res: Response) => {
    const parsed = movementSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.errors?.[0]?.message || 'Invalid data' });
    const { productId, quantity, reason } = parsed.data;
    const result = await stockService.moveIn(productId, quantity, reason, req.user!.id);
    res.json({ success: true, data: result });
  },
  out: async (req: Request, res: Response) => {
    const parsed = movementSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.errors?.[0]?.message || 'Invalid data' });
    const { productId, quantity, reason } = parsed.data;
    const result = await stockService.moveOut(productId, quantity, reason, req.user!.id);
    res.json({ success: true, data: result });
  },
  adjust: async (req: Request, res: Response) => {
    const parsed = movementSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.errors?.[0]?.message || 'Invalid data' });
    const { productId, quantity, reason } = parsed.data;
    const result = await stockService.adjust(productId, quantity, reason, req.user!.id);
    res.json({ success: true, data: result });
  },
  movements: async (req: Request, res: Response) => {
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '20', 10);
    const productId = (req.query.productId as string) || undefined;
    const type = (req.query.type as any) || undefined;
    const data = await stockService.movements({ page, limit, productId, type });
    res.json({ success: true, data });
  },
  inventoryLevels: async (_req: Request, res: Response) => {
    // For simplicity, expose via products endpoint; could aggregate if needed
    res.status(501).json({ success: false, error: 'Not implemented: use /products list for stock levels' });
  }
};
