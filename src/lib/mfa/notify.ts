import { escapeHtml, sendEmail } from '@/lib/mail';

// Alertes email du second facteur, envoyées à l'adresse du compte. Elles ne bloquent rien : un échec
// d'envoi est ignoré. Leur rôle est la détection : l'activation se fait avec le seul mot de passe
// (la première fois), et un code de secours ne devrait servir qu'en cas de perte du téléphone.

export type MfaEvent = { kind: 'enrolled' } | { kind: 'recovery-used'; remaining: number };

export function buildMfaEmail(event: MfaEvent, when: Date): { subject: string; html: string } {
  const date = escapeHtml(
    when.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }) + ' (UTC)'
  );
  const warning =
    "Si ce n'est pas vous, changez immédiatement votre mot de passe (« Mot de passe oublié » sur la page de connexion) et prévenez l'administrateur système.";

  if (event.kind === 'enrolled') {
    return {
      subject: 'Double authentification activée sur votre compte StudentHub',
      html: `<div style="font-family: sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #059669;">Double authentification activée</h2>
        <p>Une application d'authentification vient d'être associée à votre compte administrateur le ${date}.</p>
        <p style="font-size: 13px; color: #b91c1c;">${escapeHtml(warning)}</p>
      </div>`,
    };
  }

  return {
    subject: 'Un code de secours a été utilisé sur votre compte StudentHub',
    html: `<div style="font-family: sans-serif; padding: 20px; color: #333;">
      <h2 style="color: #d97706;">Code de secours utilisé</h2>
      <p>Un code de secours a servi à valider la double authentification de votre compte le ${date}. Il vous en reste ${event.remaining}.</p>
      <p style="font-size: 13px; color: #b91c1c;">${escapeHtml(warning)}</p>
    </div>`,
  };
}

export async function notifyMfaEvent(to: string, event: MfaEvent): Promise<void> {
  try {
    const { subject, html } = buildMfaEmail(event, new Date());
    await sendEmail({ to, subject, html });
  } catch (error) {
    console.error('MFA : alerte email impossible', error instanceof Error ? error.name : 'erreur');
  }
}
