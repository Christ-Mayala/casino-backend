import axios from 'axios';
import crypto from 'crypto';

const baseUrl = process.env.LYGOS_BASE_URL || '';
const apiKey = process.env.LYGOS_API_KEY || '';
const merchantId = process.env.LYGOS_MERCHANT_ID || '';
const defaultChannel = process.env.LYGOS_CHANNEL || '';
const createPath = process.env.LYGOS_CREATE_PATH || '/v1/transactions';
const useMinorUnits = String(process.env.LYGOS_AMOUNT_MINOR_UNITS || '').toLowerCase() === 'true';
const callbackUrl = process.env.LYGOS_CALLBACK_URL || '';  // URL accessible publiquement par Lygos (webhook)
const returnUrl = process.env.LYGOS_RETURN_URL || '';      // URL de redirection client après paiement

function extractPaymentUrl(data: any): string | undefined {
    return (
        data?.checkoutUrl ||
        data?.checkout_url ||
        data?.paymentUrl ||
        data?.payment_url ||
        data?.redirectUrl ||
        data?.redirect_url
    );
}

export async function lygosInitiateMomoPayment(params: {
    orderId: string;
    amount: number;
    currency: string;
    customerPhone: string;
}): Promise<{ paymentUrl?: string; transactionId?: string; provider?: string }> {
    if (!baseUrl) throw new Error('LYGOS_BASE_URL non configuré');
    if (!apiKey) throw new Error('LYGOS_API_KEY non configuré');

    const amount = useMinorUnits ? Math.round(params.amount * 100) : params.amount;

    const payload: any = {
        reference: params.orderId,
        amount,
        currency: params.currency,
        payer: { phone: params.customerPhone },
        metadata: { orderId: params.orderId },
    };

    if (merchantId) payload.merchantId = merchantId;
    if (defaultChannel) payload.channel = defaultChannel;
    if (callbackUrl) payload.callbackUrl = callbackUrl;
    if (returnUrl) payload.returnUrl = returnUrl;

    const base = baseUrl.replace(/\/$/, '');
    const pathCandidates = Array.from(
        new Set([
            createPath,
            '/api/v1/transactions',
            '/v1/transactions',
            '/transactions',
        ].map((p) => (p.startsWith('/') ? p : `/${p}`)))
    );

    const headerCandidates: Array<Record<string, string>> = [
        { Authorization: `Bearer ${apiKey}` },
        { 'x-api-key': apiKey },
    ];

    let lastErr: any = null;

    for (const headers of headerCandidates) {
        for (const p of pathCandidates) {
            try {
                const url = `${base}${p}`;
                const res = await axios.post(url, payload, { headers, timeout: 20000 });
                const data = res.data || {};
                return {
                    paymentUrl: extractPaymentUrl(data),
                    transactionId: data.transactionId || data.id,
                    provider: data.provider || data.channel || undefined,
                };
            } catch (e: any) {
                const status = e?.response?.status;
                // 403/404/405 -> on tente le header/chemin suivant
                if (status === 403 || status === 404 || status === 405) {
                    lastErr = e;
                    continue;
                }
                // Toute autre erreur -> on jette tout de suite
                throw e;
            }
        }
    }

    throw lastErr || new Error('Payment initiation failed');
}

export function verifyLygosSignature(rawBody: string, signature: string | undefined): boolean {
    const secret = process.env.LYGOS_WEBHOOK_SECRET;
    if (!secret || !signature) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    const provided = signature.startsWith('sha256=') ? signature.slice(7) : signature;
    try {
        const a = Buffer.from(expected, 'hex');
        const b = Buffer.from(provided, 'hex');
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}