import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3 py-20"
    >
      <Loader2 className="animate-spin text-blue-600" size={36} aria-hidden="true" />
      <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Chargement...</p>
    </div>
  );
}
