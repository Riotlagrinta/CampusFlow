"use client";

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Smartphone,
  CheckCircle2,
  MessageCircle,
  Copy,
  Info,
  Loader2,
  Send
} from 'lucide-react';
import { useSound } from '@/hooks/useSound';

const PACKS: Record<string, { name: string, price: number, tokens: number }> = {
  'starter': { name: 'Pack Découverte', price: 500, tokens: 50 },
  'pro': { name: 'Pack Révision', price: 1000, tokens: 150 },
  'master': { name: 'Pack Master', price: 2000, tokens: 500 }
};

// --- CONFIGURATION ADMIN ---
const ADMIN_PHONE = "+22871796050"; // Votre WhatsApp Business
const TMONEY_NUMBER = "71796050";
const FLOOZ_NUMBER = "79683081";

import { useSession } from 'next-auth/react';
import { createGeniusPayment } from '@/lib/actions/payment';

export default function CheckoutPage() {
  const { data: session } = useSession();
  const { play } = useSound();
  const searchParams = useSearchParams();
  const packId = searchParams.get('packId') || 'starter';
  const pack = PACKS[packId] || PACKS.starter;

  const [method, setMethod] = useState<'TMONEY' | 'FLOOZ' | 'GENIUS' | null>(null);
  const [isCopied, setIsFresh] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsFresh(true);
    play('xp');
    setTimeout(() => setIsFresh(false), 2000);
  };

  const handleGeniusPay = async (selectedMethod?: string) => {
    if (!session?.user?.email) {
      window.location.href = '/login';
      return;
    }
    setIsLoading(true);
    try {
      const data = await createGeniusPayment(packId);
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Erreur lors de l'initialisation du paiement.");
      }
    } catch (e) {
      console.error(e);
      alert("Erreur de connexion au serveur de paiement.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleNotifyAdmin = async () => {
    setIsLoading(true);

    // 1. Enregistrer l'intention en base de données
    try {
      await fetch('/api/payment/manual-request', {
        method: 'POST',
        body: JSON.stringify({ packId, method })
      });
    } catch (e) { }

    // 2. Ouvrir WhatsApp
    const message = `Bonjour Admin ! Je viens d'effectuer un transfert de ${pack.price} FCFA par ${method} pour le ${pack.name}. Voici ma preuve de paiement (capture d'écran) :`;
    const whatsappUrl = `https://wa.me/${ADMIN_PHONE.replace(/\s/g, '')}?text=${encodeURIComponent(message)}`;

    window.open(whatsappUrl, '_blank');
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#050505] pt-10 pb-20 px-4 text-zinc-900 dark:text-white">
      <div className="max-w-2xl mx-auto space-y-8">

        <button
          onClick={() => window.location.href = '/shop'}
          className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors font-bold text-sm"
        >
          <ArrowLeft size={18} /> Retour à la boutique
        </button>

        <div className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight">Finaliser votre achat</h1>
          <p className="text-zinc-500 font-medium">Suivez les instructions pour activer vos jetons.</p>
        </div>

        {/* Recap Pack */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Pack sélectionné</p>
            <h3 className="text-xl font-bold">{pack.name}</h3>
            <p className="text-sm text-zinc-500 font-medium">{pack.tokens} jetons IA</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black">{pack.price} FCFA</p>
          </div>
        </div>

        {/* Step 1: Choose Method */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full flex items-center justify-center text-xs font-black">1</div>
            <h2 className="font-bold">Choisissez votre moyen de paiement</h2>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* Genius Pay Buttons */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => handleGeniusPay('tmoney')}
                disabled={isLoading}
                className="p-6 rounded-3xl border-2 border-yellow-400 bg-yellow-500/5 transition-all flex flex-col items-center gap-3 hover:bg-yellow-500/10 group"
              >
                <div className="w-12 h-12 bg-yellow-400 rounded-2xl flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
                  {isLoading ? <Loader2 className="animate-spin" /> : <Smartphone />}
                </div>
                <span className="font-black text-xs uppercase tracking-widest">T-Money</span>
              </button>

              <button
                onClick={() => handleGeniusPay('flooz')}
                disabled={isLoading}
                className="p-6 rounded-3xl border-2 border-blue-500 bg-blue-500/5 transition-all flex flex-col items-center gap-3 hover:bg-blue-500/10 group"
              >
                <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
                  {isLoading ? <Loader2 className="animate-spin" /> : <Smartphone />}
                </div>
                <span className="font-black text-xs uppercase tracking-widest">Flooz</span>
              </button>
            </div>

            <button
              onClick={() => handleGeniusPay()}
              disabled={isLoading}
              className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 text-xs font-bold hover:text-blue-600 transition-colors"
            >
              Autre moyen de paiement (Visa, MasterCard, Wave...)
            </button>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-200 dark:border-zinc-800"></div></div>
              <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-zinc-50 dark:bg-[#050505] px-4 text-zinc-400 font-black tracking-widest">Problème ? Utiliser le paiement manuel</span></div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => { setMethod('TMONEY'); play('xp'); }}
                className={`p-4 rounded-2xl border transition-all flex items-center justify-center gap-2 ${method === 'TMONEY' ? 'border-yellow-400 bg-yellow-500/5' : 'border-zinc-100 dark:border-zinc-800'}`}
              >
                <span className="font-black text-[10px] uppercase tracking-widest">Manuel T-Money</span>
              </button>

              <button
                onClick={() => { setMethod('FLOOZ'); play('xp'); }}
                className={`p-4 rounded-2xl border transition-all flex items-center justify-center gap-2 ${method === 'FLOOZ' ? 'border-blue-500 bg-blue-500/5' : 'border-zinc-100 dark:border-zinc-800'}`}
              >
                <span className="font-black text-[10px] uppercase tracking-widest">Manuel Flooz</span>
              </button>
            </div>
          </div>
        </div>

        {/* Step 2: Instructions */}
        <AnimatePresence>
          {method && (
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full flex items-center justify-center text-xs font-black">2</div>
                <h2 className="font-bold">Effectuez le transfert</h2>
              </div>

              <div className="bg-zinc-900 text-white p-8 rounded-[2.5rem] space-y-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <Smartphone size={120} />
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em]">Numéro à créditer</p>
                  <div className="flex items-center gap-4">
                    <span className="text-3xl font-black tracking-tighter">
                      {method === 'TMONEY' ? TMONEY_NUMBER : FLOOZ_NUMBER}
                    </span>
                    <button
                      onClick={() => copyToClipboard(method === 'TMONEY' ? TMONEY_NUMBER : FLOOZ_NUMBER)}
                      className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all"
                    >
                      {isCopied ? <CheckCircle2 size={18} className="text-emerald-400" /> : <Copy size={18} />}
                    </button>
                  </div>
                </div>

                <div className="pt-4 flex items-start gap-3 text-xs text-zinc-400 bg-white/5 p-4 rounded-2xl border border-white/5">
                  <Info size={16} className="shrink-0 text-blue-400" />
                  <p>Veuillez vérifier le numéro avant de confirmer le transfert sur votre téléphone.</p>
                </div>
              </div>

              {/* Step 3: Proof */}
              <div className="space-y-4 pt-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full flex items-center justify-center text-xs font-black">3</div>
                  <h2 className="font-bold">Envoyez votre preuve</h2>
                </div>

                <p className="text-sm text-zinc-500 font-medium">
                  Une fois le transfert effectué, envoyez une <b>capture d&apos;écran</b> de la confirmation à l&apos;administrateur pour activer vos jetons.
                </p>

                <button
                  onClick={handleNotifyAdmin}
                  disabled={isLoading}
                  className="w-full py-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[2rem] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/20 transition-all"
                >
                  {isLoading ? <Loader2 className="animate-spin" /> : <MessageCircle size={20} />}
                  Envoyer la preuve par WhatsApp
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
