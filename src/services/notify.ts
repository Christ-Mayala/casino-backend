import { sendEmail } from './email';
import { sendSMS } from './sms';
import { getCollections } from '../legacy/db';

export async function notifyLowStock(productName: string, stock: number) {
  try {
    const { staff } = await getCollections();
    const recipients = await staff.find({ isActive: true, role: { $in: ['admin','staff'] } }).toArray();
    const toEmails = recipients.map((s:any)=>s.email).filter(Boolean);
    const subject = `Alerte stock faible: ${productName}`;
    const html = `<p>Le stock de <b>${productName}</b> est bas: ${stock}.</p>`;
    for (const email of toEmails) {
      await sendEmail(email, subject, html);
    }
  } catch (e) {
    console.warn('notifyLowStock error', e);
  }
}

export async function notifyFinalCode(toEmail: string | undefined, toPhone: string | undefined, finalCode: string, orderNumber: string) {
  const subj = `Code retrait final pour votre commande ${orderNumber}`;
  const html = `<p>Votre code final: <b>${finalCode}</b></p>`;
  if (toEmail) await sendEmail(toEmail, subj, html);
  if (toPhone) await sendSMS(toPhone, `Code final pour ${orderNumber}: ${finalCode}`);
}
