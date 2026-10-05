import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_URL, REQUEST_TIMEOUT_MS } from '../config';

// Clés SecureStore de la session (le jeton ne doit jamais aller dans AsyncStorage).
export const TOKEN_KEY = 'userToken';
export const USER_KEY = 'userInfo';

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Enregistré par AuthProvider : appelé quand le serveur rejette le jeton (401). */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

const api = axios.create({
  baseURL: API_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Ajoute le jeton JWT (Bearer) à chaque requête.
api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // Stockage sécurisé indisponible : la requête part sans jeton (le serveur répondra 401).
  }
  return config;
});

// 401 sur une requête authentifiée = session expirée ou révoquée : déconnexion globale.
// Les routes /auth/* sont exclues : un 401 au login signifie « identifiants invalides ».
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const sentToken = Boolean(error.config?.headers?.Authorization);
      const isAuthRoute = (error.config?.url ?? '').startsWith('/auth/');
      if (sentToken && !isAuthRoute) {
        unauthorizedHandler?.();
      }
    }
    return Promise.reject(error);
  }
);

export default api;
