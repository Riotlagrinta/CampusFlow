"use client";

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { redirect, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Smartphone,
  CheckCircle2,
  MessageCircle,
  Copy,
  Info,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { useSound } from '@/hooks/useSound';
import { getPack, formatPrice, formatDuration } from '@/lib/packs';
import { createGeniusPayment } from '@/lib/actions/payment';
import { isPaymentsEnabled } from '@/lib/payments';

// --- COORDONNÉES DE PAIEMENT MANUEL ---
// Définies par variables d'environnement publiques (jamais en dur dans le code) :
// NEXT_PUBLIC_ADMIN_WHATSAPP, NEXT_PUBLIC_TMONEY_NUMBER, NEXT_PUBLIC_FLOOZ_NUMBER.
const ADMIN_WHATSAPP = (process.env.NEXT_PUBLIC_ADMIN_WHATSAPP ?? '').replace(/\D/g, '');
const TMONEY_NUMBER = (process.env.NEXT_PUBLIC_TMONEY_NUMBER ?? '').trim();
const FLOOZ_NUMBER = (process.env.NEXT_PUBLIC_FLOOZ_NUMBER ?? '').trim();

type ManualMethod = 'TMONEY' | 'FLOOZ';

const MANUAL_METHODS: { id: ManualMethod; label: string; number: string }[] = [
  { id: 'TMONEY' as const, label: 'Manuel T-Money', number: TMONEY_NUMBER },
  { id: 'FLOOZ' as const, label: 'Manuel Flooz', number: FLOOZ_NUMBER },
].filter((m) => m.number);

function CheckoutContent() {
  const { status } = useSession();
  const router = useRouter();
  const { play } = useSound();
  const searchParams = useSearchParams();
  const pack = getPack(searchParams.get('packId'));

  const [method, setMethod] = useState<ManualMethod | null>(null);
  const [phone, setPhone] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentReference, setSentReference] = useState<string | null>(null);

  const backHref = pack?.type === 'SUBSCRIPTION' ? '/subscribe' : '/shop';
  const selectedNumber = MANUAL_METHODS.find((m) => m.id === method)?.number ?? '';

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setIsCopied(true);
    play('xp');
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleGeniusPay = async () => {
    if (!pack) return;
    if (status === 'loading') return;
    if (status !== 'authenticated') {
      router.push('/login');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await createGeniusPayment(pack.id);
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      setError(data.error || "Erreur lors de l'initialisation du paiement.");
    } catch (e) {
      console.error(e);
      setError("Erreur de connexion au serveur de paiement.");
    }
    setIsLoading(false);
  };

  const whatsappLink = (reference: string | null) => {
    if (!pack || !method || !ADMIN_WHATSAPP) return null;
    const message = `Bonjour Admin ! Je viens d'effectuer un transfert de ${pack.price} FCFA par ${method} pour le ${pack.name}.${reference ? ` Référence : ${reference}.` : ''} Voici ma preuve de paiement (capture d'écran) :`;
    return `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(message)}`;
  };

  const handleNotifyAdmin = async () => {
    if (!pack || !method) return;
    if (status === 'loading') return;
    if (status !== 'authenticated') {
      router.push('/login');
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      // 1. Enregistrer la demande en base (l'administrateur la validera)
      const res = await fetch('/api/payment/manual-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: pack.id, method, ...(phone.trim() ? { phone: phone.trim() } : {}) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Impossible d'enregistrer votre demande. Réessayez.");
        setIsLoading(false);
        return;
      }

      const reference: string | null = typeof data?.reference === 'string' ? data.reference : null;
      setSentReference(reference);
      play('xp');

      // 2. Ouvrir WhatsApp (un lien reste affiché si le navigateur bloque l'ouverture)
      const url = whatsappLink(reference);
      if (url) window.open(url, '_blank');
    } catch (e) {
      console.error(e);
      setError('Connexion impossible. Vérifiez votre réseau et réessayez.');
    }
    setIsLoading(false);
  };

  if (!pack) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-[#050505] pt-10 pb-20 px-4 text-zinc-900 dark:text-white">
        <div className="max-w-2xl mx-auto space-y-6 text-center pt-20">
          <AlertCircle className="mx-auto text-amber-500" size={40} />
          <h1 className="text-2xl font-black tracking-tight">Offre introuvable</h1>
          <p className="text-zinc-500 font-medium">Cette offre n&apos;existe pas ou n&apos;est plus disponible.</p>
          <Link href="/shop" className="inline-block px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black text-xs uppercase tracking-widest">
            Retour à la boutique
          </Link>
        </div>
      </div>
    );
  }

  const whatsappHref = whatsappLink(sentReference);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#050505] pt-10 pb-20 px-4 text-zinc-900 dark:text-white">
      <div className="max-w-2xl mx-auto space-y-8">

        <Link
          href={backHref}
          className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors font-bold text-sm"
        >
          <ArrowLeft size={18} /> {backHref === '/subscribe' ? 'Retour aux abonnements' : 'Retour à la boutique'}
        </Link>

        <div className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight">Finaliser votre achat</h1>
          <p className="text-zinc-500 font-medium">Suivez les instructions pour activer votre offre.</p>
        </div>

        {/* Recap Pack */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Pack sélectionné</p>
            <h3 className="text-xl font-bold">{pack.name}</h3>
            <p className="text-sm text-zinc-500 font-medium">
              {pack.durationDays ? `${formatDuration(pack.durationDays)} d'accès` : null}
              {pack.durationDays && pack.tokens > 0 ? ' + ' : null}
              {pack.tokens > 0 ? `${formatPrice(pack.tokens)} jetons IA` : null}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black">{formatPrice(pack.price)} FCFA</p>
          </div>
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm font-medium">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {/* Step 1: Choose Method */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full flex items-center justify-center text-xs font-black">1</div>
            <h2 className="font-bold">Choisissez votre moyen de paiement</h2>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <button
              onClick={handleGeniusPay}
              disabled={isLoading}
              className="p-6 rounded-3xl border-2 border-blue-500 bg-blue-500/5 transition-all flex items-center gap-4 hover:bg-blue-500/10 group disabled:opacity-60"
            >
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
                {isLoading ? <Loader2 className="animate-spin" /> : <Smartphone />}
              </div>
              <div className="text-left">
                <p className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Recommandé</p>
                <p className="font-black text-sm">Payer en ligne</p>
                <p className="text-xs text-zinc-500 font-medium">T-Money, Flooz, Visa, MasterCard, Wave...</p>
              </div>
            </button>

            {MANUAL_METHODS.length > 0 && (
              <>
                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-200 dark:border-zinc-800"></div></div>
                  <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-zinc-50 dark:bg-[#050505] px-4 text-zinc-400 font-black tracking-widest">Problème ? Utiliser le paiement manuel</span></div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {MANUAL_METHODS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setMethod(m.id); setSentReference(null); play('xp'); }}
                      className={`p-4 rounded-2xl border transition-all flex items-center justify-center gap-2 ${method === m.id
                        ? (m.id === 'TMONEY' ? 'border-yellow-400 bg-yellow-500/5' : 'border-blue-500 bg-blue-500/5')
                        : 'border-zinc-100 dark:border-zinc-800'}`}
                    >
                      <span className="font-black text-[10px] uppercase tracking-widest">{m.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Step 2: Instructions */}
        <AnimatePresence>
          {method && selectedNumber && (
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full flex items-center justify-center text-xs font-black">2</div>
                <h2 className="font-bold">Effectuez le transfert de {formatPrice(pack.price)} FCFA</h2>
              </div>

              <div className="bg-zinc-900 text-white p-8 rounded-[2.5rem] space-y-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <Smartphone size={120} />
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em]">Numéro à créditer</p>
                  <div className="flex items-center gap-4">
                    <span className="text-3xl font-black tracking-tighter">
                      {selectedNumber}
                    </span>
                    <button
                      onClick={() => copyToClipboard(selectedNumber)}
                      aria-label="Copier le numéro"
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
                  {ADMIN_WHATSAPP
                    ? <>Une fois le transfert effectué, enregistrez votre demande puis envoyez une <b>capture d&apos;écran</b> de la confirmation à l&apos;administrateur pour activer votre offre.</>
                    : <>Une fois le transfert effectué, enregistrez votre demande : l&apos;administrateur la validera après vérification de votre paiement.</>}
                </p>

                <div className="space-y-2">
                  <label htmlFor="transfer-phone" className="text-xs font-bold text-zinc-500">
                    Numéro utilisé pour le transfert (facultatif)
                  </label>
                  <input
                    id="transfer-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={16}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+228 90 00 00 00"
                    className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm font-medium outline-none focus:border-emerald-500"
                  />
                </div>

                {sentReference ? (
                  <div role="status" className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-sm font-medium space-y-3">
                    <p className="flex items-start gap-2"><CheckCircle2 size={18} className="shrink-0 mt-0.5" /> Demande enregistrée. Elle sera validée dès que l&apos;administrateur aura vérifié votre paiement.</p>
                    {whatsappHref && (
                      <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 font-black text-xs uppercase tracking-widest underline">
                        <MessageCircle size={16} /> Envoyer la preuve par WhatsApp
                      </a>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={handleNotifyAdmin}
                    disabled={isLoading}
                    className="w-full py-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[2rem] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/20 transition-all disabled:opacity-60"
                  >
                    {isLoading ? <Loader2 className="animate-spin" /> : <MessageCircle size={20} />}
                    {ADMIN_WHATSAPP ? 'Enregistrer et envoyer la preuve par WhatsApp' : "J'ai effectué le transfert"}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}

export default function CheckoutPage() {
  // Paiements désactivés (freemium) : la page n'existe pas (le proxy redirige déjà ; filet de sécurité).
  if (!isPaymentsEnabled()) redirect('/');
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-50 dark:bg-[#050505]" />}>
      <CheckoutContent />
    </Suspense>
  );
}
