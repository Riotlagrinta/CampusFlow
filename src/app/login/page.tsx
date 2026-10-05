'use client';

import React, { useState, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, ArrowRight, Loader2, Command, ShieldCheck, KeyRound, CheckCircle2, ChevronLeft, Info } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSound } from '@/hooks/useSound';
import { signIn } from "next-auth/react";
import { safeRedirectPath } from '@/lib/safeRedirect';
import { loginReasonMessage } from '@/lib/loginReason';

type Mode = 'login' | 'forgot' | 'reset';

// Redirection après connexion : uniquement vers un chemin interne (pas de redirection ouverte).
// La validation (y compris « /.//hote » et « /%2e//hote », qui se résolvent en « //hote ») est dans
// safeRedirectPath ; repli sur « / ».
function getSafeRedirect(): string {
  const raw = new URLSearchParams(window.location.search).get('callbackUrl');
  return safeRedirectPath(raw, window.location.origin);
}

// ?reason=... (ex. session_expired après une déconnexion automatique) : message d'une liste blanche,
// jamais le texte de l'URL. useSyncExternalStore : rien n'est rendu côté serveur, puis le message
// apparaît côté client sans écart d'hydratation.
const subscribeNever = () => () => {};
const readSearch = () => window.location.search;
const readSearchOnServer = () => '';

