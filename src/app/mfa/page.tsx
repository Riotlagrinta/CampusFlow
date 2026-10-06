'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Copy, KeyRound, Loader2, Lock, LogOut, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { safeRedirectPath } from '@/lib/safeRedirect';

// Second facteur (TOTP) des administrateurs : saisie du code à chaque connexion, et activation la
// première fois. Tant qu'il n'est pas validé, le serveur traite l'administrateur comme un étudiant.

type Status = {
  mode: 'off' | 'on' | 'invalid';
  isAdmin: boolean;
  required: boolean;
  enrolled?: boolean;
};

type Phase = 'loading' | 'verify' | 'setup-password' | 'setup-code' | 'recovery' | 'invalid-config' | 'error';

// Destination après validation : chemin interne uniquement (pas de redirection ouverte), /admin par défaut.
function getNext(): string {
  const raw = new URLSearchParams(window.location.search).get('next');
  return raw ? safeRedirectPath(raw, window.location.origin) : '/admin';
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

function errorText(result: { status: number; data: Record<string, unknown> }, fallback: string): string {
  if (result.status === 429) return 'Trop de tentatives. Réessayez plus tard.';
  return typeof result.data.error === 'string' && result.data.error ? result.data.error : fallback;
}

const card = 'bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-xl space-y-6';
const input =
  'w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm';
const primaryButton =
  'w-full py-4 bg-zinc-900 dark:bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-95 transition-all shadow-xl shadow-blue-500/10 disabled:opacity-60';

export default function MfaPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/mfa/status', { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 401) {
          router.replace(`/login?callbackUrl=${encodeURIComponent('/mfa')}`);
          return;
        }
        const status = (await res.json()) as Status;
        if (cancelled) return;
        if (status.mode === 'invalid') {
          setPhase('invalid-config');
        } else if (!status.isAdmin) {
          router.replace('/'); // page réservée aux administrateurs
        } else if (status.mode === 'off' || !status.required) {
          window.location.assign(getNext());
        } else {
          setPhase(status.enrolled ? 'verify' : 'setup-password');
        }
      })
      .catch(() => {
        if (!cancelled) setPhase('error');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch {
      setError('Impossible de contacter le serveur.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const result = await postJson('/api/auth/mfa/verify', { code: code.trim() });
      if (result.ok) {
        window.location.assign(getNext());
        return;
      }
      setCode('');
      setError(errorText(result, 'Code incorrect.'));
    });
  };

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const result = await postJson('/api/auth/mfa/setup', { password });
      setPassword('');
      if (result.ok && typeof result.data.secret === 'string' && typeof result.data.otpauthUrl === 'string') {
        setSecret(result.data.secret);
        setOtpauthUrl(result.data.otpauthUrl);
        setCode('');
        setPhase('setup-code');
        return;
      }
      if (result.status === 409) {
        setPhase('verify'); // déjà activé : il ne reste qu'à saisir un code
        return;
      }
      setError(errorText(result, 'Impossible de démarrer l\'activation.'));
    });
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const result = await postJson('/api/auth/mfa/confirm', { code: code.trim() });
      if (result.ok && Array.isArray(result.data.recoveryCodes)) {
        setRecoveryCodes(result.data.recoveryCodes.filter((c): c is string => typeof c === 'string'));
        setSecret('');
        setOtpauthUrl('');
        setCode('');
        setPhase('recovery');
        return;
      }
      if (result.status === 409) {
        setPhase('setup-password'); // activation perdue : on recommence
        setError(errorText(result, 'Activation à recommencer.'));
        return;
      }
      setCode('');
      setError(errorText(result, 'Code incorrect.'));
    });
  };

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      setCopied(true);
    } catch {
      setError('Copie impossible : notez les codes à la main.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md space-y-8">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-2xl">
            <ShieldCheck size={32} />
          </div>
          <h1 className="text-3xl font-black tracking-tight">Double authentification</h1>
          <p className="text-zinc-500 text-sm">Espace administrateur : une vérification supplémentaire est requise.</p>
        </div>

        <div className={card}>
          {phase === 'loading' && (
            <div className="flex justify-center py-6" role="status" aria-label="Chargement">
              <Loader2 className="animate-spin text-zinc-400" size={28} />
            </div>
          )}

          {phase === 'error' && (
            <p role="alert" className="text-sm text-red-500 font-medium text-center">
              Impossible de vérifier l&apos;état de la double authentification. Rechargez la page.
            </p>
          )}

          {phase === 'invalid-config' && (
            <div role="alert" className="space-y-2 text-sm text-red-600">
              <p className="flex items-center gap-2 font-bold"><AlertTriangle size={18} /> Configuration serveur invalide</p>
              <p>
                La clé <span className="font-mono">MFA_ENCRYPTION_KEY</span> est absente ou mal formée (32 octets en base64 attendus)
                alors qu&apos;un second facteur est enregistré. Par sécurité, les droits d&apos;administration sont suspendus
                jusqu&apos;à sa correction dans Vercel.
              </p>
            </div>
          )}

          {phase === 'verify' && (
            <form onSubmit={handleVerify} method="post" className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="mfa-code" className="text-[10px] font-black uppercase text-zinc-400 ml-1 tracking-widest">
                  Code de l&apos;application (6 chiffres) ou code de secours
                </label>
                <input
                  id="mfa-code" name="code" type="text" required autoFocus maxLength={16}
                  autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false}
                  className={`${input} text-center text-xl font-black tracking-[0.3em]`}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <button type="submit" disabled={busy || code.trim().length < 6} className={primaryButton}>
                {busy ? <Loader2 className="animate-spin" size={20} /> : 'Valider'}
              </button>
              <p className="text-[11px] text-zinc-400 text-center">
                Téléphone perdu ? Saisissez un de vos codes de secours (usage unique).
              </p>
            </form>
          )}

          {phase === 'setup-password' && (
            <form onSubmit={handleStart} method="post" className="space-y-4">
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Les comptes administrateur doivent être protégés par une application d&apos;authentification
                (Google Authenticator, Microsoft Authenticator, Aegis, 1Password...). Confirmez votre mot de passe pour commencer.
              </p>
              <div className="space-y-2">
                <label htmlFor="mfa-password" className="text-[10px] font-black uppercase text-zinc-400 ml-1 tracking-widest">Mot de passe</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                  <input
                    id="mfa-password" name="password" type="password" required autoComplete="current-password"
                    className={`${input} pl-12`}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
              <button type="submit" disabled={busy || password.length === 0} className={primaryButton}>
                {busy ? <Loader2 className="animate-spin" size={20} /> : 'Commencer'}
              </button>
            </form>
          )}

          {phase === 'setup-code' && (
            <form onSubmit={handleConfirm} method="post" className="space-y-4">
              <ol className="list-decimal pl-5 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
                <li>Dans votre application, ajoutez un compte par <strong>saisie manuelle</strong> (type : basé sur l&apos;heure).</li>
                <li>
                  Clé secrète :
                  <span className="block mt-1 font-mono text-base font-bold tracking-wider break-all text-zinc-900 dark:text-zinc-100 select-all">
                    {secret}
                  </span>
                </li>
                <li>Saisissez ci-dessous le code à 6 chiffres affiché par l&apos;application.</li>
              </ol>
              <p className="text-[11px] text-zinc-400">
                Sur le téléphone qui a l&apos;application ?{' '}
                {otpauthUrl.startsWith('otpauth://') && (
                  <a href={otpauthUrl} className="text-blue-600 underline">Ouvrir directement</a>
                )}
                .
                Cette clé ne sera plus jamais affichée.
              </p>
              <div className="space-y-2">
                <label htmlFor="mfa-confirm" className="text-[10px] font-black uppercase text-zinc-400 ml-1 tracking-widest">Code à 6 chiffres</label>
                <input
                  id="mfa-confirm" name="code" type="text" required autoFocus maxLength={7}
                  inputMode="numeric" autoComplete="one-time-code"
                  className={`${input} text-center text-xl font-black tracking-[0.5em]`}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
                />
              </div>
              <button type="submit" disabled={busy || code.replace(/\s/g, '').length !== 6} className={primaryButton}>
                {busy ? <Loader2 className="animate-spin" size={20} /> : 'Activer'}
              </button>
            </form>
          )}

          {phase === 'recovery' && (
            <div className="space-y-4">
              <p className="flex items-center gap-2 text-sm font-bold text-emerald-600">
                <CheckCircle2 size={18} /> Double authentification activée
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Voici vos <strong>codes de secours</strong>. Chacun ne sert qu&apos;une fois et remplace le code de l&apos;application
                si vous perdez votre téléphone. <strong>Ils ne seront plus jamais affichés.</strong> Conservez-les hors de ce téléphone
                (gestionnaire de mots de passe, papier).
              </p>
              <ul className="grid grid-cols-2 gap-2 font-mono text-sm font-bold bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-4 select-all">
                {recoveryCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <button type="button" onClick={copyCodes} className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:underline">
                <Copy size={14} /> {copied ? 'Codes copiés' : 'Copier les codes'}
              </button>
              <label className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                <input type="checkbox" className="mt-1" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
                J&apos;ai conservé mes codes de secours en lieu sûr.
              </label>
              <button type="button" disabled={!saved} onClick={() => window.location.assign(getNext())} className={primaryButton}>
                Continuer <KeyRound size={18} />
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs text-red-500 font-bold text-center bg-red-50 dark:bg-red-900/20 py-2 px-3 rounded-lg border border-red-100 dark:border-red-900/30">
              {error}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="mx-auto flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-zinc-600 transition-colors"
        >
          <LogOut size={14} /> Se déconnecter
        </button>
      </motion.div>
    </div>
  );
}
