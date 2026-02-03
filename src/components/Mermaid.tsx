'use client';

import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

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

  useEffect(() => {
    if (ref.current && chart) {
      const renderChart = async () => {
        try {
          // Nettoyage complet avant nouveau rendu
          ref.current!.innerHTML = '';
          const id = `mermaid-${Math.random().toString(36).substring(2, 11)}`;
          const { svg } = await mermaid.render(id, chart);
          if (ref.current) {
            ref.current.innerHTML = svg;
          }
        } catch (error) {
          console.error('Mermaid render error:', error);
          if (ref.current) {
            ref.current.innerHTML = '<div class="text-amber-500 text-[10px] p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl italic">Schéma complexe en cours de génération ou erreur de syntaxe.</div>';
          }
        }
      };

      renderChart();
    }
  }, [chart]);

  return (
    <div className="flex justify-center my-6 bg-zinc-900/50 p-6 rounded-2xl border border-white/5 shadow-2xl overflow-x-auto">
      <div ref={ref} className="mermaid" />
    </div>
  );
}
