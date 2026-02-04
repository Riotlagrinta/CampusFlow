"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Zap, ShieldCheck, CreditCard, Loader2, ArrowRight, CheckCircle2, MessageCircle } from 'lucide-react';
import { useSound } from '@/hooks/useSound';

const PACKS = [
  {
    id: 'starter',
    name: 'Pack Découverte',
    tokens: 50,
    price: 500,
    description: 'Parfait pour un devoir rapide.',
    color: 'from-blue-500 to-cyan-400',
    popular: false
  },
  {
    id: 'pro',
    name: 'Pack Révision',
    tokens: 150,
    price: 1000,
    description: 'Idéal pour préparer un examen.',
    color: 'from-purple-600 to-blue-500',
    popular: true
  },
  {
    id: 'master',
    name: 'Pack Master',
    tokens: 500,
    price: 2000,
    description: 'Accès illimité pour tout le semestre.',
    color: 'from-amber-500 to-orange-400',
    popular: false
  }
];

export default function ShopPage() {
  const { play } = useSound();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleBuy = (packId: string) => {
    play('xp');
    window.location.href = `/shop/checkout?packId=${packId}`;
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#050505] pt-20 pb-20 px-4">
      <div className="max-w-5xl mx-auto space-y-16">
        
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-600 rounded-full text-xs font-black uppercase tracking-[0.2em]"
          >
            <Sparkles size={14} /> Boutique de Jetons IA
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="text-4xl md:text-6xl font-black tracking-tight text-zinc-900 dark:text-white"
          >
            Libérez la puissance de l'IA <br/> pour vos études
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="text-zinc-500 max-w-xl mx-auto text-sm md:text-base font-medium"
          >
            Rechargez vos jetons en un clic via <span className="text-zinc-900 dark:text-white font-bold">T-Money</span> ou <span className="text-zinc-900 dark:text-white font-bold">Flooz</span> et accédez à l'assistant le plus intelligent du Togo.
          </motion.p>
        </div>

        {/* Packs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {PACKS.map((pack, index) => (
            <motion.div
              key={pack.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * index }}
              className={`relative bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 border-2 ${pack.popular ? 'border-blue-500 shadow-2xl shadow-blue-500/10' : 'border-zinc-100 dark:border-zinc-800'} flex flex-col`}
            >
              {pack.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-500 text-white px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                  Recommandé
                </div>
              )}

              <div className={`w-14 h-14 bg-gradient-to-br ${pack.color} rounded-2xl flex items-center justify-center text-white shadow-lg mb-6`}>
                {pack.id === 'starter' ? <Zap /> : pack.id === 'pro' ? <MessageCircle /> : <Sparkles />}
              </div>

              <h3 className="text-xl font-black text-zinc-900 dark:text-white mb-2">{pack.name}</h3>
              <p className="text-sm text-zinc-500 font-medium mb-8">{pack.description}</p>

              <div className="mb-8">
                <div className="flex items-baseline gap-1 text-zinc-900 dark:text-white">
                  <span className="text-4xl font-black tracking-tight">{pack.price}</span>
                  <span className="text-sm font-bold uppercase">FCFA</span>
                </div>
                <div className="text-blue-600 dark:text-blue-400 font-black text-2xl mt-2">
                  {pack.tokens} <span className="text-xs uppercase tracking-widest">Jetons</span>
                </div>
              </div>

              <div className="space-y-4 mb-8 flex-1">
                <div className="flex items-center gap-3 text-xs font-bold text-zinc-600 dark:text-zinc-400">
                  <CheckCircle2 size={16} className="text-emerald-500" /> Recherches Google incluses
                </div>
                <div className="flex items-center gap-3 text-xs font-bold text-zinc-600 dark:text-zinc-400">
                  <CheckCircle2 size={16} className="text-emerald-500" /> Analyse de PDF
                </div>
                <div className="flex items-center gap-3 text-xs font-bold text-zinc-600 dark:text-zinc-400">
                  <CheckCircle2 size={16} className="text-emerald-500" /> Pas de date d'expiration
                </div>
              </div>

              <button
                onClick={() => handleBuy(pack.id)}
                disabled={loadingId !== null}
                className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                  pack.popular 
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-xl shadow-blue-500/20' 
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                {loadingId === pack.id ? <Loader2 className="animate-spin" size={18} /> : <>Acheter maintenant <ArrowRight size={16} /></>}
              </button>
            </motion.div>
          ))}
        </div>

        {/* Security Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-start gap-4 p-6 bg-zinc-100 dark:bg-zinc-900/50 rounded-3xl border border-zinc-200 dark:border-zinc-800">
            <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl"><ShieldCheck /></div>
            <div>
              <h4 className="font-bold text-zinc-900 dark:text-white">Paiement Sécurisé</h4>
              <p className="text-xs text-zinc-500 font-medium">Vos transactions sont protégées par le cryptage bancaire de FedaPay.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 p-6 bg-zinc-100 dark:bg-zinc-900/50 rounded-3xl border border-zinc-200 dark:border-zinc-800">
            <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl"><CreditCard /></div>
            <div>
              <h4 className="font-bold text-zinc-900 dark:text-white">Opérateurs Locaux</h4>
              <p className="text-xs text-zinc-500 font-medium">Payez facilement avec votre compte T-Money ou Flooz sans carte bancaire.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
