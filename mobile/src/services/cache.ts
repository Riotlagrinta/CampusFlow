import AsyncStorage from '@react-native-async-storage/async-storage';

// Cache hors-ligne, cloisonné par utilisateur : clé réelle = `cache:<userId>:<clé>`.
// Tant qu'aucun utilisateur n'est connecté, rien n'est lu ni écrit.
const PREFIX = 'cache:';

// Clés des anciennes versions (non cloisonnées) : purgées pour ne rien laisser traîner.
const LEGACY_KEYS = ['userProfile', 'userSchedules', 'userResources'];

let owner: string | null = null;

/** Définit le propriétaire courant du cache (appelé par AuthProvider). */
export function setCacheOwner(userId: string | null): void {
  owner = userId;
}

function scopedKey(key: string): string | null {
  return owner ? `${PREFIX}${owner}:${key}` : null;
}

export const cacheData = async (key: string, data: unknown): Promise<void> => {
  const storageKey = scopedKey(key);
  if (!storageKey) return;
  try {
    await AsyncStorage.setItem(storageKey, JSON.stringify(data));
  } catch {
    // Cache indisponible (stockage plein...) : non bloquant.
  }
};

export const getCachedData = async <T = unknown>(key: string): Promise<T | null> => {
  const storageKey = scopedKey(key);
  if (!storageKey) return null;
  try {
    const cached = await AsyncStorage.getItem(storageKey);
    return cached ? (JSON.parse(cached) as T) : null;
  } catch {
    return null;
  }
};

/** Supprime tout le cache de tous les utilisateurs (déconnexion, session expirée). */
export const clearCache = async (): Promise<void> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter((key) => key.startsWith(PREFIX) || LEGACY_KEYS.includes(key));
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove);
    }
  } catch {
    // Non bloquant.
  }
};
