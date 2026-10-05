'use client';

import React, { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';

interface MermaidProps {
  chart: string;
}

type MermaidApi = typeof import('mermaid').default;
let mermaidPromise: Promise<MermaidApi> | null = null;

// Mermaid est chargé à la demande (bibliothèque lourde) puis initialisé une seule fois.
// securityLevel 'strict' : les balises HTML du texte sont encodées et les clics/scripts désactivés.
function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'strict',
        fontFamily: 'inherit',
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

// Le diagramme vient d'une sortie d'IA (donc non fiable) : le SVG est assaini avant injection.
// Le profil HTML est conservé en plus de svg et <foreignObject> est déclaré point d'intégration
// HTML : sans cela, DOMPurify viderait les libellés des nœuds (div/span dans <foreignObject>).
// Scripts, gestionnaires d'événements, iframes, formulaires et URL javascript: sont retirés.
function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ['foreignObject'],
    HTML_INTEGRATION_POINTS: { foreignobject: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'img', 'video', 'audio'],
    FORBID_ATTR: ['srcdoc'],
  });
}

export default function Mermaid({ chart }: MermaidProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!chart) return;
    let cancelled = false;

    const renderChart = async () => {
      try {
        setError(false);
        const mermaid = await loadMermaid();

        // parse() avec suppressErrors évite que mermaid laisse un SVG d'erreur dans le <body>.
        const valid = await mermaid.parse(chart, { suppressErrors: true });
        if (!valid) throw new Error('Syntaxe Mermaid invalide');

        const id = `graph-${Math.random().toString(36).substring(2, 11)}`;
        const { svg } = await mermaid.render(id, chart);
        if (cancelled || !ref.current) return;

        ref.current.innerHTML = sanitizeSvg(svg);
      } catch (err) {
        if (cancelled) return;
        console.error('Mermaid render error:', err instanceof Error ? err.message : err);
        setError(true);
      }
    };

    renderChart();
    return () => {
      cancelled = true;
    };
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
      <div ref={ref} />
    </div>
  );
}
