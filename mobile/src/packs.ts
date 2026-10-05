// Offres de jetons IA affichées dans la boutique.
//
// Copie des offres de recharge (type TOPUP) de src/lib/packs.ts (source unique côté
// Next.js) : mêmes id, noms, prix et jetons. Le serveur reste la seule source de vérité :
// il calcule le montant et les jetons à partir de `id` (POST /payment/genius/create
// { packId }), cette liste ne sert qu'à l'affichage. À mettre à jour avec src/lib/packs.ts.

export interface Pack {
  id: string;
  name: string;
  tokens: number;
  price: number;
  description: string;
  /** Classe Tailwind de la pastille d'icône. */
  color: string;
  popular: boolean;
}

export const PACKS: Pack[] = [
  {
    id: 'starter',
    name: 'Pack Découverte',
    tokens: 50,
    price: 500,
    description: 'Parfait pour un devoir rapide.',
    color: 'bg-blue-500',
    popular: false,
  },
  {
    id: 'pro',
    name: 'Pack Révision',
    tokens: 150,
    price: 1000,
    description: 'Idéal pour préparer un examen.',
    color: 'bg-purple-600',
    popular: true,
  },
  {
    id: 'master',
    name: 'Pack Master',
    tokens: 500,
    price: 2000,
    description: 'Pour réviser sereinement tout le semestre.',
    color: 'bg-amber-500',
    popular: false,
  },
];

export function findPack(id: string | undefined): Pack | undefined {
  return PACKS.find((pack) => pack.id === id);
}
