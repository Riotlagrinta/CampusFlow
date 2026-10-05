import { NextResponse } from 'next/server';
import { visibleFieldIds } from '@/lib/academicScope';

// Aides communes aux routes ressources / planning / devoirs / recherche / tableau de bord :
// périmètre filière (tronc commun), semestres, pagination par curseur.

export const MIN_SEMESTER = 1;
export const MAX_SEMESTER = 12;
export const MAX_PAGE_SIZE = 50;

export type FieldScope = { in: string[] } | null;

/**
 * Filtre `fieldId` applicable à un utilisateur : sa filière, ou l'ensemble des filières
 * du tronc commun (GL/RIT) s'il en fait partie (règle de `visibleFieldIds`).
 * `null` si l'utilisateur n'a pas de filière.
 */
export async function resolveFieldScope(fieldId: string | null): Promise<FieldScope> {
  const ids = await visibleFieldIds(fieldId);
  return ids.length > 0 ? { in: ids } : null;
}

/**
 * Lit un entier dans un paramètre de requête.
 * `undefined` : paramètre absent ; `null` : valeur invalide ; sinon l'entier validé.
 */
export function parseIntParam(raw: string | null, min: number, max: number): number | null | undefined {
  if (raw === null || raw === '') return undefined;
  if (!/^\d{1,6}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

// Semestre en cours : logique unique dans `@/lib/semester` (sans dépendance serveur, utilisable
// aussi par les pages client). Ré-exportée ici pour les routes qui l'importaient déjà.
export { getCurrentSemester } from '@/lib/semester';

export type ListParams = { limit: number; cursor?: string };

/** Pagination `limit` (1-50, 50 par défaut) et `cursor` (id du dernier élément reçu). */
export function parseListParams(sp: URLSearchParams): ListParams | { error: string } {
  const limit = parseIntParam(sp.get('limit'), 1, MAX_PAGE_SIZE);
  if (limit === null) return { error: `Paramètre limit invalide (1 à ${MAX_PAGE_SIZE})` };

  const cursor = sp.get('cursor');
  if (cursor !== null && (cursor.length === 0 || cursor.length > 100)) {
    return { error: 'Paramètre cursor invalide' };
  }

  return { limit: limit ?? MAX_PAGE_SIZE, cursor: cursor ?? undefined };
}

/** Arguments Prisma (`take`, `cursor`, `skip`) pour lire une page + 1 ligne (détection de la page suivante). */
export function pageArgs({ limit, cursor }: ListParams) {
  return { take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) };
}

/**
 * Découpe les lignes lues avec `pageArgs` (limit + 1) : la page à renvoyer et les en-têtes de
 * pagination (`X-Next-Cursor` = id du dernier élément, absent sur la dernière page).
 */
export function splitPage<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const headers: Record<string, string> = { 'Access-Control-Expose-Headers': 'X-Next-Cursor' };
  if (hasMore) headers['X-Next-Cursor'] = page[page.length - 1].id;
  return { page, headers };
}

/**
 * Réponse JSON d'une liste paginée. Le corps reste un tableau (compatibilité web et mobile) ;
 * le curseur de la page suivante est dans l'en-tête `X-Next-Cursor` (absent sur la dernière page).
 */
export function pagedResponse<T extends { id: string }>(rows: T[], limit: number, map?: (page: T[]) => T[]) {
  const { page, headers } = splitPage(rows, limit);
  return NextResponse.json(map ? map(page) : page, { headers });
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
