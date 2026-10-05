import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import api, { TOKEN_KEY, USER_KEY, setUnauthorizedHandler } from '../services/api';
import { clearCache, setCacheOwner } from '../services/cache';
import { getErrorMessage, getErrorStatus, logError } from '../services/errors';
import { registerForPushNotificationsAsync } from '../services/notifications';

/** Utilisateur connecté (champs « safe » de GET /user/profile + noms de filière/niveau). */
export interface AuthUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  image?: string | null;
  bio?: string | null;
  role?: string;
  xp?: number;
  /** Niveau de jeu (XP), pas le niveau académique. */
  level?: number;
  streak?: number;
  isSubscribed?: boolean;
  subscriptionExpiresAt?: string | null;
  referralCode?: string | null;
  fieldId?: string | null;
  academicLevelId?: string | null;
  aiBonusRequests?: number;
  /** Nom de la filière (ex. « Génie Logiciel »). */
  fieldName?: string | null;
  /** Nom du niveau académique (ex. « L2 »). */
  academicLevelName?: string | null;
}

export type AuthErrorCode = 'NOT_ACTIVATED' | 'INVALID_CREDENTIALS' | 'OTHER';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  /** Vrai tant que la session stockée n'a pas été relue et validée. */
  isLoading: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Relit GET /user/profile ; renvoie null si indisponible (la session est conservée). */
  refreshUser: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Lecture défensive des réponses serveur
// ---------------------------------------------------------------------------

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;
const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const asNullableString = (value: unknown): string | null | undefined =>
  value === null ? null : asString(value);
const asBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;
/** `value` si défini (même null), sinon `fallback`. */
const pick = <T,>(value: T | undefined, fallback: T | undefined): T | undefined =>
  value !== undefined ? value : fallback;

function nameOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return asString((value as { name?: unknown }).name);
  return undefined;
}

function parseStoredUser(serialized: string | null): AuthUser | null {
  if (!serialized) return null;
  try {
    const parsed: unknown = JSON.parse(serialized);
    // Relecture typée champ par champ (jamais de cast aveugle d'une valeur stockée).
    const user = userFromProfile(parsed, null);
    if (user && parsed && typeof parsed === 'object') {
      // Anciennes versions : `level` était le NOM du niveau académique (chaîne).
      const legacyLevel = (parsed as { level?: unknown }).level;
      if (!user.academicLevelName && typeof legacyLevel === 'string') {
        user.academicLevelName = legacyLevel;
      }
    }
    return user;
  } catch {
    // Valeur corrompue : on l'ignore.
  }
  return null;
}

/** Réponse de POST /auth/login : `field` et `level` y sont des NOMS (chaînes). */
function userFromLogin(raw: unknown): AuthUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  const email = asString(r.email);
  if (!id || !email) return null;
  return {
    id,
    email,
    firstName: asNullableString(r.firstName),
    lastName: asNullableString(r.lastName),
    role: asString(r.role),
    fieldName: asString(r.field),
    academicLevelName: asString(r.level),
  };
}

/** Réponse de GET/PATCH /user/profile (safeUserSelect), fusionnée avec l'état connu. */
function userFromProfile(raw: unknown, previous: AuthUser | null): AuthUser | null {
  if (!raw || typeof raw !== 'object') return previous;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id) ?? previous?.id;
  const email = asString(r.email) ?? previous?.email;
  if (!id || !email) return previous;
  return {
    ...previous,
    id,
    email,
    firstName: pick(asNullableString(r.firstName), previous?.firstName),
    lastName: pick(asNullableString(r.lastName), previous?.lastName),
    phone: pick(asNullableString(r.phone), previous?.phone),
    image: pick(asNullableString(r.image), previous?.image),
    bio: pick(asNullableString(r.bio), previous?.bio),
    role: pick(asString(r.role), previous?.role),
    xp: pick(asNumber(r.xp), previous?.xp),
    level: pick(asNumber(r.level), previous?.level),
    streak: pick(asNumber(r.streak), previous?.streak),
    isSubscribed: pick(asBoolean(r.isSubscribed), previous?.isSubscribed),
    subscriptionExpiresAt: pick(
      asNullableString(r.subscriptionExpiresAt),
      previous?.subscriptionExpiresAt
    ),
    referralCode: pick(asNullableString(r.referralCode), previous?.referralCode),
    fieldId: pick(asNullableString(r.fieldId), previous?.fieldId),
    academicLevelId: pick(asNullableString(r.academicLevelId), previous?.academicLevelId),
    aiBonusRequests: pick(asNumber(r.aiBonusRequests), previous?.aiBonusRequests),
    // Le profil peut aussi renvoyer les relations `field` / `academicLevel`.
    fieldName: pick(nameOf(r.field), previous?.fieldName),
    academicLevelName: pick(nameOf(r.academicLevel), previous?.academicLevelName),
  };
}

