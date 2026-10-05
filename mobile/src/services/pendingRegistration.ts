// Inscription en attente d'activation, gardée EN MÉMOIRE uniquement (jamais stockée ni
// passée dans l'URL). Elle permet de « renvoyer le code » : l'API renvoie un nouveau code
// quand on soumet de nouveau l'inscription avec les mêmes informations.

export interface RegistrationPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  fieldId: string;
  levelId: string;
  referralCode?: string;
}

// L'OTP expire après 1 h côté serveur : au-delà, le renvoi n'est plus proposé.
const MAX_AGE_MS = 60 * 60 * 1000;

let pending: { payload: RegistrationPayload; savedAt: number } | null = null;

export function setPendingRegistration(payload: RegistrationPayload | null): void {
  pending = payload ? { payload, savedAt: Date.now() } : null;
}

export function getPendingRegistration(): RegistrationPayload | null {
  if (!pending) return null;
  if (Date.now() - pending.savedAt > MAX_AGE_MS) {
    pending = null;
    return null;
  }
  return pending.payload;
}
