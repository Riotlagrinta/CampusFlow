"use client";

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Sparkles, ArrowRight, MessageSquare, Clock, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { redirect, useSearchParams } from 'next/navigation';
import { useSound } from '@/hooks/useSound';
import Link from 'next/link';
import { isPendingExpired } from '@/lib/paymentStatus';
import { isPaymentsEnabled } from '@/lib/payments';

interface Tx {
  id: string;
  packName: string;
  amount: number;
  tokens: number;
  status: string;
  type: string;
  createdAt?: string;
}

type View =
  | { kind: 'loading' }
  | { kind: 'unauthenticated' }
  | { kind: 'none' }
  | { kind: 'error' }
  | { kind: 'tx'; tx: Tx };

const POLL_INTERVAL_MS = 4000;
const MAX_ATTEMPTS = 8;
// Le lien de retour contient l'identifiant de transaction (UUID) ; on n'en garde que le début
// au cas où la passerelle ajouterait ses propres paramètres à l'URL.
const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function loadTransaction(txId: string | null): Promise<View> {
  const url = txId ? `/api/user/transactions?id=${encodeURIComponent(txId)}` : '/api/user/transactions?take=1';
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 401) return { kind: 'unauthenticated' };
  if (!res.ok) return { kind: 'error' };
  const data: unknown = await res.json().catch(() => null);
  if (!Array.isArray(data)) return { kind: 'error' };
  return data.length > 0 ? { kind: 'tx', tx: data[0] as Tx } : { kind: 'none' };
}

/** Demande au serveur de relire l'état du paiement chez la passerelle (le serveur seul décide). */
async function verifyOnServer(txId: string): Promise<void> {
  await fetch('/api/payment/genius/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId: txId }),
  }).catch(() => {});
}

async function fetchView(txId: string | null): Promise<View> {
  try {
    let view = await loadTransaction(txId);
    if (view.kind === 'tx' && view.tx.status === 'PENDING') {
      await verifyOnServer(view.tx.id);
      view = await loadTransaction(view.tx.id);
    }
    return view;
  } catch {
    return { kind: 'error' };
  }
}