/** Complète les noms de filière/niveau à partir des identifiants (route publique). */
async function resolveAcademicNames(user: AuthUser): Promise<AuthUser> {
  const needsField = !user.fieldName && !!user.fieldId;
  const needsLevel = !user.academicLevelName && !!user.academicLevelId;
  if (!needsField && !needsLevel) return user;

  try {
    const res = await api.get('/academic/options');
    const body: unknown = res.data;
    const fields = body && typeof body === 'object' ? (body as { fields?: unknown }).fields : null;
    const levels = body && typeof body === 'object' ? (body as { levels?: unknown }).levels : null;
    const find = (list: unknown, id: string | null | undefined): string | undefined => {
      if (!Array.isArray(list) || !id) return undefined;
      const match = list.find(
        (item): item is { id: string; name?: unknown } =>
          !!item && typeof item === 'object' && (item as { id?: unknown }).id === id
      );
      return match ? asString(match.name) : undefined;
    };
    return {
      ...user,
      fieldName: user.fieldName ?? find(fields, user.fieldId),
      academicLevelName: user.academicLevelName ?? find(levels, user.academicLevelId),
    };
  } catch {
    return user;
  }
}

function buildAuthError(error: unknown): Error & { code: AuthErrorCode } {
  const status = getErrorStatus(error);
  const message = getErrorMessage(error, 'Erreur de connexion');
  if (status === 403) {
    return Object.assign(new Error(message), { code: 'NOT_ACTIVATED' as const });
  }
  if (status === 400 || status === 401) {
    return Object.assign(new Error(message), { code: 'INVALID_CREDENTIALS' as const });
  }
  return Object.assign(new Error(message), { code: 'OTHER' as const });
}

