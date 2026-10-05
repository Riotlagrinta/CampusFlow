'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Le détail reste dans la console ; l'utilisateur ne voit qu'une référence.
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-6 px-4 py-20 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-600">
        <AlertTriangle size={32} aria-hidden="true" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
          Une erreur est survenue
        </h1>
        <p className="text-sm font-medium leading-relaxed text-zinc-500 dark:text-zinc-400">
          Le chargement de cette page a échoué. Vous pouvez réessayer ou revenir à l&apos;accueil.
        </p>
        {error.digest && (
          <p className="text-xs text-zinc-500">Référence : {error.digest}</p>
        )}
      </div>

      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-blue-700"
        >
          <RotateCcw size={16} aria-hidden="true" /> Réessayer
        </button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-6 py-3 text-xs font-black uppercase tracking-widest text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          <Home size={16} aria-hidden="true" /> Accueil
        </Link>
      </div>
    </div>
  );
}
