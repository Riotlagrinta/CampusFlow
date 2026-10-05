function readCredentials(): { instanceId: string; token: string } | null {
  const instanceId = process.env.WHATSAPP_INSTANCE_ID?.trim();
  const token = process.env.WHATSAPP_TOKEN?.trim();
  return instanceId && token ? { instanceId, token } : null;
}

/**
 * Vrai si l'envoi WhatsApp (UltraMsg) est configuré : WHATSAPP_INSTANCE_ID et WHATSAPP_TOKEN
 * non vides. Par défaut ce n'est PAS le cas : les codes de vérification partent alors par email
 * seulement. Définir les deux variables réactive WhatsApp sans toucher au code.
 */
export function isWhatsAppConfigured(): boolean {
  return readCredentials() !== null;
}

/**
 * Canaux RÉELS d'envoi des codes de vérification, pour les messages affichés à l'utilisateur :
 * « par email » (défaut) ou « par WhatsApp et par email » si WhatsApp est configuré.
 */
export function deliveryChannelsPhrase(): string {
  return isWhatsAppConfigured() ? 'par WhatsApp et par email' : 'par email';
}

/**
 * Envoie un message WhatsApp via UltraMsg. Renvoie `true` si le message a été accepté,
 * `false` sinon. Sans WHATSAPP_INSTANCE_ID / WHATSAPP_TOKEN, l'envoi est un no-op silencieux
 * (aucun identifiant de repli, aucun journal : WhatsApp est un canal optionnel). Les numéros
 * et le contenu des messages ne sont pas journalisés.
 */
export async function sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
  const credentials = readCredentials();
  if (!credentials) return false;
  const { instanceId, token } = credentials;

  // Le numéro doit être au format international, sans « + » ni séparateurs.
  const cleanNumber = to.replace(/\D/g, '');
  if (cleanNumber.length < 8 || cleanNumber.length > 15) return false;

  try {
    const response = await fetch(`https://api.ultramsg.com/${encodeURIComponent(instanceId)}/messages/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, to: cleanNumber, body: message, priority: 10 }),
      signal: AbortSignal.timeout(10_000),
    });

    const result = await response.json().catch(() => null);
    if (response.ok && result && (result.sent === 'true' || result.sent === true)) return true;

    console.error('WHATSAPP : envoi refusé', { status: response.status, error: result?.error ?? 'inconnue' });
    return false;
  } catch (error) {
    console.error('WHATSAPP : échec d\'envoi', error instanceof Error ? error.name : 'erreur inconnue');
    return false;
  }
}
