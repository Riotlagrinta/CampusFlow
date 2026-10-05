import nodemailer, { type Transporter } from 'nodemailer';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// À utiliser pour toute donnée saisie par un utilisateur insérée dans un email HTML.
export function escapeHtml(value: string | null | undefined): string {
  return (value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

let transporter: Transporter | null = null;

function getTransporter(user: string, pass: string) {
  transporter ??= nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transporter;
}

/**
 * Envoie un email. Renvoie `true` si le serveur SMTP a accepté le message, `false` sinon
 * (configuration absente ou échec d'envoi) : l'appelant décide quoi dire à l'utilisateur.
 * Ni le destinataire, ni le sujet, ni le contenu (codes OTP) ne sont journalisés.
 */
export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<boolean> {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPass) {
    console.warn('EMAIL : GMAIL_USER / GMAIL_APP_PASSWORD manquants, message non envoyé.');
    return false;
  }

  if (!to || !to.includes('@')) return false;

  try {
    await getTransporter(gmailUser, gmailPass).sendMail({
      from: `"StudentHub" <${gmailUser}>`,
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    const err = error as { code?: string; responseCode?: number };
    console.error('EMAIL : échec d\'envoi', { code: err.code, responseCode: err.responseCode });
    if (err.code === 'EAUTH') {
      console.error('EMAIL : authentification refusée, vérifiez GMAIL_APP_PASSWORD.');
    }
    return false;
  }
}
