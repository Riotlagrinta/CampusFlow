/**
 * Source unique des offres (recharges de jetons et abonnements).
 *
 * Module pur (aucun import serveur) : il est utilisé à la fois par le serveur
 * (création de paiement, crédit) et par les pages shop / subscribe / checkout.
 * Le prix et le contenu d'une offre ne doivent JAMAIS être lus depuis le client.
 */

export type PackType = 'TOPUP' | 'SUBSCRIPTION';

export interface Pack {
  id: string;
  /** Nom canonique : stocké dans Transaction.packName et affiché partout. */
  name: string;
  /** Nom court pour les cartes de la page d'abonnement. */
  shortName: string;
  description: string;
  /** Prix en FCFA (XOF). */
  price: number;
  /** Jetons IA crédités à la validation (bonus pour un abonnement). */
  tokens: number;
  /** Durée d'abonnement ajoutée, en jours ; null pour une simple recharge. */
  durationDays: number | null;
  type: PackType;
  popular?: boolean;
  /**
   * Anciens noms enregistrés dans Transaction.packName avant l'unification :
   * ils permettent de valider les transactions PENDING créées auparavant.
   */
  legacyNames?: string[];
}

const PURCHASABLE_PACKS: readonly Pack[] = [
  {
    id: 'starter',
    name: 'Pack Découverte',
    shortName: 'Découverte',
    description: 'Parfait pour un devoir rapide.',
    price: 500,
    tokens: 50,
    durationDays: null,
    type: 'TOPUP',
    legacyNames: ['Pack Étudiant'],
  },
  {
    id: 'pro',
    name: 'Pack Révision',
    shortName: 'Révision',
    description: 'Idéal pour préparer un examen.',
    price: 1000,
    tokens: 150,
    durationDays: null,
    type: 'TOPUP',
    popular: true,
  },
  {
    id: 'master',
    name: 'Pack Master',
    shortName: 'Master',
    description: 'Pour réviser sereinement tout le semestre.',
    price: 2000,
    tokens: 500,
    durationDays: null,
    type: 'TOPUP',
  },
  {
    id: 'monthly_basic',
    name: 'Abonnement Basique',
    shortName: 'Basique',
    description: "Accès à la plateforme pendant 1 mois.",
    price: 500,
    tokens: 0,
    durationDays: 30,
    type: 'SUBSCRIPTION',
    legacyNames: ['Abonnement Basique (1 mois)'],
  },
  {
    id: 'quarterly_promo',
    name: 'Abonnement Trimestriel',
    shortName: 'Trimestriel',
    description: "Accès à la plateforme pendant 3 mois, avec des jetons bonus.",
    price: 2000,
    tokens: 500,
    durationDays: 90,
    type: 'SUBSCRIPTION',
    popular: true,
    legacyNames: ['Pack Trimestriel Promo'],
  },
  {
    id: 'semestriel_elite',
    name: 'Abonnement Semestriel Elite',
    shortName: 'Semestriel Elite',
    description: "Accès à la plateforme pendant 6 mois, avec des jetons bonus.",
    price: 2500,
    tokens: 1000,
    durationDays: 180,
    type: 'SUBSCRIPTION',
    legacyNames: ['Pack Semestriel Elite'],
  },
  {
    id: 'token_master',
    name: 'Pack Token Master',
    shortName: 'Token Master',
    description: "1 mois d'accès offert et un gros volume de jetons IA.",
    price: 2000,
    tokens: 5000,
    durationDays: 30,
    type: 'SUBSCRIPTION',
  },
];

/**
 * Offres retirées de la vente : jamais proposées ni achetables, mais
 * reconnues pour valider d'anciennes transactions encore PENDING.
 */
const LEGACY_PACKS: readonly Pack[] = [
  {
    id: 'monthly',
    name: 'Abonnement Premium (Ancien)',
    shortName: 'Premium',
    description: 'Ancienne offre mensuelle.',
    price: 5000,
    tokens: 0,
    durationDays: 30,
    type: 'SUBSCRIPTION',
  },
];

/** Offres actuellement en vente. */
export const PACKS: readonly Pack[] = PURCHASABLE_PACKS;
export const TOPUP_PACKS: readonly Pack[] = PURCHASABLE_PACKS.filter((p) => p.type === 'TOPUP');
export const SUBSCRIPTION_PACKS: readonly Pack[] = PURCHASABLE_PACKS.filter((p) => p.type === 'SUBSCRIPTION');

/** Retourne une offre en vente, ou undefined si l'identifiant est inconnu. */
export function getPack(id: unknown): Pack | undefined {
  if (typeof id !== 'string') return undefined;
  return PURCHASABLE_PACKS.find((p) => p.id === id);
}

/**
 * Retrouve l'offre correspondant à une transaction existante. La table
 * Transaction ne stocke pas l'identifiant de l'offre : on s'appuie sur le nom
 * exact (courant ou ancien), puis sur le triplet type/prix/jetons uniquement
 * si un seul candidat correspond. Jamais de correspondance partielle.
 */
export function findPackForTransaction(tx: {
  packName: string;
  type: string;
  amount: number;
  tokens: number;
}): Pack | undefined {
  const all = [...PURCHASABLE_PACKS, ...LEGACY_PACKS];

  const byName = all.find(
    (p) => p.type === tx.type && (p.name === tx.packName || p.legacyNames?.includes(tx.packName))
  );
  if (byName) return byName;

  const byShape = all.filter(
    (p) => p.type === tx.type && p.price === tx.amount && p.tokens === tx.tokens
  );
  return byShape.length === 1 ? byShape[0] : undefined;
}

/** 2000 -> "2 000" (espace insécable, sans dépendre de l'ICU du navigateur). */
export function formatPrice(amount: number): string {
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}

/** 30 -> "1 mois", 90 -> "3 mois", 180 -> "6 mois", 10 -> "10 jours". */
export function formatDuration(days: number): string {
  if (days >= 30 && days % 30 === 0) return `${days / 30} mois`;
  return `${days} jour${days > 1 ? 's' : ''}`;
}
