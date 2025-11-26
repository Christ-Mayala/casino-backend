import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { userRepo } from '../repositories/userRepo';
import { env } from '../config/env';

export const authService = {
  async register(email: string, password: string, role: 'customer' | 'staff' | 'admin' = 'customer', phone?: string) {
    const existing = await userRepo.findByEmail(email);
    if (existing) throw new Error('Email already in use');
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await userRepo.create({ email, passwordHash, role, status: 'active', phone });
    return user;
  },
  async login(email: string, password: string) {
    // Find the user in the Mongoose users collection
    let user = await userRepo.findByEmail(email);
    if (!user) throw new Error('Invalid credentials');

    // Support legacy staff accounts stored in the legacy Mongo collection without passwordHash in users.
    // If users.passwordHash is missing, try to read staff.password (bcrypt hash) and migrate it to users.
    let passwordHash: string | undefined = (user as any).passwordHash;
    if (!passwordHash) {
      try {
        const { getCollections } = await import('../legacy/db');
        const { staff } = await getCollections();
        const legacy = await staff.findOne({ email });
        if (legacy?.password) {
          const okLegacy = await bcrypt.compare(password, legacy.password);
          if (!okLegacy) throw new Error('Invalid credentials');
          // Migrate legacy hash + role to users collection for future logins
          passwordHash = legacy.password;
          (user as any).role = legacy.role || (user as any).role || 'staff';
          (user as any).passwordHash = passwordHash;
          await (user as any).save?.();
        }
      } catch (e) {
        // If migration fails, proceed with normal checks
      }
    }

    // Status check and verify password
    if ((user as any).status !== 'active') throw new Error('Account disabled');
    const ok = passwordHash ? await bcrypt.compare(password, passwordHash) : await bcrypt.compare(password, (user as any).passwordHash);
    if (!ok) throw new Error('Invalid credentials');

    // Issue JWT for staff/admin
    const token = jwt.sign({ id: (user as any)._id.toString(), email: user.email, role: (user as any).role }, env.jwtSecret, { expiresIn: '1d' });
    return { user, token };
  },
};
