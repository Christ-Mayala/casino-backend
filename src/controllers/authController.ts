import { Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../services/authService';

const loginSchema = z.object({ email: z.string().email().optional(), emailOrUsername: z.string().optional(), password: z.string().min(6) });
const registerSchema = z.object({ email: z.string().email(), password: z.string().min(6), phone: z.string().optional() });

export const authController = {
  login: async (req: Request, res: Response) => {
    const parsed = loginSchema.parse(req.body);
    const email = (parsed.emailOrUsername as string) || (parsed.email as string);
    const { user, token } = await authService.login(email, parsed.password);
    const { passwordHash, ...safe } = (user as any).toObject ? (user as any).toObject() : user;
    res.json({ success: true, data: { user: safe, token } });
  },
  register: async (req: Request, res: Response) => {
    const { email, password, phone } = registerSchema.parse(req.body);
    const user = await authService.register(email, password, 'customer', phone);
    const { passwordHash, ...safe } = (user as any).toObject ? (user as any).toObject() : user;
    res.status(201).json({ success: true, data: safe });
  },
};
