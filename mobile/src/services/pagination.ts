import api from './api';
import { toList } from '../utils/format';

const PAGE_SIZE = 50;

/**
 * Lit toutes les pages d'une liste paginée par curseur (planning, ressources, devoirs) :
 * le corps de chaque réponse est un tableau, le curseur de la page suivante est dans
 * l'en-tête `X-Next-Cursor` (absent sur la dernière page).
 *
 * `maxPages` borne le nombre de requêtes (50 éléments par page).
 */
export async function fetchAllPages<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  maxPages = 10
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const response = await api.get(path, {
      params: { ...params, limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) },
    });
    items.push(...toList<T>(response.data));

    const next: unknown = response.headers?.['x-next-cursor'];
    if (typeof next !== 'string' || !next) break;
    cursor = next;
  }

  return items;
}
