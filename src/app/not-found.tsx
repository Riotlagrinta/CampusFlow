import type { Metadata } from 'next';
import Link from 'next/link';
import { Home, SearchX } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Page introuvable | DefiTech Student Hub',
};

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-6 px-4 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-600">
        <SearchX size={32} aria-hidden="true" />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-zinc-500">Erreur 404</p>
        <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
          Page introuvable
        </h1>
        <p className="text-sm font-medium leading-relaxed text-zinc-500 dark:text-zinc-400">
          Cette page n&apos;existe pas ou a été déplacée.
        </p>
      </div>

      <Link
        href="/"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-blue-700"
      >
        <Home size={16} aria-hidden="true" /> Retour à l&apos;accueil
      </Link>
    </div>
  );
}
