import { getCollections } from '../legacy/db';

export async function logActivity(params: {
  staffId?: string;
  staffName?: string;
  staffRole?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: string;
}) {
  try {
    const { activityLogs } = await getCollections();
    await activityLogs.insertOne({
      staffId: params.staffId || 'unknown',
      staffName: params.staffName || 'unknown',
      staffRole: params.staffRole || 'staff',
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      details: params.details,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('logActivity error', e);
  }
}
