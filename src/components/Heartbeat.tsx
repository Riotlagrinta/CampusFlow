'use client';

import { useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';

const HEARTBEAT_INTERVAL_MS = 120_000; // 2 minutes
const MIN_GAP_MS = 30_000; // évite les rafales lors des changements d'onglet

export default function Heartbeat() {
  const { data: session } = useSession();
  // Dépendance sur l'identifiant (stable) et non sur l'objet session, recréé à chaque refetch.
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | null = null;
    let lastSent = 0;

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    // Garde anti-boucle : la déconnexion forcée n'est déclenchée qu'une seule fois.
    let expired = false;

    const expireSession = () => {
      if (expired) return;
      expired = true;
      stop();
      // Session révoquée côté serveur (mot de passe changé ailleurs, compte désactivé) : toutes les
      // API répondent 401 alors que l'interface semble connectée. On ferme aussi la session locale.
      try {
        signOut({ callbackUrl: '/login?reason=session_expired' }).catch(() => {});
      } catch {
        // jamais d'exception depuis le heartbeat
      }
    };

    const send = async () => {
      if (expired) return;
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastSent < MIN_GAP_MS) return;
      lastSent = Date.now();
      try {
        const res = await fetch('/api/user/heartbeat', { method: 'POST', signal: controller.signal });
        if (res.status === 401) expireSession();
      } catch {
        // Erreur silencieuse (non critique, y compris l'annulation au démontage)
      }
    };

    const start = () => {
      if (timer !== null || expired) return;
      void send();
      timer = setInterval(send, HEARTBEAT_INTERVAL_MS);
    };

    // Onglet masqué : on suspend l'envoi, on reprend au retour.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    onVisibilityChange();

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stop();
      controller.abort();
    };
  }, [userId]);

  return null; // Composant invisible
}
