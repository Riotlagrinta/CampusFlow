'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight, Loader2, Command, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSound } from '@/hooks/useSound';
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const { play } = useSound();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await signIn("credentials", {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (result?.error) {
        setError('Identifiants incorrects');
      } else {
        play('success');
        // On garde encore l'utilisateur dans localStorage pour la compatibilité avec le reste du code existant
        // mais c'est désormais doublé par une session sécurisée
        const userRes = await fetch(`/api/user/stats?email=${formData.email}`);
        const userData = await userRes.json();
        localStorage.setItem('user', JSON.stringify(userData));
        
        router.push('/');
        router.refresh();
      }
    } catch (err) {
      setError('Impossible de contacter le serveur');
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
            <h1 className="text-3xl font-black tracking-tight">Content de vous revoir</h1>
            <p className="text-zinc-500 text-sm">Entrez vos identifiants pour accéder au Student Hub.</p>
          </div>
        </div>

        {/* Login Form */}
        <div className="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-xl space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-400 ml-1 tracking-widest">Email Académique</label>
              <div className="relative">
                <Mail className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                <input 
                  type="email" required
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                  placeholder="etudiant@defitech.tg"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Mot de passe</label>
                <Link href="#" className="text-[10px] font-bold text-blue-600 hover:underline uppercase tracking-widest">Oublié ?</Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-3.5 text-zinc-400" size={18} />
                <input 
                  type="password" required
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-500 font-bold text-center bg-red-50 dark:bg-red-900/20 py-2 rounded-lg border border-red-100 dark:border-red-900/30">
                {error}
              </p>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-4 bg-zinc-900 dark:bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-95 transition-all shadow-xl shadow-blue-500/10"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : 'Se connecter'}
              {!loading && <ArrowRight size={20} />}
            </button>
          </form>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-zinc-100 dark:border-zinc-800"></div>
            <span className="flex-shrink mx-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Sécurité Académique</span>
            <div className="flex-grow border-t border-zinc-100 dark:border-zinc-800"></div>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
             <ShieldCheck size={14} className="text-emerald-500" />
             <span>Connexion sécurisée par DEFITECH Auth</span>
          </div>
        </div>

        <p className="text-center text-sm text-zinc-500">
          Nouveau ici ? <Link href="/register" className="text-blue-600 font-bold hover:underline">Créer un compte</Link>
        </p>
      </motion.div>
    </div>
  );
}
