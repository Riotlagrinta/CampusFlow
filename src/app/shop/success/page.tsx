"use client";

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Sparkles, ArrowRight, MessageSquare } from 'lucide-react';
import { useSound } from '@/hooks/useSound';
import Link from 'next/link';

export default function PaymentSuccessPage() {
  const { play } = useSound();

  useEffect(() => {
    play('success');
  }, []);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-8">
        
        {/* Animated Icon */}
        <div className="relative inline-block">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="w-24 h-24 bg-emerald-500 rounded-[2rem] flex items-center justify-center text-white shadow-2xl shadow-emerald-500/20 relative z-10"
          >
            <CheckCircle2 size={48} strokeWidth={3} />
          </motion.div>
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.2, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 bg-emerald-500/30 blur-2xl rounded-full"
          />
        </div>

        {/* Text Content */}
        <div className="space-y-3">
          <motion.h1 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white"
          >
            Paiement Réussi !
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-zinc-500 font-medium"
          >
            Vos jetons IA ont été crédités sur votre compte. Vous pouvez maintenant continuer vos recherches.
          </motion.p>
        </div>

        {/* Action Buttons */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col gap-3 pt-4"
        >
          <Link 
            href="/ai-assistant"
            className="w-full py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl hover:opacity-90 transition-all"
          >
            <MessageSquare size={18} /> Tester l'IA maintenant <ArrowRight size={16} />
          </Link>
          
          <Link 
            href="/shop"
            className="w-full py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
          >
            Retour à la boutique
          </Link>
        </motion.div>

        {/* XP Bonus Tip */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-600"
        >
          <Sparkles size={14} /> Astuce : Gagnez de l'XP en posant des questions pertinentes
        </motion.div>

      </div>
    </div>
  );
}
