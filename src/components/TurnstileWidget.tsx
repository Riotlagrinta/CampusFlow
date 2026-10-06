'use client';

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';

// Widget anti-robot Cloudflare Turnstile. N'affiche rien tant que le défi est invisible
// (`interaction-only`) ; une case apparaît seulement si Cloudflare doute. Sans clé de site
// (NEXT_PUBLIC_TURNSTILE_SITE_KEY), le composant ne rend rien et `isCaptchaConfigured` est faux :
// les formulaires n'attendent alors aucun jeton.
//
// Un jeton ne sert QU'UNE FOIS (Cloudflare refuse un jeton déjà consommé) : après chaque envoi,
// réussi ou non, appeler `reset()` pour en obtenir un nouveau.

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export const isCaptchaConfigured = SITE_KEY.length > 0;

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export type TurnstileHandle = { reset: () => void };

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null; // permet de réessayer (bloqueur de publicités retiré, réseau revenu)
        reject(new Error('Chargement de Turnstile impossible'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

type Props = {
  /** Reçoit le jeton une fois le défi réussi ; null quand il expire, échoue ou est réinitialisé. */
  onToken: (token: string | null) => void;
  /** Étiquette d'analyse Cloudflare (ex. « register »), purement informative. */
  action?: string;
  ref?: Ref<TurnstileHandle>;
};

export function TurnstileWidget({ onToken, action, ref }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        onTokenRef.current(null);
        if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
      },
    }),
    []
  );

  useEffect(() => {
    if (!isCaptchaConfigured) return;
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(container.current, {
          sitekey: SITE_KEY,
          action,
          theme: 'auto',
          language: 'fr',
          appearance: 'interaction-only',
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [action]);

  if (!isCaptchaConfigured) return null;
  return <div ref={container} className="flex justify-center" />;
}

/** Texte d'aide sous un bouton désactivé tant que le jeton n'est pas arrivé. */
export const CAPTCHA_PENDING_HINT =
  "Vérification anti-robot en cours. Si ce message reste affiché, désactivez votre bloqueur de publicités pour ce site et rechargez la page.";
