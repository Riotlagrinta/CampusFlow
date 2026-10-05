"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ShieldCheck,
    Zap,
    CheckCircle2,
    CreditCard,
    Smartphone,
    ArrowRight,
    Sparkles,
    Shield,
    Clock,
    AlertCircle
} from 'lucide-react';
import { redirect, useRouter } from 'next/navigation';
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import InteractiveTutorial from '@/components/InteractiveTutorial';
import { createGeniusPayment } from '@/lib/actions/payment';
import { SUBSCRIPTION_PACKS, formatDuration, formatPrice, type Pack } from '@/lib/packs';
import { isPaymentsEnabled } from '@/lib/payments';

// Présentation propre à la page. Prix, jetons et durée viennent de @/lib/packs (source unique).
const PLAN_UI: Record<string, { icon: React.ReactNode; color: string; extras: string[] }> = {
    monthly_basic: {
        icon: <Shield className="text-zinc-400" />,
        color: 'bg-zinc-500/10 text-zinc-500',
        extras: ['Assistant IA standard', 'Ressources de base']
    },
    quarterly_promo: {
        icon: <Zap className="text-blue-500" />,
        color: 'bg-blue-500/10 text-blue-600',
        extras: ['Support prioritaire']
    },
    semestriel_elite: {
        icon: <Sparkles className="text-emerald-500" />,
        color: 'bg-emerald-500/10 text-emerald-600',
        extras: ['Accès avant-première']
    },
    token_master: {
        icon: <CreditCard className="text-orange-500" />,
        color: 'bg-orange-500/10 text-orange-600',
        extras: ['Usage intensif IA']
    }
};

function planFeatures(pack: Pack): string[] {
    const features = [`Accès à la plateforme pendant ${pack.durationDays ? formatDuration(pack.durationDays) : '—'}`];
    if (pack.tokens > 0) features.push(`${formatPrice(pack.tokens)} jetons IA inclus`);
    return [...features, ...(PLAN_UI[pack.id]?.extras ?? [])];
}

function SubscribeContent() {
    const { status } = useSession();
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showTutorial, setShowTutorial] = useState(true);
    const router = useRouter();

    const handleSubscribe = async (packId: string) => {
        if (status === 'loading') return;
        if (status !== 'authenticated') {
            router.push("/login");
            return;
        }
        setLoadingId(packId);
        setError(null);
        try {
            const data = await createGeniusPayment(packId);
            if (data.url) {
                window.location.assign(data.url);
                return;
            }
            setError(data.error || "Une erreur est survenue");
        } catch (e) {
            console.error(e);
            setError("Erreur d'initialisation du paiement");
        }
        setLoadingId(null);
    };

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-[#050505] pt-24 pb-20 px-4">
            <AnimatePresence>
                {showTutorial && (
                    <InteractiveTutorial onComplete={() => setShowTutorial(false)} />
                )}
            </AnimatePresence>

            <div className="max-w-6xl mx-auto space-y-16">

                {/* Header */}
                <div className="text-center space-y-4 max-w-2xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                        className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-500/10 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-[0.2em]"
                    >
                        <ShieldCheck size={14} /> Accès Flexible
                    </motion.div>
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                        className="text-4xl md:text-6xl font-black tracking-tighter text-zinc-900 dark:text-zinc-50"
                    >
                        Choisissez votre <span className="text-blue-600">Liberté</span>.
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                        className="text-zinc-500 dark:text-zinc-400 text-sm md:text-lg font-medium"
                    >
                        Des abonnements adaptés à votre budget et à vos besoins en IA.
                    </motion.p>
                </div>

                {error && (
                    <div role="alert" className="max-w-xl mx-auto flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm font-medium">
                        <AlertCircle size={18} className="shrink-0 mt-0.5" />
                        <p>{error}</p>
                    </div>
                )}

                {/* Pricing Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {SUBSCRIPTION_PACKS.map((plan, idx) => (
                        <motion.div
                            key={plan.id}
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className={cn(
                                "glass-card p-8 bg-white dark:bg-zinc-900/50 rounded-[2.5rem] border-2 flex flex-col relative overflow-hidden transition-all hover:scale-[1.03]",
                                plan.popular ? "border-blue-600 shadow-2xl shadow-blue-500/10" : "border-zinc-100 dark:border-zinc-800"
                            )}
                        >
                            {plan.popular && (
                                <div className="absolute top-4 right-4 px-3 py-1 bg-blue-600 text-[9px] font-black text-white rounded-full uppercase tracking-tighter">
                                    Recommandé
                                </div>
                            )}

                            <div className="space-y-6 flex-1">
                                <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", PLAN_UI[plan.id]?.color)}>
                                    {PLAN_UI[plan.id]?.icon}
                                </div>

                                <div className="space-y-1">
                                    <h3 className="text-xl font-black tracking-tight">{plan.shortName}</h3>
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{plan.durationDays ? formatDuration(plan.durationDays) : ''}</p>
                                </div>

                                <div className="flex items-baseline gap-1">
                                    <span className="text-4xl font-black tracking-tighter">{formatPrice(plan.price)}</span>
                                    <span className="text-xs font-bold text-zinc-400">FCFA</span>
                                </div>

                                {plan.tokens > 0 && (
                                    <div className="px-3 py-2 bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400 rounded-xl text-[10px] font-black uppercase text-center">
                                        +{formatPrice(plan.tokens)} Jetons IA
                                    </div>
                                )}

                                <ul className="space-y-3 pt-4">
                                    {planFeatures(plan).map((feature, fIdx) => (
                                        <li key={fIdx} className="flex items-center gap-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                                            <CheckCircle2 size={14} className="text-blue-500 shrink-0" />
                                            {feature}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <button
                                onClick={() => handleSubscribe(plan.id)}
                                disabled={loadingId !== null}
                                className={cn(
                                    "w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] mt-8 flex items-center justify-center gap-2 transition-all disabled:opacity-60",
                                    plan.popular ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                                )}
                            >
                                {loadingId === plan.id ? <Clock size={14} className="animate-spin" /> : <>Débloquer <ArrowRight size={14} /></>}
                            </button>
                        </motion.div>
                    ))}
                </div>

                {/* Footer Info */}
                <div className="text-center space-y-6 pt-10">
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Paiement sécurisé via Genius Pay</p>
                    <div className="flex justify-center gap-6 opacity-30 grayscale invert dark:invert-0">
                        <Smartphone size={32} />
                        <CreditCard size={32} />
                    </div>
                    <p className="text-[10px] font-medium text-zinc-500 max-w-sm mx-auto leading-relaxed">
                        T-Money, Flooz et Cartes Bancaires acceptées. Pas d&apos;engagement caché. Accès instantané après validation.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function SubscribePage() {
    // Paiements désactivés (freemium) : la page n'existe pas. Le proxy redirige déjà vers « / » ;
    // ceci est le filet de sécurité si la page est atteinte autrement.
    if (!isPaymentsEnabled()) redirect('/');
    return <SubscribeContent />;
}