function PaymentSuccessContent() {
  const { play } = useSound();
  const searchParams = useSearchParams();
  const txId = searchParams.get('tx')?.match(UUID_PREFIX)?.[0] ?? null;

  const [view, setView] = useState<View>({ kind: 'loading' });
  const [polling, setPolling] = useState(true);
  const [round, setRound] = useState(0);
  const soundPlayed = useRef(false);

  // Interroge le serveur jusqu'à ce que le paiement ne soit plus PENDING (ou abandon après MAX_ATTEMPTS,
  // ou si la transaction a plus de 24 h : elle est alors présentée comme expirée, sans plus attendre).
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const next = await fetchView(txId);
        if (cancelled) return;
        setView(next);
        if (next.kind !== 'tx' || next.tx.status !== 'PENDING' || isPendingExpired(next.tx.createdAt)) break;
        await sleep(POLL_INTERVAL_MS);
        if (cancelled) return;
      }
      setPolling(false);
    }
    void poll();
    return () => {
      cancelled = true;
    };
  }, [txId, round]);

  const retry = () => {
    setPolling(true);
    setRound((r) => r + 1);
  };

  const completed = view.kind === 'tx' && view.tx.status === 'COMPLETED';
  useEffect(() => {
    if (completed && !soundPlayed.current) {
      soundPlayed.current = true;
      play('success');
    }
  }, [completed, play]);

  const tx = view.kind === 'tx' ? view.tx : null;
  const failed = tx?.status === 'FAILED';
  const expired = tx?.status === 'PENDING' && isPendingExpired(tx.createdAt);
  const pending = tx !== null && !completed && !failed && !expired;
  // Pour réessayer : l'abonnement se rachète depuis /subscribe, les jetons depuis /shop.
  const retryHref = tx?.type === 'SUBSCRIPTION' ? '/subscribe' : '/shop';
  // Après connexion, on revient ici avec le même paramètre `tx`.
  const loginHref = `/login?callbackUrl=${encodeURIComponent(`/shop/success${txId ? `?tx=${txId}` : ''}`)}`;

  let title = 'Vérification du paiement';
  let message = 'Nous vérifions votre paiement auprès de votre opérateur...';
  let Icon = Loader2;
  let tone = 'bg-zinc-500 shadow-zinc-500/20';
  let spin = true;

  if (completed && tx) {
    title = 'Paiement confirmé !';
    message =
      tx.type === 'SUBSCRIPTION'
        ? `Votre abonnement est activé${tx.tokens > 0 ? ` et ${tx.tokens} jetons IA ont été crédités` : ''}.`
        : `${tx.tokens} jetons IA ont été crédités sur votre compte. Vous pouvez continuer vos recherches.`;
    Icon = CheckCircle2;
    tone = 'bg-emerald-500 shadow-emerald-500/20';
    spin = false;
  } else if (failed) {
    title = 'Paiement non abouti';
    message = "Votre paiement a été refusé ou annulé : aucun montant n'a été crédité sur votre compte. Vous pouvez réessayer.";
    Icon = XCircle;
    tone = 'bg-red-500 shadow-red-500/20';
    spin = false;
  } else if (expired) {
    title = 'Paiement expiré';
    message =
      "Ce paiement n'a pas été confirmé dans les 24 heures et a expiré. Si votre compte mobile a été débité, contactez le support avant de réessayer ; sinon, vous pouvez recommencer votre achat.";
    Icon = Clock;
    tone = 'bg-amber-500 shadow-amber-500/20';
    spin = false;
  } else if (pending) {
    title = 'Paiement en cours de confirmation';
    message = polling
      ? 'Nous attendons la confirmation de votre opérateur...'
      : "La confirmation n'est pas encore arrivée. Cela peut prendre quelques minutes : vos jetons seront crédités dès qu'elle sera reçue. Ne payez pas une seconde fois ; en cas de doute, contactez le support.";
    Icon = Clock;
    tone = 'bg-amber-500 shadow-amber-500/20';
    spin = false;
  } else if (view.kind === 'unauthenticated') {
    title = 'Connexion requise';
    message = "Connectez-vous pour voir l'état de votre paiement. Si vous avez payé depuis l'application mobile, ouvrez-la : votre solde s'y mettra à jour.";
    Icon = AlertCircle;
    tone = 'bg-amber-500 shadow-amber-500/20';
    spin = false;
  } else if (view.kind === 'none') {
    title = 'Aucun paiement trouvé';
    message = "Nous ne retrouvons aucune transaction récente sur votre compte.";
    Icon = AlertCircle;
    tone = 'bg-zinc-500 shadow-zinc-500/20';
    spin = false;
  } else if (view.kind === 'error') {
    title = 'Vérification impossible';
    message = "Impossible de vérifier votre paiement pour le moment. Réessayez dans un instant.";
    Icon = AlertCircle;
    tone = 'bg-amber-500 shadow-amber-500/20';
    spin = false;
  }

  const canRetry = !polling && (pending || view.kind === 'error');

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-8">

        {/* Animated Icon */}
        <div className="relative inline-block">
          <motion.div
            key={title}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className={`w-24 h-24 ${tone} rounded-[2rem] flex items-center justify-center text-white shadow-2xl relative z-10`}
          >
            <Icon size={48} strokeWidth={3} className={spin ? 'animate-spin' : undefined} />
          </motion.div>
          {completed && (
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.2, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 bg-emerald-500/30 blur-2xl rounded-full"
            />
          )}
        </div>

        {/* Text Content */}
        <div className="space-y-3" role="status" aria-live="polite">
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
            {title}
          </h1>
          <p className="text-zinc-500 font-medium">
            {message}
          </p>
          {pending && polling && (
            <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">Vérification en cours...</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 pt-4">
          {canRetry && (
            <button
              onClick={retry}
              className="w-full py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black text-xs uppercase tracking-widest hover:opacity-90 transition-all"
            >
              Vérifier à nouveau
            </button>
          )}

          {(failed || expired) && (
            <Link
              href={retryHref}
              className="w-full py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl hover:opacity-90 transition-all"
            >
              Réessayer le paiement <ArrowRight size={16} />
            </Link>
          )}

          {view.kind === 'unauthenticated' && (
            <Link
              href={loginHref}
              className="w-full py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl hover:opacity-90 transition-all"
            >
              Se connecter <ArrowRight size={16} />
            </Link>
          )}

          {completed && (
            <Link
              href="/ai-assistant"
              className="w-full py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl hover:opacity-90 transition-all"
            >
              <MessageSquare size={18} /> Tester l&apos;IA maintenant <ArrowRight size={16} />
            </Link>
          )}

          <Link
            href="/shop"
            className="w-full py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
          >
            Retour à la boutique
          </Link>
        </div>

        {/* XP Bonus Tip */}
        {completed && (
          <div className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-600">
            <Sparkles size={14} /> Astuce : Gagnez de l&apos;XP en posant des questions pertinentes
          </div>
        )}

      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  // Paiements désactivés (freemium) : la page n'existe pas (le proxy redirige déjà ; filet de sécurité).
  if (!isPaymentsEnabled()) redirect('/');
  return (
    <Suspense fallback={<div className="min-h-[80vh]" />}>
      <PaymentSuccessContent />
    </Suspense>
  );
}
