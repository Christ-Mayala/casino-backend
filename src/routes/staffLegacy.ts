import type { Express, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { randomBytes } from 'crypto';
import { getCollections } from '../legacy/db';
import { authJWT, requireRole } from '../middlewares/authJWT';

export async function mountStaffRoutes(app: Express) {
  const { staff, orders, activityLogs, orderItems } = await getCollections();

  app.post('/api/staff/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: 'Données invalides' });
      const st = await staff.findOne({ email });
      if (!st) return res.status(401).json({ message: 'Email ou mot de passe invalide' });
      if (st.isActive === false) return res.status(401).json({ message: 'Compte désactivé' });
      const ok = await bcrypt.compare(password, st.password);
      if (!ok) return res.status(401).json({ message: 'Email ou mot de passe invalide' });
      const { password: _pw, ...safe } = st as any;
      await activityLogs.insertOne({ staffId: (st as any).id ?? st._id.toString(), staffName: (st as any).name, staffRole: (st as any).role, action: 'logged_in', entityType: 'auth', entityId: ((st as any).id ?? st._id.toString()), timestamp: new Date().toISOString() });
      res.json({ staff: { ...safe, id: st._id.toString() } });
    } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
  });

  // Staff orders list (admin/caissier/preparateur)
  app.get('/api/staff/orders/all', authJWT, requireRole('admin','caissier','preparateur'), async (_req: Request, res: Response) => {
    try {
      const docs = await orders.find({}).sort({ createdAt: -1 }).limit(200).toArray();
      const normalize = (s?: string) => {
        if (!s) return 'pending';
        if (s === 'paid') return 'confirmed';
        if (s === 'pending_payment') return 'pending';
        return s;
      };
      const results = await Promise.all(docs.map(async (o: any) => {
        const items = await orderItems.find({ orderId: o._id.toString() }).toArray();
        const mappedStatus = normalize(o.status);
        const totalAmount = parseFloat(o.amount || '0');
        const itemsOut = items.map((it: any) => ({ name: it.productName, quantity: it.quantity }));
        return {
          id: o._id.toString(),
          orderNumber: o.orderNumber,
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          status: mappedStatus,
          createdAt: o.createdAt || new Date().toISOString(),
          totalAmount,
          notes: o.notes || '',
          items: JSON.stringify(itemsOut),
          assignedTo: o.assignedTo || null,
        } as any;
      }));
      res.json(results);
    } catch (e: any) {
      console.error('staff orders list error', e);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  // Step 1: preparateur/admin validate temporary code and generate final code
  app.post('/api/staff/validate-code', authJWT, requireRole('preparateur','admin'), async (req: Request, res: Response) => {
    try {
      const { orderId, temporaryCode } = req.body;
      if (!orderId || !temporaryCode) return res.status(400).json({ message: 'Données invalides' });
      let oid: ObjectId; try { oid = new ObjectId(orderId); } catch { return res.status(400).json({ message: 'Identifiant commande invalide' }); }
      const order = await orders.findOne({ _id: oid });
      if (!order) return res.status(404).json({ message: 'Commande introuvable' });
      if (order.tempPickupCode !== temporaryCode) return res.status(400).json({ message: 'Code temporaire invalide' });
      const finalCode = randomBytes(4).toString('hex').toUpperCase();
      await orders.updateOne({ _id: order._id }, { $set: { status: 'confirmed', finalPickupCode: finalCode, codeValidatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
      await activityLogs.insertOne({ staffId: 'system', staffName: 'System', staffRole: 'system', action: 'validated_code', entityType: 'order', entityId: orderId, timestamp: new Date().toISOString(), details: `Code final: ${finalCode}` });
      const { notifyFinalCode } = await import('../services/notify');
      await notifyFinalCode((order as any).customerEmail, (order as any).customerPhone, finalCode, (order as any).orderNumber);
      res.json({ finalCode });
    } catch (e:any) { console.error('validate-code error', e); res.status(500).json({ message: 'Erreur serveur' }); }
  });

  // Step 2: caissier/admin verify final code to complete pickup
  app.post('/api/staff/verify-final-code', authJWT, requireRole('caissier','admin'), async (req: Request, res: Response) => {
    try {
      const { orderId, finalCode } = req.body;
      if (!orderId || !finalCode) return res.status(400).json({ message: 'Données invalides' });
      let oid: ObjectId; try { oid = new ObjectId(orderId); } catch { return res.status(400).json({ message: 'Identifiant commande invalide' }); }
      const order = await orders.findOne({ _id: oid });
      if (!order) return res.status(404).json({ message: 'Commande introuvable' });
      if (order.finalPickupCode !== finalCode) return res.status(400).json({ message: 'Code final invalide' });
      await orders.updateOne({ _id: oid }, { $set: { status: 'completed', pickedUpAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
      await activityLogs.insertOne({ staffId: 'system', staffName: 'System', staffRole: 'system', action: 'completed_order', entityType: 'order', entityId: orderId, timestamp: new Date().toISOString(), details: `Retrait validé` });
      res.json({ message: 'Pickup completed' });
    } catch (e:any) { console.error('verify-final-code error', e); res.status(500).json({ message: 'Erreur serveur' }); }
  });

  // Staff management routes
  app.get('/api/staff/list', authJWT, requireRole('admin'), async (_req: Request, res: Response) => {
    try {
      const list = await staff.find({}).toArray();
      const out = list.map((s: any) => ({
        id: s._id.toString(),
        name: s.name,
        email: s.email,
        phone: s.phone,
        role: s.role,
        isActive: s.isActive !== false,
      }));
      res.json(out);
    } catch (e: any) {
      console.error('list staff error', e);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  app.post('/api/staff/create', authJWT, requireRole('admin'), async (req: Request, res: Response) => {
    try {
      console.log('Données reçues:', req.body);
      const { name, email, password, role, phone } = req.body || {};
      if (!name || !email || !password || !role) return res.status(400).json({ message: 'Champs requis manquants' });
      if (!['caissier','preparateur','admin'].includes(role)) return res.status(400).json({ message: 'Rôle invalide' });
      const exists = await staff.findOne({ email });
      if (exists) return res.status(409).json({ message: 'Email déjà utilisé' });
      const hash = await bcrypt.hash(password, 10);
      const doc = {
        name,
        email,
        phone: phone || null,
        role,
        password: hash,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any;
      const insert = await staff.insertOne(doc);
      const newStaff = { id: insert.insertedId.toString(), name, email, phone: phone || null, role, isActive: true } as any;
      console.log('Staff créé:', newStaff);
      await activityLogs.insertOne({ staffId: (req as any).user?.id || 'system', staffRole: (req as any).user?.role || 'admin', action: 'created_staff', entityType: 'staff', entityId: insert.insertedId.toString(), timestamp: new Date().toISOString(), details: `${name} (${role})` });
      res.status(201).json(newStaff);
    } catch (e: any) {
      console.error('create staff error', e);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  app.delete('/api/staff/:id', authJWT, requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      let oid: ObjectId; try { oid = new ObjectId(id); } catch { return res.status(400).json({ message: 'Identifiant invalide' }); }
      const existing: any = await staff.findOne({ _id: oid });
      if (!existing) return res.status(404).json({ message: 'Staff introuvable' });
      if (existing.role === 'admin') return res.status(400).json({ message: 'Impossible de supprimer un admin' });
      await staff.deleteOne({ _id: oid });
      await activityLogs.insertOne({ staffId: (req as any).user?.id || 'system', staffRole: (req as any).user?.role || 'admin', action: 'deleted_staff', entityType: 'staff', entityId: id, timestamp: new Date().toISOString(), details: `${existing.name} (${existing.role})` });
      res.status(204).end();
    } catch (e: any) {
      console.error('delete staff error', e);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });
}
