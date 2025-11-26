import { Router } from 'express';
import { authJWT, requireRole } from '../middlewares/authJWT';
import { getCollections } from '../legacy/db';

const router = Router();

router.get('/recent', authJWT, requireRole('admin'), async (_req, res) => {
  const { activityLogs } = await getCollections();
  const items = await activityLogs.find({}).sort({ timestamp: -1 }).limit(50).toArray();
  res.json(items.map((x:any)=>({
    id: x._id.toString(),
    staffId: x.staffId,
    staffName: x.staffName,
    staffRole: x.staffRole,
    action: x.action,
    entityType: x.entityType,
    entityId: x.entityId,
    details: x.details,
    timestamp: x.timestamp,
  })));
});

router.get('/all', authJWT, requireRole('admin'), async (_req, res) => {
  const { activityLogs } = await getCollections();
  const items = await activityLogs.find({}).sort({ timestamp: -1 }).toArray();
  res.json(items.map((x:any)=>({
    id: x._id.toString(),
    staffId: x.staffId,
    staffName: x.staffName,
    staffRole: x.staffRole,
    action: x.action,
    entityType: x.entityType,
    entityId: x.entityId,
    details: x.details,
    timestamp: x.timestamp,
  })));
});

export default router;
