import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

export function initializeEmailService() {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPassword = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPassword) {
    console.warn('⚠️ Gmail credentials not configured. Email service disabled.');
    console.warn('Set GMAIL_USER and GMAIL_APP_PASSWORD in .env to enable emails.');
    return false;
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPassword,
    },
  });

  console.log('✅ Email service initialized with Gmail SMTP');
  return true;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!transporter) {
    console.warn('Email service not initialized');
    return false;
  }

  try {
    const gmailUser = process.env.GMAIL_USER;
    await transporter.sendMail({ from: gmailUser, to, subject, html });
    console.log(`✅ Email sent to ${to}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    return false;
  }
}

export function generatePasswordResetTemplate(resetLink: string, username: string): string {
  return `<!DOCTYPE html><html><body><h2>Réinitialisation du mot de passe</h2><p>Bonjour ${username || ''},</p><p>Cliquez ici: <a href="${resetLink}">Réinitialiser</a></p></body></html>`;
}

export function generateWelcomeTemplate(username: string): string {
  return `<!DOCTYPE html><html><body><h2>Bienvenue chez Géant Casino</h2><p>Bonjour ${username || 'client'},</p><p>Votre compte a été créé avec succès. Vous pouvez dès maintenant parcourir notre catalogue et passer commande.</p><p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}">Commencer mes courses</a></p></body></html>`;
}

export function generateOrderConfirmationTemplate(orderNumber: string, customerName: string, items: Array<{ productName: string; quantity: number; price: number }>, total: number, tempPickupCode: string, pickupDate: string, pickupTime: string): string {
  const itemsHtml = items.map(i => `<li>${i.productName} ×${i.quantity} - ${(i.price * i.quantity).toFixed(2)} FCFA</li>`).join('');
  return `<!DOCTYPE html><html><body><h2>Confirmation commande ${orderNumber}</h2><p>Bonjour ${customerName},</p><ul>${itemsHtml}</ul><p>Total: ${total.toFixed(2)} FCFA</p><p>Code retrait temporaire: <b>${tempPickupCode}</b></p><p>Retrait: ${pickupDate} ${pickupTime}</p></body></html>`;
}
