// Configuration de l'application mobile.
//
// Les variables EXPO_PUBLIC_* sont injectées au build (fichier mobile/.env en local,
// variables d'environnement EAS pour les builds). Elles doivent être lues avec la
// notation littérale `process.env.EXPO_PUBLIC_XXX`, sans destructuration ni clé dynamique.
// Voir mobile/.env.example.

const DEFAULT_API_URL = 'https://studenthub-mu.vercel.app/api';

const rawApiUrl = process.env.EXPO_PUBLIC_API_URL;
const rawAdminWhatsapp = process.env.EXPO_PUBLIC_ADMIN_WHATSAPP;
const rawTmoneyNumber = process.env.EXPO_PUBLIC_TMONEY_NUMBER;
const rawFloozNumber = process.env.EXPO_PUBLIC_FLOOZ_NUMBER;
const rawPaymentsEnabled = process.env.EXPO_PUBLIC_PAYMENTS_ENABLED;

function resolveApiUrl(): string {
  const configured = rawApiUrl?.trim().replace(/\/+$/, '');
  if (!configured) return DEFAULT_API_URL;
  // En production on refuse le HTTP en clair : le jeton d'authentification y circulerait.
  if (!__DEV__ && !configured.startsWith('https://')) return DEFAULT_API_URL;
  return configured;
}

/** URL de base de l'API (se termine par /api, sans slash final). */
export const API_URL = resolveApiUrl();

/** Origine du site web : sert à ouvrir les fichiers hébergés (ex. /uploads/cours.pdf). */
export const SITE_URL = API_URL.replace(/\/api$/, '');

/** Délai maximal d'une requête API. */
export const REQUEST_TIMEOUT_MS = 15000;

/** Palier d'XP par niveau (identique à src/lib/xp.ts côté serveur : niveau = XP / 500 + 1). */
export const XP_PER_LEVEL = 500;

// Coordonnées du paiement manuel : jamais codées en dur dans l'application.
// Si elles ne sont pas définies, le paiement manuel est désactivé dans le checkout.
export const ADMIN_WHATSAPP = (rawAdminWhatsapp ?? '').replace(/\D/g, '');
export const TMONEY_NUMBER = (rawTmoneyNumber ?? '').trim();
export const FLOOZ_NUMBER = (rawFloozNumber ?? '').trim();

/**
 * Interrupteur des paiements : DÉSACTIVÉ PAR DÉFAUT. Les paiements (boutique, achat de jetons,
 * abonnements) ne s'ouvrent que si EXPO_PUBLIC_PAYMENTS_ENABLED vaut exactement "true" (valeur
 * injectée au build : refaire un build après modification). Tant qu'il est fermé, aucun écran
 * ni bouton n'y mène. Le serveur a le même interrupteur (NEXT_PUBLIC_PAYMENTS_ENABLED).
 */
export const PAYMENTS_ENABLED = rawPaymentsEnabled === 'true';

/** Message affiché quand le serveur refuse un paiement (503, code payments_disabled). */
export const PAYMENTS_DISABLED_MESSAGE = 'Les paiements ne sont pas encore disponibles.';
