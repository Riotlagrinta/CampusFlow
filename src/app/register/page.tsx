'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Lock, ArrowRight, Loader2, CheckCircle2, Command, BookOpen, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSound } from '@/hooks/useSound';

export default function RegisterPage() {
  const router = useRouter();
  const { play } = useSound();
  
  const [options, setOptions] = useState<{ fields: any[], levels: any[] }>({ fields: [], levels: [] });
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    fieldId: '',
    levelId: '',
    referralCode: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    fetch('/api/academic/options')
      .then(res => res.json())
      .then(data => setOptions(data));

    // Détecter le code de parrainage dans l'URL
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) {
        setFormData(prev => ({ ...prev, referralCode: ref }));
    }
  }, []);

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    setError('');

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, code: otpCode }),
      });

      if (res.ok) {
        setSuccess(true);
        play('success');
        setTimeout(() => router.push('/login'), 2000);
      } else {
        const data = await res.json();
        setError(data.error || 'Code invalide');
      }
    } catch (err) {
      setError('Erreur de validation');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fieldId || !formData.levelId) {
      setError('Veuillez choisir votre filière et votre niveau.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        setShowOTP(true);
        play('success');
      } else {
        setError(data.error || 'Une erreur est survenue');
      }
    } catch (err) {
      setError('Impossible de contacter le serveur');
    } finally {
      setLoading(false);
    }
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
  if (loading === false && formData.email && !success && otpCode !== 'DONE') {
     // Si on a déjà soumis mais pas encore validé
  }

  // Utilisons un état simple pour basculer vers l'écran OTP
  const [showOTP, setShowOTP] = useState(false);

  if (showOTP) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md space-y-8 text-center">
          <div className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-xl">
            <Mail size={32} />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tight">Vérifiez votre email</h1>
            <p className="text-zinc-500 text-sm">Nous avons envoyé un code de validation à <br /><span className="font-bold text-zinc-900 dark:text-zinc-100">{formData.email}</span></p>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-xl space-y-6">
            <form onSubmit={handleVerifyOTP} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Code de validation (6 chiffres)</label>
                <input 
                  type="text" required maxLength={6}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl px-4 py-4 text-center text-3xl font-black tracking-[1rem] outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="000000"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value)}
                />
              </div>
              {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
              <button 
                type="submit" 
                disabled={isVerifying}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg"
              >
                {isVerifying ? <Loader2 className="animate-spin" size={20} /> : 'Activer mon compte'}
              </button>
            </form>
            <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest">
              Pas reçu ? <button onClick={() => setShowOTP(false)} className="text-blue-600 hover:underline">Réessayer</button>
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

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
                <label className="text-xs font-bold uppercase text-zinc-500 ml-1">Prénom</label>
                <div className="relative">
                  <User className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                  <input 
                    type="text" required
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    placeholder="Jean"
                    value={formData.firstName}
                    onChange={e => setFormData({...formData, firstName: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-zinc-500 ml-1">Nom</label>
                <div className="relative">
                  <User className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                  <input 
                    type="text" required
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    placeholder="Dupont"
                    value={formData.lastName}
                    onChange={e => setFormData({...formData, lastName: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-zinc-500 ml-1">Email académique</label>
              <div className="relative">
                <Mail className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                <input 
                  type="email" required
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="etudiant@defitech.tg"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-zinc-500 ml-1">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                <input 
                  type="password" required
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-zinc-500 ml-1">Filière</label>
                <div className="relative">
                  <BookOpen className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                  <select 
                    required
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
                <label className="text-xs font-bold uppercase text-zinc-500 ml-1">Niveau</label>
                <div className="relative">
                  <GraduationCap className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                  <select 
                    required
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
              <label className="text-xs font-bold uppercase text-zinc-500 ml-1">Code de parrainage (Optionnel)</label>
              <div className="relative">
                <Star className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                <input 
                  type="text"
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm uppercase font-black tracking-widest"
                  placeholder="EX: ADM-PBF7"
                  value={formData.referralCode}
                  onChange={e => setFormData({...formData, referralCode: e.target.value.toUpperCase()})}
                />
              </div>
              <p className="text-[9px] text-blue-600 font-bold ml-1 uppercase tracking-tight">🎁 5 jetons IA offerts pour vous et votre parrain</p>
            </div>

            {error && (
              <p className="text-sm text-red-500 font-medium ml-1 flex items-center gap-2">
                • {error}
              </p>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-xl"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : 'Créer mon compte'}
              {!loading && <ArrowRight size={20} />}
            </button>
          </form>

          <p className="text-center text-sm text-zinc-500">
            Déjà inscrit ? <Link href="/" className="text-blue-600 font-bold hover:underline">Se connecter</Link>
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