/** Vrai si l'erreur de signIn signale un compte inscrit mais non activé (OTP à saisir). */
export function isNotActivatedError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === 'NOT_ACTIVATED'
  );
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Copies synchrones pour les callbacks (intercepteur 401, déconnexion) sans dépendances.
  const tokenRef = useRef<string | null>(null);
  const userRef = useRef<AuthUser | null>(null);
  const pushRegistered = useRef(false);

  const commitUser = useCallback((next: AuthUser | null) => {
    userRef.current = next;
    setUser(next);
    if (next) {
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(next)).catch(() => {});
    }
  }, []);

  /** Efface la session locale : état, jeton SecureStore, cache. Idempotent. */
  const clearSession = useCallback(async () => {
    tokenRef.current = null;
    userRef.current = null;
    pushRegistered.current = false;
    setCacheOwner(null);
    setToken(null);
    setUser(null);
    await Promise.allSettled([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
      clearCache(),
    ]);
  }, []);

  // 401 sur une requête authentifiée (jeton expiré, révoqué, compte désactivé).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (tokenRef.current) {
        void clearSession();
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const refreshUser = useCallback(async (): Promise<AuthUser | null> => {
    if (!tokenRef.current) return null;
    try {
      const res = await api.get('/user/profile');
      const merged = userFromProfile(res.data, userRef.current);
      if (!merged) return userRef.current;
      const completed = await resolveAcademicNames(merged);
      // La session a pu être fermée pendant l'appel.
      if (!tokenRef.current) return null;
      commitUser(completed);
      return completed;
    } catch (error) {
      logError('refreshUser', error);
      return null;
    }
  }, [commitUser]);

  // Au démarrage : relit le jeton, puis le valide auprès du serveur.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const [storedToken, storedUser] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(USER_KEY),
        ]);
        if (cancelled) return;

        // Anciennes versions : cache non cloisonné éventuellement présent sans session.
        if (!storedToken) {
          void clearCache();
          return;
        }

        const cachedUser = parseStoredUser(storedUser);
        tokenRef.current = storedToken;
        userRef.current = cachedUser;
        setCacheOwner(cachedUser?.id ?? null);
        setToken(storedToken);
        setUser(cachedUser);

        try {
          // Délai court : hors-ligne, on ne bloque pas l'ouverture de l'application.
          const res = await api.get('/user/profile', { timeout: 8000 });
          if (cancelled || !tokenRef.current) return;
          const merged = userFromProfile(res.data, cachedUser);
          if (merged) {
            setCacheOwner(merged.id);
            commitUser(await resolveAcademicNames(merged));
          }
        } catch (error) {
          // 401 : l'intercepteur a déjà fermé la session. Réseau/5xx : on garde la session
          // locale (mode hors-ligne avec les données en cache).
          if (getErrorStatus(error) === 401) {
            await clearSession();
          } else {
            logError('validation de session', error);
          }
        }
      } catch (error) {
        logError('lecture de session', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [clearSession, commitUser]);

  // Enregistrement push : une fois par session connectée, sans bloquer l'interface.
  useEffect(() => {
    if (!token || isLoading || pushRegistered.current) return;
    pushRegistered.current = true;
    registerForPushNotificationsAsync().catch((error) => logError('push', error));
  }, [token, isLoading]);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      let data: unknown;
      try {
        const res = await api.post('/auth/login', { identifier: identifier.trim(), password });
        data = res.data;
      } catch (error) {
        throw buildAuthError(error);
      }

      const body = (data && typeof data === 'object' ? data : {}) as {
        token?: unknown;
        user?: unknown;
      };
      const newToken = asString(body.token);
      if (!newToken) {
        throw Object.assign(new Error('Réponse du serveur invalide. Réessayez.'), {
          code: 'OTHER' as const,
        });
      }

      let newUser = userFromLogin(body.user);
      if (!newUser) {
        // Réponse de login sans profil exploitable : on le demande explicitement.
        try {
          const profile = await api.get('/user/profile', {
            headers: { Authorization: `Bearer ${newToken}` },
          });
          newUser = userFromProfile(profile.data, null);
        } catch (error) {
          throw buildAuthError(error);
        }
      }
      if (!newUser) {
        throw Object.assign(new Error('Réponse du serveur invalide. Réessayez.'), {
          code: 'OTHER' as const,
        });
      }

      try {
        await SecureStore.setItemAsync(TOKEN_KEY, newToken);
        await SecureStore.setItemAsync(USER_KEY, JSON.stringify(newUser));
      } catch {
        throw Object.assign(
          new Error("Impossible d'enregistrer la session sur cet appareil."),
          { code: 'OTHER' as const }
        );
      }

      // Nouvelle session : aucune donnée d'un compte précédent ne doit rester.
      setCacheOwner(null);
      await clearCache();
      setCacheOwner(newUser.id);

      tokenRef.current = newToken;
      userRef.current = newUser;
      pushRegistered.current = false;
      setToken(newToken);
      setUser(newUser);

      // Profil complet (XP, niveau, jetons...) sans bloquer la navigation.
      void refreshUser();
    },
    [refreshUser]
  );

  // Déconnexion réelle : jeton SecureStore, utilisateur et cache hors-ligne sont supprimés.
  // Le pushToken est d'abord dissocié du compte (au mieux : hors-ligne ou jeton expiré,
  // la déconnexion locale a lieu quand même) pour ne plus recevoir ses notifications.
  const signOut = useCallback(async () => {
    try {
      await api.patch('/user/profile', { pushToken: null }, { timeout: 4000 });
    } catch {
      // Ignoré volontairement : la déconnexion ne doit jamais échouer.
    }
    await clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({ user, token, isLoading, signIn, signOut, refreshUser }),
    [user, token, isLoading, signIn, signOut, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans un AuthProvider');
  return context;
};
