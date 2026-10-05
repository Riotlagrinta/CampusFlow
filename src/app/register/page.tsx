'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Lock, ArrowRight, Loader2, CheckCircle2, Command, BookOpen, GraduationCap, Star, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSound } from '@/hooks/useSound';

export default function RegisterPage() {
  const router = useRouter();
  const { play } = useSound();

  const [options, setOptions] = useState<{ fields: { id: string; name: string }[], levels: { id: string; name: string }[] }>({ fields: [], levels: [] });
  const [showOTP, setShowOTP] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '', // Ajout du champ téléphone
    password: '',
    fieldId: '',
    levelId: '',
    referralCode: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  // Message du serveur sur les canaux réels d'envoi du code (email seul tant que WhatsApp n'est pas configuré).
  const [deliveryNotice, setDeliveryNotice] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    fetch('/api/academic/options')
      .then(res => {
        if (!res.ok) throw new Error('options');
        return res.json();
      })
      .then(data => setOptions({
        fields: Array.isArray(data?.fields) ? data.fields : [],
        levels: Array.isArray(data?.levels) ? data.levels : [],
      }))
      .catch(() => setError('Impossible de charger les filières et les niveaux. Rechargez la page.'));

    // Détecter le code de parrainage dans l'URL
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) {
        setFormData(prev => ({ ...prev, referralCode: ref.toUpperCase() }));
    }
  }, []);

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    setError('');
    setInfo('');

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: formData.email.trim(), code: otpCode }),
      });

      if (res.ok) {
        setSuccess(true);
        play('success');
        setTimeout(() => router.push('/login'), 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Code invalide');
      }
    } catch {
      setError('Erreur de validation');
    } finally {
      setIsVerifying(false);
    }
  };

  // Envoie (ou renvoie) le code : le serveur réémet un code pour une préinscription non activée.
  const submitRegistration = async (): Promise<boolean> => {
    setError('');
    setInfo('');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setDeliveryNotice(typeof data.message === 'string' ? data.message : '');
        play('success');
        return true;
      }
      setError(data.error || 'Une erreur est survenue');
    } catch {
      setError('Impossible de contacter le serveur');
    }
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fieldId || !formData.levelId) {
      setError('Veuillez choisir votre filière et votre niveau.');
      return;
    }
    if (formData.password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    setLoading(true);
    const ok = await submitRegistration();
    setLoading(false);
    if (ok) {
      setOtpCode('');
      setShowOTP(true);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    const ok = await submitRegistration();
    setIsResending(false);
    if (ok) setInfo('Un nouveau code vient d\'être envoyé.');
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center space-y-4"
        >
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-3xl font-bold text-zinc-900 dark:text-white">Compte activé !</h2>
          <p className="text-zinc-500">Bienvenue dans la communauté DEFITECH. Redirection vers la connexion...</p>
        </motion.div>
      </div>
    );
  }

  // --- Étape Validation OTP ---
  if (showOTP) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md space-y-8 text-center">
          <div className="w-16 h-16 bg-emerald-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-xl">
            <Mail size={32} />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tight">Vérifiez vos emails</h1>
            <p className="text-zinc-500 text-sm">
              {deliveryNotice || 'Un code de validation vient de vous être envoyé par email.'}<br />
              Destinataire : <span className="font-bold text-zinc-900 dark:text-zinc-100 break-all">{formData.email}</span>
            </p>
            <p className="text-zinc-500 text-sm">
              Pensez à vérifier vos courriers indésirables (spams).
            </p>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-xl space-y-6">
            <form onSubmit={handleVerifyOTP} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="otp-code" className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Code de validation (6 chiffres)</label>
                <input
                  id="otp-code" name="code" type="text" required maxLength={6}
                  inputMode="numeric" pattern="\d{6}" autoComplete="one-time-code"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl px-4 py-4 text-center text-3xl font-black tracking-[1rem] outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="000000"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              {error && <p role="alert" className="text-xs text-red-500 font-bold">{error}</p>}
              {info && !error && <p role="status" className="text-xs text-emerald-600 font-bold">{info}</p>}
              <button
                type="submit"
                disabled={isVerifying}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg disabled:opacity-60"
              >
                {isVerifying ? <Loader2 className="animate-spin" size={20} /> : 'Activer mon compte'}
              </button>
            </form>
            <div className="flex flex-col items-center gap-2 text-[10px] text-zinc-400 uppercase font-bold tracking-widest">
              <p>
                Pas reçu ?{' '}
                <button type="button" onClick={handleResend} disabled={isResending} className="text-blue-600 hover:underline disabled:opacity-50">
                  {isResending ? 'Envoi...' : 'Renvoyer le code'}
                </button>
              </p>
              <button type="button" onClick={() => { setShowOTP(false); setError(''); setInfo(''); }} className="hover:underline">
                Modifier mes informations
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Rendu normal du formulaire d'inscription
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left side: Form */}
      <div className="flex items-center justify-center p-8 bg-white dark:bg-zinc-950">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2">
            <div className="w-12 h-12 bg-zinc-900 dark:bg-zinc-100 rounded-xl flex items-center justify-center mb-6">
              <Command size={24} className="text-white dark:text-zinc-900" />
            </div>
            <h1 className="text-4xl font-black tracking-tight">Créer un compte</h1>
            <p className="text-zinc-500">Rejoignez la communauté Génie Logiciel de DEFITECH.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="reg-firstName" className="text-xs font-bold uppercase text-zinc-500 ml-1">Prénom</label>
                <div className="relative">
                  <User className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                  <input
                    id="reg-firstName" name="firstName" type="text" required maxLength={50}
                    autoComplete="given-name"
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    placeholder="Jean"
                    value={formData.firstName}
                    onChange={e => setFormData({...formData, firstName: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="reg-lastName" className="text-xs font-bold uppercase text-zinc-500 ml-1">Nom</label>
                <div className="relative">
                  <User className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                  <input
                    id="reg-lastName" name="lastName" type="text" required maxLength={50}
                    autoComplete="family-name"
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    placeholder="Dupont"
                    value={formData.lastName}
                    onChange={e => setFormData({...formData, lastName: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="reg-email" className="text-xs font-bold uppercase text-zinc-500 ml-1">Email académique</label>
              <div className="relative">
                <Mail className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                <input
                  id="reg-email" name="email" type="email" required maxLength={254}
                  autoComplete="email"
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="etudiant@defitech.tg"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>
              <p className="text-[9px] text-zinc-400 ml-1">Le code de validation sera envoyé à cette adresse : utilisez une adresse que vous consultez.</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="reg-phone" className="text-xs font-bold uppercase text-zinc-500 ml-1">Numéro de téléphone (avec indicatif pays)</label>
              <div className="relative">
                <Smartphone className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                <input
                  id="reg-phone" name="phone" type="tel" required
                  autoComplete="tel"
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="22890000000"
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                />
              </div>
              <p className="text-[9px] text-zinc-400 ml-1">Ce numéro sert d&apos;identifiant de connexion et doit être unique.</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="reg-password" className="text-xs font-bold uppercase text-zinc-500 ml-1">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                <input
                  id="reg-password" name="password" type="password" required minLength={8} maxLength={72}
                  autoComplete="new-password"
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                />
              </div>
              <p className="text-[9px] text-zinc-400 ml-1">8 caractères minimum.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="reg-field" className="text-xs font-bold uppercase text-zinc-500 ml-1">Filière</label>
                <div className="relative">
                  <BookOpen className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                  <select
                    id="reg-field" name="fieldId" required
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm appearance-none"
                    value={formData.fieldId}
                    onChange={e => setFormData({...formData, fieldId: e.target.value})}
                  >
                    <option value="">Choisir...</option>
                    {options.fields.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="reg-level" className="text-xs font-bold uppercase text-zinc-500 ml-1">Niveau</label>
                <div className="relative">
                  <GraduationCap className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                  <select
                    id="reg-level" name="levelId" required
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm appearance-none"
                    value={formData.levelId}
                    onChange={e => setFormData({...formData, levelId: e.target.value})}
                  >
                    <option value="">Choisir...</option>
                    {options.levels.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="reg-referral" className="text-xs font-bold uppercase text-zinc-500 ml-1">Code de parrainage (Optionnel)</label>
              <div className="relative">
                <Star className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                <input
                  id="reg-referral" name="referralCode" type="text" maxLength={32} autoComplete="off"
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm uppercase font-black tracking-widest"
                  placeholder="EX: ADM-PBF7"
                  value={formData.referralCode}
                  onChange={e => setFormData({...formData, referralCode: e.target.value.toUpperCase()})}
                />
              </div>
              <p className="text-[9px] text-blue-600 font-bold ml-1 uppercase tracking-tight">🎁 5 jetons IA offerts à vous et à votre parrain dès l&apos;activation de votre compte</p>
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-500 font-medium ml-1 flex items-center gap-2">
                • {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-xl disabled:opacity-60"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : 'Créer mon compte'}
              {!loading && <ArrowRight size={20} />}
            </button>

            <p className="text-[10px] text-center text-zinc-400 mt-4 leading-relaxed px-4">
              En cliquant sur &quot;Créer mon compte&quot;, vous acceptez notre <Link href="/legal" className="text-blue-600 font-bold hover:underline">Clause de Confidentialité</Link> et le traitement de vos données académiques par Kelvix.
            </p>
          </form>

          <p className="text-center text-sm text-zinc-500">
            Déjà inscrit ? <Link href="/login" className="text-blue-600 font-bold hover:underline">Se connecter</Link>
          </p>
        </div>
      </div>

      {/* Right side: Visual */}
      <div className="hidden lg:flex flex-col justify-center p-20 bg-zinc-900 text-white relative overflow-hidden">
        <div className="relative z-10 space-y-6">
          <span className="px-3 py-1 bg-blue-500 text-[10px] font-black uppercase tracking-[0.3em] rounded">Promotion 2026</span>
          <h2 className="text-6xl font-black leading-tight tracking-tighter">
            Préparez votre avenir <br /> en Génie Logiciel.
          </h2>
          <p className="text-zinc-400 text-lg max-w-md">
            Une plateforme unique pour centraliser vos cours, vos projets et votre progression académique.
          </p>
        </div>
        <div className="absolute top-0 right-0 w-full h-full opacity-10 pointer-events-none">
          {/* Pattern de fond ou image abstraite */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600" />
        </div>
      </div>
    </div>
  );
}
