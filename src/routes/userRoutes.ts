import type { Express, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { storage } from '../legacy/storage';
import { generateAccessToken, authMiddleware, optionalAuthMiddleware, type AuthRequest } from '../middleware/auth';
import { issueInitialRefreshToken, rotateRefreshToken } from '../auth/refresh-tokens';
import { sendEmail, initializeEmailService, generatePasswordResetTemplate, generateOrderConfirmationTemplate, generateWelcomeTemplate } from '../services/email';
import { sendSMS, initializeSMSService, generatePasswordResetSMSMessage, generateTwoFactorSMSMessage, generateOrderConfirmationSMSMessage } from '../services/sms';
import { initializeCloudinaryService, getCloudinarySignature } from '../services/cloudinary';
import { getCollections } from '../legacy/db';
import { lygosInitiateMomoPayment, verifyLygosSignature } from '../services/lygos';
import { logActivity } from '../services/activity';

export async function mountUserRoutes(app: Express) {
    initializeEmailService();
    await initializeSMSService();
    initializeCloudinaryService();
    try {
        const { users } = await getCollections();
        await users.createIndex({ email: 1 }, { unique: true });
    } catch {}

    app.post('/api/auth/register', async (req: Request, res: Response) => {
        try {
            const { username, email, password, phone } = req.body;
            if (!email || !password) return res.status(400).json({ error: "L'email et le mot de passe sont obligatoires" });
            const existingByEmail = await storage.getUserByEmail(email);
            if (existingByEmail) return res.status(400).json({ error: "Email déjà enregistré" });
            const hashedPassword = await bcrypt.hash(password, 10);
            const user = await storage.createUser({ username, email, phone, password: hashedPassword });
            const { password: _pw, ...userWithoutPassword } = user as any;
            try { await sendEmail(email, 'Bienvenue chez Géant Casino', generateWelcomeTemplate(username || email)); } catch {}
            res.status(201).json(userWithoutPassword);
        } catch (e: any) { res.status(400).json({ error: e.message || "Échec de l'inscription" }); }
    });

    app.post('/api/auth/login', async (req: Request, res: Response) => {
        try {
            const { emailOrUsername, password } = req.body;
            let user = await storage.getUserByEmail(emailOrUsername) || await storage.getUserByUsername(emailOrUsername);
            if (!user) return res.status(401).json({ error: 'Invalid credentials' });
            const ok = await bcrypt.compare(password, (user as any).password);
            if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
            const access = generateAccessToken(user.id);
            const { token: refresh } = await issueInitialRefreshToken(user.id);
            const { password: _pw, ...userWithoutPassword } = user as any;
            res.json({ access, refresh, user: userWithoutPassword });
        } catch (e: any) { res.status(400).json({ error: e.message || 'Login failed' }); }
    });

    app.post('/api/auth/refresh', async (req: Request, res: Response) => {
        try {
            const { refresh } = req.body;
            if (!refresh) return res.status(400).json({ error: 'Refresh token required' });
            const { newToken, userId } = await rotateRefreshToken(refresh);
            const access = generateAccessToken(userId);
            res.json({ access, refresh: newToken });
        } catch (e: any) { res.status(e?.status || 401).json({ error: e.message || 'Token refresh failed' }); }
    });

    app.post('/api/auth/logout', (_req, res) => res.status(204).send());
    app.get('/api/auth/me', authMiddleware, async (req: AuthRequest, res) => {
        try {
            const full = await storage.getUser(req.user!.id);
            if (!full) return res.status(404).json({ error: 'User not found' });
            const { password: _pw, ...userWithoutPassword } = full as any;
            res.json(userWithoutPassword);
        } catch (e: any) {
            res.status(400).json({ error: e.message || 'Failed to fetch user' });
        }
    });

    app.patch('/api/auth/me', authMiddleware, async (req: AuthRequest, res: Response) => {
        try {
            const { username, email, phone, currentPassword, newPassword } = req.body;
            const authUser = req.user!;
            const updateData: any = {};
            if (newPassword) {
                if (!currentPassword) return res.status(400).json({ error: 'Current password required to change password' });
                const fullUser = await storage.getUser(authUser.id);
                if (!fullUser) return res.status(401).json({ error: 'User not found' });
                const isValidPassword = await bcrypt.compare(currentPassword, (fullUser as any).password);
                if (!isValidPassword) return res.status(401).json({ error: 'Current password is incorrect' });
                updateData.password = await bcrypt.hash(newPassword, 10);
            }
            if (username !== undefined) updateData.username = username;
            if (email !== undefined) {
                const trimmed = String(email).trim();
                if (!trimmed) return res.status(400).json({ error: "L'email ne peut pas être vide" });
                const existing = await storage.getUserByEmail(trimmed);
                if (existing && (existing as any).id !== authUser.id) return res.status(400).json({ error: 'Email déjà utilisé' });
                updateData.email = trimmed;
            }
            if (phone !== undefined) updateData.phone = phone;
            const updated = await storage.updateUser(authUser.id, updateData);
            const { password: _pw, ...userWithoutPassword } = updated as any;
            res.json(userWithoutPassword);
        } catch (error: any) { res.status(400).json({ error: error.message }); }
    });

    app.post('/api/auth/forgot-password', async (req, res) => {
        try {
            const { email } = req.body; if (!email) return res.status(400).json({ error: "L'email est requis" });
            const user = await storage.getUserByEmail(email);
            if (!user) return res.json({ message: "Si l'email existe, un lien de réinitialisation a été envoyé" });
            const resetToken = nanoid(32);
            const resetExpires = new Date(Date.now() + 3600000);
            await storage.updateUser(user.id, { passwordResetToken: resetToken, passwordResetExpires: resetExpires });
            const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
            const html = generatePasswordResetTemplate(resetLink, (user as any).username || (user as any).email);
            const sent = await sendEmail((user as any).email, 'Réinitialisation de votre mot de passe', html);
            if (sent) res.json({ message: "Lien de réinitialisation envoyé par email" }); else res.status(500).json({ error: "Échec d'envoi de l'email" });
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    });

    app.post('/api/auth/reset-password', async (req, res) => {
        try {
            const { token, newPassword } = req.body;
            if (!token || !newPassword) return res.status(400).json({ error: 'Le jeton et le nouveau mot de passe sont requis' });
            if (newPassword.length < 8) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
            const { users } = await getCollections();
            const user = await users.findOne({ passwordResetToken: token, passwordResetExpires: { $gt: new Date() } });
            if (!user) return res.status(401).json({ error: 'Lien de réinitialisation invalide ou expiré' });
            const hashed = await bcrypt.hash(newPassword, 10);
            await users.updateOne({ _id: user._id }, { $set: { password: hashed, passwordResetToken: null, passwordResetExpires: null, updatedAt: new Date() } });
            res.json({ message: 'Mot de passe réinitialisé avec succès' });
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    });

    app.post('/api/auth/forgot-password/resend', async (req, res) => {
        try {
            const { email, token } = req.body || {};
            let user: any | null = null;
            if (email) {
                user = await storage.getUserByEmail(email);
            } else if (token) {
                const { users } = await getCollections();
                const u = await users.findOne({ passwordResetToken: token });
                if (u) user = { id: u._id.toString(), email: u.email, username: u.username };
            }
            if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
            const resetToken = nanoid(32);
            const resetExpires = new Date(Date.now() + 3600000);
            await storage.updateUser(user.id, { passwordResetToken: resetToken, passwordResetExpires: resetExpires });
            const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
            const html = generatePasswordResetTemplate(resetLink, (user as any).username || (user as any).email);
            const sent = await sendEmail((user as any).email, 'Réinitialisation de votre mot de passe', html);
            if (sent) res.json({ message: 'Nouveau lien de réinitialisation envoyé par email' }); else res.status(500).json({ error: "Échec d'envoi de l'email" });
        } catch (e: any) { res.status(400).json({ error: e.message || "Échec du renvoi du lien de réinitialisation" }); }
    });

    app.post('/api/auth/forgot-password/resend', async (req, res) => {
        try {
            const { email, token } = req.body || {};
            let user: any | null = null;
            if (email) {
                user = await storage.getUserByEmail(email);
            } else if (token) {
                const { users } = await getCollections();
                const u = await users.findOne({ passwordResetToken: token });
                if (u) user = { id: u._id.toString(), email: u.email, username: u.username };
            }
            if (!user) return res.status(404).json({ error: 'User not found' });
            const resetToken = nanoid(32);
            const resetExpires = new Date(Date.now() + 3600000);
            await storage.updateUser(user.id, { passwordResetToken: resetToken, passwordResetExpires: resetExpires });
            const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
            const html = generatePasswordResetTemplate(resetLink, (user as any).username || (user as any).email);
            const sent = await sendEmail((user as any).email, 'Réinitialisation de votre mot de passe', html);
            if (sent) res.json({ message: 'New reset link sent to email' }); else res.status(500).json({ error: 'Failed to send email' });
        } catch (e: any) { res.status(400).json({ error: e.message || 'Failed to resend reset link' }); }
    });

    app.post('/api/auth/request-2fa', authMiddleware, async (req: AuthRequest, res) => {
        try {
            const { method } = req.body; const user = req.user!;
            if (!method || !['email','sms'].includes(method)) return res.status(400).json({ error: "Method must be 'email' or 'sms'" });
            const twoFactorCode = Math.random().toString().slice(2, 8);
            const twoFactorExpires = new Date(Date.now() + 600000).toISOString();
            await storage.updateUser(user.id, { twoFactorCode, twoFactorExpires });
            if (method === 'email') {
                const html = `<p>Votre code: <b>${twoFactorCode}</b></p>`;
                const sent = await sendEmail((user as any).email, 'Code de vérification', html);
                if (sent) return res.json({ message: 'Code sent to email' });
            } else {
                const msg = generateTwoFactorSMSMessage(twoFactorCode);
                const sent = await sendSMS((user as any).phone, msg);
                if (sent) return res.json({ message: 'Code sent via SMS' });
            }
            res.status(500).json({ error: 'Failed to send code' });
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    });

    app.post('/api/auth/verify-2fa', authMiddleware, async (req: AuthRequest, res) => {
        try {
            const { code } = req.body; const user = req.user!; if (!code) return res.status(400).json({ error: 'Code required' });
            const full = await storage.getUser(user.id);
            if (!full || (full as any).twoFactorCode !== code) return res.status(401).json({ error: 'Invalid code' });
            const now = new Date(); const expiration = new Date(((full as any).twoFactorExpires) || 0);
            if (now > expiration) return res.status(401).json({ error: 'Code expired' });
            await storage.updateUser(user.id, { twoFactorCode: undefined, twoFactorExpires: undefined });
            res.json({ message: 'Code verified successfully' });
        } catch (e: any) { res.status(400).json({ error: e.message }); }
    });

    app.get('/api/categories', async (_req, res) => { const categories = await storage.getCategories(); res.json(categories); });

    // Cloudinary signature for client/staff uploads
    app.get('/api/upload/cloudinary-signature', async (_req: Request, res: Response) => {
        const sig = getCloudinarySignature();
        if (!sig) return res.status(500).json({ error: 'Cloudinary not configured' });
        res.json(sig);
    });

    app.get('/api/products/suggest', async (req, res) => { const { q } = req.query as any; if (!q) return res.json([]); const s = await storage.getProductSuggestions(q); res.json(s); });
    app.get('/api/products', async (req, res) => {
        try {
            const { search, category, sort, page = '1', page_size = '20' } = req.query as any;
            let categoryId: string | undefined;
            if (category) { const cat = await storage.getCategoryBySlug(category); categoryId = (cat as any)?.id; }
            const pageNum = parseInt(page, 10) || 1; const pageSizeNum = parseInt(page_size, 10) || 20;
            const result = await storage.getProducts({ search, categoryId, sort, page: pageNum, pageSize: pageSizeNum });
            res.json({ results: result.results, count: result.count, next: result.count > pageNum * pageSizeNum ? 'next' : null, previous: pageNum > 1 ? 'previous' : null });
        } catch (e) { res.status(500).json({ error: 'Failed to fetch products' }); }
    });
    app.get('/api/products/:id', async (req, res) => { const p = await storage.getProductById(req.params.id); if (!p) return res.status(404).json({ error: 'Product not found' }); res.json(p); });

    app.get('/api/favorites', authMiddleware, async (req: AuthRequest, res: Response) => { const favs = await storage.getUserFavorites(req.user!.id); res.json(favs); });
    app.post('/api/favorites/:productId', authMiddleware, async (req: AuthRequest, res: Response) => { try { const fav = await storage.addFavorite(req.user!.id, req.params.productId); res.status(201).json(fav); } catch (e: any) { res.status(400).json({ error: e.message }); } });
    app.delete('/api/favorites/:productId', authMiddleware, async (req: AuthRequest, res: Response) => { await storage.removeFavorite(req.user!.id, req.params.productId); res.status(204).send(); });

    app.get('/api/products/:id/ratings', async (req, res) => { const page = parseInt(req.query.page as string) || 1; const ratings = await storage.getProductRatings(req.params.id, page); res.json(ratings); });
    app.post('/api/products/:id/ratings', authMiddleware, async (req: AuthRequest, res: Response) => { try { const rating = await storage.createRating(req.user!.id, { ...req.body, productId: req.params.id }); res.status(201).json(rating); } catch (e: any) { res.status(400).json({ error: e.message }); } });

    app.get('/api/cart', optionalAuthMiddleware, async (req: AuthRequest, res) => {
        let cartItems;
        if (req.user) cartItems = await storage.getUserCart(req.user.id);
        else { const sessionId = req.headers['x-session-id'] as string; cartItems = sessionId ? await storage.getSessionCart(sessionId) : []; }
        const items = cartItems.map((item: any) => ({ productId: item.productId, name: (item as any).product.name, price: (item as any).product.price, quantity: item.quantity, imageUrl: ((item as any).product.images as string[])[0] || '', subtotal: (parseFloat((item as any).product.price) * item.quantity).toFixed(2) }));
        const total = items.reduce((sum: number, x: any) => sum + parseFloat(x.subtotal), 0).toFixed(2);
        res.json({ items, total, currency: 'XAF' });
    });

    app.get('/api/pickup-slots', async (req, res) => { const { date } = req.query as any; const slots = await storage.getPickupSlots(date); res.json(slots); });

    app.get('/api/orders', authMiddleware, async (req: AuthRequest, res) => { const orders = await storage.getOrders(req.user!.id); res.json(orders); });
    app.get('/api/orders/:id', async (req, res) => { const order = await storage.getOrderById(req.params.id); if (!order) return res.status(404).json({ error: 'Order not found' }); res.json(order); });

    app.post('/api/orders', optionalAuthMiddleware, async (req: AuthRequest, res) => {
        try {
            const { customerName, customerPhone, customerEmail, pickupSlotId, items: requestItems, paymentMethod, notes } = req.body;
            if (!customerName || !customerPhone || !pickupSlotId || !requestItems || requestItems.length === 0) return res.status(400).json({ error: 'Missing required fields' });
            let totalAmount = 0; const orderItems: any[] = [];
            for (const item of requestItems) {
                const product = await storage.getProductById(item.productId);
                if (!product || (product as any).stock < item.quantity) return res.status(400).json({ error: `Insufficient stock for ${product?.name || 'product'}` });
                const subtotal = parseFloat((product as any).price) * item.quantity; totalAmount += subtotal;
                orderItems.push({ productId: (product as any).id, productName: (product as any).name, productPrice: (product as any).price, quantity: item.quantity, subtotal: subtotal.toFixed(2) });
            }
            // determine perishable vs non-perishable
            const hasPerishable = await (async ()=>{ let anyPerishable=false; for (const it of requestItems){ const p = await storage.getProductById(it.productId); if ((p as any)?.isPerishable){ anyPerishable=true; break; } } return anyPerishable; })();
            const expiresAt = new Date(); expiresAt.setHours(expiresAt.getHours() + (hasPerishable ? 24 : 48));
            const slot = await storage.getPickupSlotById(pickupSlotId); if (!slot) return res.status(400).json({ error: 'Invalid pickup slot' });
            const now = new Date(); const limit = new Date(now); limit.setHours(limit.getHours() + (hasPerishable ? 24 : 48));
            const slotDate = new Date(`${slot.date}T${(slot as any).timeFrom || '09:00'}:00`);
            if (slotDate > limit) return res.status(400).json({ error: 'Chosen pickup slot exceeds allowed window' });
            const orderNumber = `GC-${Date.now()}-${nanoid(6).toUpperCase()}`;
            const order = await storage.createOrder({ orderNumber, userId: req.user?.id, customerName, customerPhone, customerEmail, pickupSlotId, amount: totalAmount.toFixed(2), currency: 'XAF', paymentMethod, notes, status: 'pending_payment', tempPickupCode: null, expiresAt } as any, orderItems);
            await logActivity({ action: 'order_created', entityType: 'order', entityId: order.id, details: JSON.stringify({ amount: totalAmount.toFixed(2), currency: 'XAF', paymentMethod }) });
            res.status(201).json(await storage.getOrderById(order.id));
        } catch (e: any) { res.status(400).json({ error: e.message || 'Order creation failed' }); }
    });

    app.post('/api/payments/initiate', async (req, res) => {
        try {
            const { orderId, method } = req.body;
            if (!orderId || !method) return res.status(400).json({ error: 'Missing fields' });
            const order = await storage.getOrderById(orderId); if (!order) return res.status(404).json({ error: 'Order not found' });
            if (method === 'momo') {
                await logActivity({ action: 'payment_initiate', entityType: 'order', entityId: (order as any).id, details: JSON.stringify({ amount: parseFloat((order as any).amount), currency: (order as any).currency, phone: (order as any).customerPhone, endpoint: `${process.env.LYGOS_BASE_URL || ''}${process.env.LYGOS_CREATE_PATH || '/v1/transactions'}`, minorUnits: String(process.env.LYGOS_AMOUNT_MINOR_UNITS||'') }) });
                const result = await lygosInitiateMomoPayment({ orderId: (order as any).id, amount: parseFloat((order as any).amount), currency: (order as any).currency, customerPhone: (order as any).customerPhone });
                await logActivity({ action: 'payment_initiated', entityType: 'order', entityId: (order as any).id, details: JSON.stringify({ provider: result.provider, transactionId: result.transactionId, paymentUrl: !!result.paymentUrl }) });
                return res.json({ paymentUrl: result.paymentUrl, provider: result.provider, transactionId: result.transactionId });
            }
            res.status(400).json({ error: 'Unsupported method' });
        } catch (e: any) {
            let detail = e?.message || 'Payment initiation failed';
            const data = e?.response?.data;
            if (data) {
                try {
                    detail = typeof data === 'string' ? data : (data?.message || JSON.stringify(data));
                } catch {}
            }
            await logActivity({ action: 'payment_initiate_failed', entityType: 'order', entityId: req.body?.orderId, details: detail });
            res.status(400).json({ error: detail });
        }
    });

    const webhookHits = new Map<string, number[]>();
    function checkRateLimit(ip: string): boolean {
        const now = Date.now(); const windowMs = 60_000; const max = 20; const arr = webhookHits.get(ip) || []; const fresh = arr.filter(t => now - t < windowMs); fresh.push(now); webhookHits.set(ip, fresh); return fresh.length <= max;
    }

    app.post('/api/payments/lygos/webhook', async (req: Request, res: Response) => {
        try {
            const ip = (req as any).ip || (req.headers['x-forwarded-for'] as string) || 'unknown'; if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Too Many Requests' });
            const raw = (req as any).rawBody || JSON.stringify(req.body || {});
            const signature = (req.headers['x-lygos-signature'] as string) || (req.headers['x-lygos-signature-sha256'] as string);
            const ok = verifyLygosSignature(raw, signature); if (!ok) return res.status(401).json({ error: 'Invalid signature' });
            const event = req.body as any; const reference = event?.reference || event?.metadata?.orderId; const status = event?.status; if (!reference || !status) return res.status(400).json({ error: 'Invalid payload' });
            await logActivity({ action: 'payment_webhook_received', entityType: 'order', entityId: reference, details: JSON.stringify({ status, event }) });
            if (status === 'success' || status === 'paid') {
                const newTempCode = nanoid(8).toUpperCase();
                await storage.updateOrderStatus(reference, 'paid', { tempPickupCode: newTempCode });
                const order: any = await storage.getOrderById(reference);
                if (order) {
                    if (order.customerEmail) {
                        const itemsForEmail = order.items.map((i: any) => ({ productName: i.productName, quantity: i.quantity, price: parseFloat(i.productPrice) }));
                        const pickupDateStr = order.pickupSlot?.date || new Date().toISOString().split('T')[0];
                        const pickupTimeStr = order.pickupSlot?.timeFrom ? `${order.pickupSlot.timeFrom} - ${order.pickupSlot.timeTo}` : 'À définir';
                        const html = generateOrderConfirmationTemplate(order.orderNumber, order.customerName, itemsForEmail, parseFloat(order.amount), order.tempPickupCode || 'N/A', pickupDateStr, pickupTimeStr);
                        sendEmail(order.customerEmail, `Confirmation de votre commande ${order.orderNumber}`, html);
                    }
                    if (order.customerPhone) {
                        const sms = generateOrderConfirmationSMSMessage(order.orderNumber, order.tempPickupCode || 'N/A');
                        sendSMS(order.customerPhone, sms);
                    }
                }
                await logActivity({ action: 'payment_paid', entityType: 'order', entityId: reference });
            } else if (status === 'failed' || status === 'canceled') {
                await storage.updateOrderStatus(reference, 'canceled');
                await logActivity({ action: 'payment_failed', entityType: 'order', entityId: reference, details: JSON.stringify({ status }) });
            }
            res.json({ received: true });
        } catch (e: any) { res.status(400).json({ error: e.message || 'Webhook handling failed' }); }
    });

    app.post('/api/orders/:id/resend-receipt', authMiddleware, async (req: AuthRequest, res: Response) => {
        try {
            const id = req.params.id;
            const channel = (req.body?.channel as string) || 'email';
            const order: any = await storage.getOrderById(id);
            if (!order) return res.status(404).json({ error: 'Order not found' });
            if (channel === 'email') {
                if (!order.customerEmail) return res.status(400).json({ error: 'No email on order' });
                const itemsForEmail = order.items.map((i: any) => ({ productName: i.productName, quantity: i.quantity, price: parseFloat(i.productPrice) }));
                const pickupDateStr = order.pickupSlot?.date || new Date().toISOString().split('T')[0];
                const pickupTimeStr = order.pickupSlot?.timeFrom ? `${order.pickupSlot.timeFrom} - ${order.pickupSlot.timeTo}` : 'À définir';
                const html = generateOrderConfirmationTemplate(order.orderNumber, order.customerName, itemsForEmail, parseFloat(order.amount), order.tempPickupCode || 'N/A', pickupDateStr, pickupTimeStr);
                const sent = await sendEmail(order.customerEmail, `Reçu de votre commande ${order.orderNumber}`, html);
                if (!sent) return res.status(500).json({ error: "Échec d'envoi de l'email" });
                return res.json({ message: 'Reçu envoyé par email' });
            }
            if (channel === 'sms') {
                if (!order.customerPhone) return res.status(400).json({ error: 'No phone on order' });
                const smsText = generateOrderConfirmationSMSMessage(order.orderNumber, order.tempPickupCode || 'N/A');
                const ok = await sendSMS(order.customerPhone, smsText);
                if (!ok) return res.status(500).json({ error: "Échec d'envoi du SMS" });
                return res.json({ message: 'Reçu envoyé par SMS' });
            }
            res.status(400).json({ error: 'Invalid channel' });
        } catch (e: any) {
            res.status(400).json({ error: e.message || 'Failed to resend receipt' });
        }
    });

    app.get('/api/config/policy', async (_req: Request, res: Response) => { res.json({ expirationPolicy: '24h périssables, 48h non périssables. Passé ce délai, commande annulée.', perishableExpiry: 24, nonPerishableExpiry: 48 }); });
}
