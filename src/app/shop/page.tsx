"use client";

import React, { useState } from 'react';
import { redirect, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Sparkles, Zap, ShieldCheck, CreditCard, Loader2, ArrowRight, CheckCircle2, MessageCircle } from 'lucide-react';
import { useSound } from '@/hooks/useSound';
import { TiltCard } from '@/components/TiltCard';
import { TOPUP_PACKS, formatPrice } from '@/lib/packs';
import { isPaymentsEnabled } from '@/lib/payments';

// Contenu (nom, prix, jetons) : source unique dans @/lib/packs. Ici, seulement l'apparence.
const PACK_COLORS: Record<string, string> = {
  starter: 'from-blue-500 to-cyan-400',
  pro: 'from-purple-600 to-blue-500',
  master: 'from-amber-500 to-orange-400',
};
const DEFAULT_COLOR = 'from-blue-500 to-cyan-400';

const fadeUp = (delay = 0) => ({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay, type: 'spring' as const, stiffness: 80 } });

function ShopContent() {
  const router = useRouter();
  const { play } = useSound();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleBuy = (packId: string) => {
    setLoadingId(packId);
    play('xp');
    router.push(`/shop/checkout?packId=${packId}`);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#050505] pt-20 pb-20 px-4 overflow-x-hidden">
      <div className="max-w-5xl mx-auto space-y-16">

        {/* Ambient blobs */}
        <motion.div className="fixed top-20 left-1/3 w-96 h-96 bg-blue-600/5 rounded-full blur-[150px] -z-10 pointer-events-none"
          animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 7, repeat: Infinity }} />
        <motion.div className="fixed bottom-20 right-1/4 w-80 h-80 bg-purple-500/5 rounded-full blur-[120px] -z-10 pointer-events-none"
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 9, repeat: Infinity, delay: 2 }} />

        {/* Hero */}
        <div className="text-center space-y-4">
          <motion.div {...fadeUp()} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-600 rounded-full text-xs font-black uppercase tracking-[0.2em]">
            <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 1 }}>
              <Sparkles size={14} />
            </motion.div>
            Boutique de Jetons IA
          </motion.div>
          <motion.h1 {...fadeUp(0.1)} className="text-4xl md:text-6xl font-black tracking-tight text-zinc-900 dark:text-white">
            Libérez la puissance de l&apos;IA <br /> pour vos études
          </motion.h1>
          <motion.p {...fadeUp(0.2)} className="text-zinc-500 max-w-xl mx-auto text-sm md:text-base font-medium">
            Rechargez vos jetons en un clic via <span className="text-zinc-900 dark:text-white font-bold">T-Money</span> ou <span className="text-zinc-900 dark:text-white font-bold">Flooz</span>.
          </motion.p>
        </div>

        {/* Packs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {TOPUP_PACKS.map((pack, index) => (
            <motion.div key={pack.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * index, type: 'spring', stiffness: 80 }}>
              <TiltCard>
                <motion.div
                  whileHover={{ y: -6 }}
                  className={`relative bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 border-2 ${pack.popular ? 'border-blue-500 shadow-2xl shadow-blue-500/10' : 'border-zinc-100 dark:border-zinc-800'} flex flex-col h-full`}
                >
                  {pack.popular && (
                    <motion.div
                      initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 + index * 0.1, type: 'spring' }}
                      className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-500 text-white px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest"
                    >
                      Recommandé
                    </motion.div>
                  )}

                  <motion.div
                    whileHover={{ rotate: 10, scale: 1.1 }}
                    className={`w-14 h-14 bg-gradient-to-br ${PACK_COLORS[pack.id] ?? DEFAULT_COLOR} rounded-2xl flex items-center justify-center text-white shadow-lg mb-6`}
                  >
                    {pack.id === 'starter' ? <Zap /> : pack.id === 'pro' ? <MessageCircle /> : <Sparkles />}
                  </motion.div>

                  <h3 className="text-xl font-black text-zinc-900 dark:text-white mb-2">{pack.name}</h3>
                  <p className="text-sm text-zinc-500 font-medium mb-8">{pack.description}</p>

                  <div className="mb-8">
                    <div className="flex items-baseline gap-1 text-zinc-900 dark:text-white">
                      <motion.span
                        className="text-4xl font-black tracking-tight"
                        initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 + index * 0.1, type: 'spring' }}
                      >
                        {formatPrice(pack.price)}
                      </motion.span>
                      <span className="text-sm font-bold uppercase">FCFA</span>
                    </div>
                    <div className="text-blue-600 dark:text-blue-400 font-black text-2xl mt-2">
                      {formatPrice(pack.tokens)} <span className="text-xs uppercase tracking-widest">Jetons</span>
                    </div>
                  </div>

                  <div className="space-y-4 mb-8 flex-1">
                    {['Recherches Google incluses', 'Analyse de PDF', "Pas de date d'expiration"].map((feat, i) => (
                      <div key={i} className="flex items-center gap-3 text-xs font-bold text-zinc-600 dark:text-zinc-400">
                        <CheckCircle2 size={16} className="text-emerald-500" /> {feat}
                      </div>
                    ))}
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={() => handleBuy(pack.id)}
                    disabled={loadingId !== null}
                    className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${pack.popular
                      ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-xl shadow-blue-500/20'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {loadingId === pack.id ? <Loader2 className="animate-spin" size={18} /> : <>Acheter maintenant <ArrowRight size={16} /></>}
                  </motion.button>
                </motion.div>
              </TiltCard>
            </motion.div>
          ))}
        </div>

        {/* Security Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { icon: ShieldCheck, title: 'Paiement Sécurisé', desc: 'Vos transactions sont protégées par un cryptage bancaire de haute sécurité.', color: 'emerald' },
            { icon: CreditCard, title: 'Opérateurs Locaux', desc: 'Payez facilement avec votre compte T-Money ou Flooz sans carte bancaire.', color: 'blue' },
          ].map((item, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 + i * 0.1 }}>
              <TiltCard className="flex items-start gap-4 p-6 bg-zinc-100 dark:bg-zinc-900/50 rounded-3xl border border-zinc-200 dark:border-zinc-800 cursor-default">
                <motion.div whileHover={{ rotate: 10 }} className={`p-3 ${item.color === 'emerald' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'} rounded-xl`}>
                  <item.icon />
                </motion.div>
                <div>
                  <h4 className="font-bold text-zinc-900 dark:text-white">{item.title}</h4>
                  <p className="text-xs text-zinc-500 font-medium">{item.desc}</p>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>

      </div>
    </div>
  );
}

export default function ShopPage() {
  // Paiements désactivés (freemium) : la page n'existe pas. Le proxy redirige déjà vers « / » ;
  // ceci est le filet de sécurité si la page est atteinte autrement.
  if (!isPaymentsEnabled()) redirect('/');
  return <ShopContent />;
}
