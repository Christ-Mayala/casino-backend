import { randomBytes } from 'crypto';
import { getCollections } from '../legacy/db';

export async function issueInitialRefreshToken(userId: string): Promise<{ token: string }> {
  const { refreshTokens } = await getCollections();
  const token = randomBytes(48).toString('hex');
  const now = new Date().toISOString();
  await refreshTokens.insertOne({ userId, token, createdAt: now, updatedAt: now });
  return { token };
}

export async function rotateRefreshToken(refresh: string): Promise<{ newToken: string; userId: string }> {
  const { refreshTokens } = await getCollections();
  const existing = await refreshTokens.findOne({ token: refresh });
  if (!existing) {
    const err: any = new Error('Invalid refresh token');
    err.status = 401;
    throw err;
  }
  const newToken = randomBytes(48).toString('hex');
  await refreshTokens.updateOne({ _id: existing._id }, { $set: { token: newToken, updatedAt: new Date().toISOString() } });
  return { newToken, userId: existing.userId };
}
