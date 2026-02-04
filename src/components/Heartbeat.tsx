'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';

export default function Heartbeat() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user) return;

    // Fonction pour envoyer le signal
    const sendHeartbeat = async () => {
      try {
        await fetch('/api/user/heartbeat', { method: 'POST' });
      } catch (err) {
        // Erreur silencieuse (non critique)
      }
    };

    // Envoyer immédiatement au chargement
    sendHeartbeat();

    // Puis toutes les 2 minutes (120000ms)
    const interval = setInterval(sendHeartbeat, 120000);

    return () => clearInterval(interval);
  }, [session]);

  return null; // Composant invisible
}
