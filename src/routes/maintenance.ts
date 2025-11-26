import { Router } from 'express';
import { authJWT, requireRole } from '../middlewares/authJWT';
import { getCollections } from '../legacy/db';
import { logActivity } from '../services/activity';

const router = Router();

router.post('/log-existing', authJWT, requireRole('admin'), async (req, res) => {
  try {
    const { products, categories } = await getCollections();
    const staffId = (req as any).user?.id || 'unknown';
    const staffRole = (req as any).user?.role || 'admin';
    let pCount = 0, cCount = 0;
    for await (const p of products.find({})) {
      await logActivity({ staffId, staffRole, action: 'imported_existing_product', entityType: 'product', entityId: p._id.toString(), details: `SKU=${p.sku} name=${p.name}` });
      pCount++;
    }
    for await (const c of categories.find({})) {
      await logActivity({ staffId, staffRole, action: 'imported_existing_category', entityType: 'category', entityId: c._id.toString(), details: `slug=${c.slug} name=${c.name}` });
      cCount++;
    }
    res.json({ ok: true, productsLogged: pCount, categoriesLogged: cCount });
  } catch (e:any) {
    res.status(500).json({ error: e.message || 'maintenance log-existing failed' });
  }
});

export default router;
