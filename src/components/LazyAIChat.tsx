'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

// Le widget IA embarque markdown, coloration syntaxique et mermaid : on le charge
// à part, hors du bundle initial (`ssr: false` n'est permis que depuis un composant client).
const AIChat = dynamic(() => import('@/components/AIChat'), { ssr: false });

// La page /ai-assistant est déjà un assistant plein écran : pas de second widget par-dessus.
const HIDDEN_ON = ['/ai-assistant'];

export default function LazyAIChat() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  // On attend que la page soit interactive pour ne pas concurrencer son premier affichage.
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setReady(true), 1200);
    return () => window.clearTimeout(id);
  }, []);

  if (!ready) return null;
  if (pathname && HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  return <AIChat />;
}
