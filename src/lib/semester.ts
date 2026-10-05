// Semestre en cours, partagé par le serveur et le navigateur : aucune dépendance serveur ici
// (ni Prisma ni next/server), pour pouvoir être importé depuis les pages "use client".

export type Semester = 1 | 2;

function parseSemester(raw: string | undefined): Semester | null {
  const value = raw?.trim();
  return value === '1' ? 1 : value === '2' ? 2 : null;
}

// `process.env.NEXT_PUBLIC_*` n'est remplacé à la compilation que sous cette forme littérale
// (pas d'accès dynamique). CURRENT_SEMESTER n'existe que côté serveur : côté navigateur, la
// lecture renvoie undefined (ou lève si `process` est absent, d'où le try/catch).
function readOverride(): Semester | null {
  const fromPublic = parseSemester(process.env.NEXT_PUBLIC_CURRENT_SEMESTER);
  if (fromPublic) return fromPublic;
  try {
    return parseSemester(process.env.CURRENT_SEMESTER);
  } catch {
    return null;
  }
}

/**
 * Semestre en cours : S1 de septembre à janvier, S2 de février à août (mois UTC, comme le
 * mobile). Les variables d'environnement NEXT_PUBLIC_CURRENT_SEMESTER puis CURRENT_SEMESTER
 * (valeurs « 1 » ou « 2 ») permettent de le forcer ; seule la première est lisible côté client.
 */
export function getCurrentSemester(date: Date = new Date()): Semester {
  const forced = readOverride();
  if (forced) return forced;
  const month = date.getUTCMonth() + 1;
  return month >= 9 || month === 1 ? 1 : 2;
}