export default function LoginPage() {
  const router = useRouter();
  const { play } = useSound();
  const search = useSyncExternalStore(subscribeNever, readSearch, readSearchOnServer);
  const reasonNotice = loginReasonMessage(new URLSearchParams(search).get('reason'));

  // États de base
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inactiveAccount, setInactiveAccount] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Formulaire Login (identifiant = email ou téléphone)
  const [formData, setFormData] = useState({
    identifier: '',
    password: ''
  });

  // Formulaire Reset
  const [resetData, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const switchMode = (next: Mode) => {
    setError('');
    setInactiveAccount(false);
    setSuccessMessage('');
    setMode(next);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInactiveAccount(false);
    setSuccessMessage('');

    try {
      const result = await signIn("credentials", {
        identifier: formData.identifier.trim(),
        password: formData.password,
        redirect: false,
      });

      if (result?.error) {
        if (result.code === 'account_inactive') {
          setInactiveAccount(true);
          setError('Compte non activé : le code de validation n\'a pas encore été saisi.');
        } else if (result.code === 'too_many_attempts') {
          setError('Trop de tentatives. Réessayez dans quelques minutes.');
        } else {
          setError('Identifiants incorrects.');
        }
      } else {
        play('success');
        router.push(getSafeRedirect());
        router.refresh();
      }
    } catch {
      setError('Impossible de contacter le serveur');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: formData.identifier.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setMode('reset');
        // Le serveur annonce les canaux réels d'envoi (email seul tant que WhatsApp n'est pas configuré).
        const notice = typeof data.message === 'string' && data.message
          ? data.message
          : 'Si ce compte existe, un code de sécurité vient d\'être envoyé par email.';
        setSuccessMessage(`${notice} Pensez à vérifier vos courriers indésirables (spams).`);
        play('xp');
      } else {
        setError(data.error || 'Une erreur est survenue');
      }
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: formData.identifier.trim(),
          code: resetData.trim(),
          newPassword
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setMode('login');
        setSuccessMessage('Mot de passe modifié avec succès ! Connectez-vous.');
        setFormData({ ...formData, password: '' });
        setResetCode('');
        setNewPassword('');
        play('success');
      } else {
        setError(data.error || 'Code incorrect ou expiré');
      }
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-8"
      >
        {/* Logo & Header */}
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-zinc-900 dark:bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto shadow-2xl">
             <Command size={32} className="text-white dark:text-zinc-900" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tight">
              {mode === 'login' ? 'Content de vous revoir' : mode === 'forgot' ? 'Mot de passe oublié' : 'Réinitialisation'}
            </h1>
            <p className="text-zinc-500 text-sm">
              {mode === 'login' ? 'Accédez à votre espace Student Hub.' : mode === 'forgot' ? 'Entrez votre email ou votre numéro de téléphone : un code sera envoyé à l\'email du compte.' : 'Créez votre nouveau mot de passe.'}
            </p>
          </div>
        </div>

        {/* Card Form */}
        <div className="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-xl space-y-6 relative overflow-hidden">

          <AnimatePresence mode="wait">
            {/* LOGIN MODE */}
            {mode === 'login' && (
              <motion.form
                key="login"
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                onSubmit={handleLogin} className="space-y-4"
              >
                <div className="space-y-2">
                  <label htmlFor="login-identifier" className="text-[10px] font-black uppercase text-zinc-400 ml-1 tracking-widest">Email ou téléphone</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                    <input
                      id="login-identifier" name="identifier" type="text" required
                      autoComplete="username" autoCapitalize="none" spellCheck={false}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                      placeholder="etudiant@defitech.tg ou 22890000000"
                      value={formData.identifier}
                      onChange={e => setFormData({...formData, identifier: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center ml-1">
                    <label htmlFor="login-password" className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Mot de passe</label>
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-[10px] font-bold text-blue-600 hover:underline uppercase tracking-widest"
                    >
                      Oublié ?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                    <input
                      id="login-password" name="password" type="password" required
                      autoComplete="current-password"
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={e => setFormData({...formData, password: e.target.value})}
                    />
                  </div>
                </div>

                <button
                  type="submit" disabled={loading}
                  className="w-full py-4 bg-zinc-900 dark:bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-95 transition-all shadow-xl shadow-blue-500/10 disabled:opacity-60"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : 'Se connecter'}
                  {!loading && <ArrowRight size={20} />}
                </button>
              </motion.form>
            )}

            {/* FORGOT MODE */}
            {mode === 'forgot' && (
              <motion.form
                key="forgot"
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                onSubmit={handleForgotPassword} className="space-y-4"
              >
                <button type="button" onClick={() => switchMode('login')} className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase mb-4 hover:text-zinc-600 transition-colors">
                  <ChevronLeft size={14} /> Retour à la connexion
                </button>
                <div className="space-y-2">
                  <label htmlFor="forgot-identifier" className="text-[10px] font-black uppercase text-zinc-400 ml-1 tracking-widest">Votre email ou téléphone</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                    <input
                      id="forgot-identifier" name="identifier" type="text" required
                      autoComplete="username" autoCapitalize="none" spellCheck={false}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                      placeholder="etudiant@defitech.tg ou 22890000000"
                      value={formData.identifier}
                      onChange={e => setFormData({...formData, identifier: e.target.value})}
                    />
                  </div>
                </div>
                <button
                  type="submit" disabled={loading}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 disabled:opacity-60"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : 'Envoyer le code'}
                </button>
              </motion.form>
            )}

            {/* RESET MODE */}
            {mode === 'reset' && (
              <motion.form
                key="reset"
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                onSubmit={handleResetPassword} className="space-y-4"
              >
                <button type="button" onClick={() => switchMode('forgot')} className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase mb-2 hover:text-zinc-600 transition-colors">
                  <ChevronLeft size={14} /> Changer d&apos;identifiant
                </button>
                <div className="space-y-2 text-center pb-2">
                   <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-2">
                      <KeyRound size={24} />
                   </div>
                   <p className="text-[10px] font-bold text-blue-600 uppercase break-words">Code envoyé pour {formData.identifier}</p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="reset-code" className="text-[10px] font-black uppercase text-zinc-400 ml-1 tracking-widest">Code de sécurité (6 chiffres)</label>
                  <input
                    id="reset-code" name="code" type="text" required maxLength={6}
                    inputMode="numeric" pattern="\d{6}" autoComplete="one-time-code"
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl px-4 py-3.5 text-center text-xl font-black tracking-[0.5em] outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="000000"
                    value={resetData}
                    onChange={e => setResetCode(e.target.value.replace(/\D/g, ''))}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="reset-password" className="text-[10px] font-black uppercase text-zinc-400 ml-1 tracking-widest">Nouveau mot de passe (8 caractères minimum)</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                    <input
                      id="reset-password" name="newPassword" type="password" required minLength={8}
                      autoComplete="new-password"
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="submit" disabled={loading}
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-500/20 disabled:opacity-60"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : 'Confirmer le changement'}
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Error & Success Alerts */}
          {error && (
            <motion.div role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-red-500 font-bold text-center bg-red-50 dark:bg-red-900/20 py-2 px-3 rounded-lg border border-red-100 dark:border-red-900/30 space-y-1">
              <p>{error}</p>
              {inactiveAccount && (
                <p>
                  <Link href="/register" className="underline">Reprenez l&apos;inscription</Link> avec les mêmes informations pour recevoir un nouveau code par email (pensez à vérifier vos courriers indésirables).
                </p>
              )}
            </motion.div>
          )}
          {successMessage && !error && (
            <motion.p role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-emerald-600 font-bold text-center bg-emerald-50 dark:bg-emerald-900/20 py-2 px-3 rounded-lg border border-emerald-100 dark:border-emerald-900/30 flex items-center justify-center gap-2">
              <CheckCircle2 size={14} className="shrink-0" /> {successMessage}
            </motion.p>
          )}

          {reasonNotice && mode === 'login' && !error && !successMessage && (
            <motion.p role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-zinc-600 dark:text-zinc-300 font-medium text-center bg-zinc-50 dark:bg-zinc-800/50 py-2 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 flex items-center justify-center gap-2">
              <Info size={14} className="shrink-0 text-blue-500" /> {reasonNotice}
            </motion.p>
          )}

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-zinc-100 dark:border-zinc-800"></div>
            <span className="flex-shrink mx-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Sécurité Académique</span>
            <div className="flex-grow border-t border-zinc-100 dark:border-zinc-800"></div>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
             <ShieldCheck size={14} className="text-emerald-500" />
             <span>Activation et récupération par code OTP</span>
          </div>
        </div>

        {mode === 'login' && (
          <p className="text-center text-sm text-zinc-500">
            Nouveau ici ? <Link href="/register" className="text-blue-600 font-bold hover:underline">Créer un compte</Link>
          </p>
        )}
      </motion.div>
    </div>
  );
}
