'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Lock, ArrowRight, Loader2, CheckCircle2, Command } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSound } from '@/hooks/useSound';

export default function RegisterPage() {
  const router = useRouter();
  const { play } = useSound();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        setSuccess(true);
        play('success');
        setTimeout(() => {
          router.push('/');
        }, 2000);
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
          <h2 className="text-3xl font-bold">Bienvenue, {formData.firstName} !</h2>
          <p className="text-zinc-500">Votre compte a été créé avec succès. Redirection...</p>
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
