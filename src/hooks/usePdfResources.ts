'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface PdfResource {
  id: string;
  title: string;
  type: string;
}

export type PdfResourcesStatus = 'idle' | 'loading' | 'ready' | 'error';

const PAGE_SIZE = 50;
export const MAX_PDF_RESOURCES = 200;
/** Une liste déjà chargée depuis moins de 2 minutes n'est pas rechargée à chaque ouverture. */
const STALE_MS = 2 * 60 * 1000;

function toResource(value: unknown): PdfResource | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.title !== 'string' || r.type !== 'PDF') return null;
  return { id: r.id, title: r.title, type: r.type };
}

async function readApiError(res: Response): Promise<string> {
  const data: unknown = await res.json().catch(() => null);
  const message = (data as { error?: unknown } | null)?.error;
  return typeof message === 'string' && message
    ? message
    : 'Impossible de charger la liste des documents.';
}

/**
 * Tous les PDF accessibles à l'utilisateur, dossiers compris : `GET /api/resources?type=PDF&flat=1`
 * renvoie un tableau plat (50 par page, curseur dans l'en-tête `X-Next-Cursor`). Les pages sont
 * suivies jusqu'à MAX_PDF_RESOURCES éléments. `load()` ne fait rien si la liste est récente.
 */
export function usePdfResources() {
  const [resources, setResources] = useState<PdfResource[]>([]);
  const [status, setStatus] = useState<PdfResourcesStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const requestId = useRef(0);
  const loadedAt = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    // Une réponse tardive d'un composant démonté ne doit plus modifier l'état.
    return () => {
      requestId.current += 1;
    };
  }, []);

  const load = useCallback(async (force = false) => {
    if (inFlight.current) return;
    if (!force && loadedAt.current > 0 && Date.now() - loadedAt.current < STALE_MS) return;

    inFlight.current = true;
    const id = ++requestId.current;
    setStatus('loading');
    setError(null);

    try {
      const all: PdfResource[] = [];
      const seen = new Set<string>();
      let cursor: string | null = null;
      let more = false;

      while (all.length < MAX_PDF_RESOURCES) {
        const params = new URLSearchParams({ type: 'PDF', flat: '1', limit: String(PAGE_SIZE) });
        if (cursor) params.set('cursor', cursor);

        const res: Response = await fetch(`/api/resources?${params}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(await readApiError(res));

        // Tableau plat (contrat), ou page { items, nextCursor } par prudence.
        const data: unknown = await res.json();
        const body = data as { items?: unknown; nextCursor?: unknown } | null;
        const rows: unknown[] = Array.isArray(data) ? data : Array.isArray(body?.items) ? body.items : [];

        for (const row of rows) {
          const resource = toResource(row);
          if (resource && !seen.has(resource.id)) {
            seen.add(resource.id);
            all.push(resource);
          }
        }

        const next: string | null =
          res.headers.get('X-Next-Cursor') ?? (typeof body?.nextCursor === 'string' ? body.nextCursor : null);
        more = !!next && next !== cursor && rows.length > 0;
        if (!more) break;
        cursor = next;
      }

      if (id !== requestId.current) return;
      setResources(all.slice(0, MAX_PDF_RESOURCES));
      setTruncated(more || all.length > MAX_PDF_RESOURCES);
      setStatus('ready');
      loadedAt.current = Date.now();
    } catch (err) {
      if (id !== requestId.current) return;
      setStatus('error');
      setError(err instanceof Error && err.message ? err.message : 'Impossible de charger la liste des documents.');
    } finally {
      inFlight.current = false;
    }
  }, []);

  return { resources, status, error, truncated, load };
}
