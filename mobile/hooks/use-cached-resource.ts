import { useCallback, useEffect, useRef, useState } from 'react';
import { cacheData, getCachedData } from '../src/services/cache';
import { getErrorMessage, isNetworkError, logError } from '../src/services/errors';

export interface CachedResource<T> {
  data: T | null;
  /** Premier chargement, sans donnée (même en cache) à afficher. */
  loading: boolean;
  /** Rafraîchissement manuel (tirer pour actualiser). */
  refreshing: boolean;
  /** Dernière erreur de chargement (message prêt à afficher). */
  error: string | null;
  /** Le serveur est injoignable : les données affichées viennent du cache. */
  offline: boolean;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Charge une ressource avec cache hors-ligne (stale-while-revalidate) :
 * 1. affiche immédiatement la copie en cache de l'utilisateur courant, si elle existe ;
 * 2. appelle le serveur, remplace les données et met à jour le cache ;
 * 3. hors-ligne, conserve le cache et signale `offline`.
 *
 * `key` doit identifier la ressource (le cache est déjà cloisonné par utilisateur) ;
 * un changement de `key` recharge. `enabled=false` suspend tout (ex. invité).
 */
export function useCachedResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  enabled = true
): CachedResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const fetcherRef = useRef(fetcher);
  const hasData = useRef(false);
  const activeKey = useRef(key);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const run = useCallback(async () => {
    const runKey = key;
    try {
      if (!hasData.current) {
        const cached = await getCachedData<T>(runKey);
        if (cached !== null && activeKey.current === runKey && !hasData.current) {
          hasData.current = true;
          setData(cached);
          setLoading(false);
        }
      }

      const fresh = await fetcherRef.current();
      if (activeKey.current !== runKey) return;
      hasData.current = true;
      setData(fresh);
      setError(null);
      setOffline(false);
      void cacheData(runKey, fresh);
    } catch (e) {
      if (activeKey.current !== runKey) return;
      logError(`chargement ${runKey}`, e);
      if (isNetworkError(e)) {
        setOffline(true);
        // Sans copie en cache, l'utilisateur doit savoir pourquoi l'écran est vide.
        if (!hasData.current) setError(getErrorMessage(e));
      } else {
        setError(getErrorMessage(e, 'Chargement impossible.'));
      }
    } finally {
      if (activeKey.current === runKey) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [key]);

  useEffect(() => {
    activeKey.current = key;
    hasData.current = false;
    setData(null);
    setError(null);
    setOffline(false);
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void run();
  }, [enabled, key, run]);

  const reload = useCallback(async () => {
    setError(null);
    await run();
  }, [run]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await run();
  }, [run]);

  return { data, loading, refreshing, error, offline, reload, refresh };
}
