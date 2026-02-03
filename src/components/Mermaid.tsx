'use client';

import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

// Configuration stricte pour éviter le scan automatique des éléments par Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: 'inherit',
});

interface MermaidProps {
  chart: string;
}

export default function Mermaid({ chart }: MermaidProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!ref.current || !chart) return;

    const renderChart = async () => {
      try {
        setError(false);
        const id = `graph-${Math.random().toString(36).substring(2, 11)}`;
        const { svg } = await mermaid.render(id, chart);
        if (ref.current) {
          ref.current.innerHTML = svg;
        }
      } catch (err) {
        console.error('Mermaid render error:', err);
        setError(true);
      }
    };

    renderChart();
  }, [chart]);

  if (error) {
    return (
      <div className="my-4 p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl">
        <p className="text-amber-500 text-[10px] italic font-medium">
          [ Schéma complexe ou syntaxe en cours d&apos;ajustement ]
        </p>
      </div>
    );
  }

  return (
    <div className="flex justify-center my-6 bg-zinc-900/50 p-6 rounded-2xl border border-white/5 shadow-2xl overflow-x-auto">
      <div ref={ref} id="mermaid-root" />
    </div>
  );
}
