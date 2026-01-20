'use client';

import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: true,
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
      ref.current.removeAttribute('data-processed');
      mermaid.contentLoaded();
      
      // Rendu asynchrone pour éviter les erreurs de montage
      const renderChart = async () => {
        try {
          const { svg } = await mermaid.render(`mermaid-${Math.random().toString(36).substr(2, 9)}`, chart);
          if (ref.current) {
            ref.current.innerHTML = svg;
          }
        } catch (error) {
          console.error('Mermaid render error:', error);
          if (ref.current) {
            ref.current.innerHTML = '<div class="text-red-500 text-xs p-4 bg-red-500/10 rounded-xl">Erreur de rendu du diagramme. Vérifiez la syntaxe.</div>';
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
