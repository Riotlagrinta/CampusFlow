/**
 * Semestre en cours, déduit du calendrier comme côté serveur (src/lib/contentListing.ts) :
 * S1 de septembre à janvier, S2 de février à août.
 */
export function getCurrentSemester(now: Date = new Date()): number {
  const month = now.getUTCMonth() + 1;
  return month >= 9 || month === 1 ? 1 : 2;
}

export const DAY_ORDER = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
