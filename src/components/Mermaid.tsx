'use client';

import React from 'react';

interface MermaidProps {
  chart: string;
}

export default function Mermaid({ chart }: MermaidProps) {
  // Désactivation temporaire pour diagnostic
  return (
    <div className="my-4 p-4 bg-zinc-100 dark:bg-zinc-800 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Schéma IA (Désactivé pour maintenance)</p>
      <pre className="text-[9px] text-zinc-400 overflow-x-auto whitespace-pre-wrap">{chart}</pre>
    </div>
  );
}
