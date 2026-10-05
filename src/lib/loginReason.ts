// Message affiché sur la page de connexion pour un paramètre ?reason=... (par exemple après une
// déconnexion automatique : signOut({ callbackUrl: '/login?reason=session_expired' })).
// Liste blanche : seule une valeur connue produit un message, et ce message vient d'ici, jamais de
// l'URL. Une Map (et non un objet) pour que « constructor » ou « __proto__ » ne correspondent à rien.
const REASON_MESSAGES = new Map<string, string>([
  [
    'session_expired',
    'Votre session a expiré ou a été fermée après un changement de mot de passe. Reconnectez-vous.',
  ],
]);

export function loginReasonMessage(reason: string | null | undefined): string | null {
  if (typeof reason !== 'string') return null;
  return REASON_MESSAGES.get(reason) ?? null;
}
