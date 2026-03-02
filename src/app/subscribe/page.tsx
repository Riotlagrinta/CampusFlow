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
    Clock
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import InteractiveTutorial from '@/components/InteractiveTutorial';

export default function SubscribePage() {
    const { data: session } = useSession();
    const [loading, setLoading] = useState(false);
    const [showTutorial, setShowTutorial] = useState(true);
    const router = useRouter();
    const PLANS = [
        {
            id: 'monthly_basic',
            name: 'Basique',
            price: '500',
            duration: '1 mois',
            features: ['Accès illimité au site', 'Assistant IA standard', 'Ressources de base'],
            icon: <Shield className="text-zinc-400" />,
            color: 'bg-zinc-500/10 text-zinc-500'
        },
        {
            id: 'quarterly_promo',
            name: 'Trimestriel',
            price: '2.000',
            duration: '3 mois',
            bonus: '+500 Jetons IA',
            features: ['Accès illimité 3 mois', '500 Jetons Bonus', 'Support prioritaire'],
            icon: <Zap className="text-blue-500" />,
            color: 'bg-blue-500/10 text-blue-600',
            recommended: true
        },
        {
            id: 'semestriel_elite',
            name: 'Semestriel Elite',
            price: '2.500',
            duration: '6 mois',
            bonus: '+1.000 Jetons IA',
            features: ['Accès tout le semestre', '1000 Jetons Bonus', 'Accès avant-première'],
            icon: <Sparkles className="text-emerald-500" />,
            color: 'bg-emerald-500/10 text-emerald-600'
        },
        {
            id: 'token_master',
            name: 'Token Master',
            price: '2.000',
            duration: '1 mois offert',
            bonus: '5.000 Jetons IA',
            features: ['5000 Jetons IA', '1 mois d\'accès offert', 'Usage intensif IA'],
            icon: <CreditCard className="text-orange-500" />,
            color: 'bg-orange-500/10 text-orange-600'
        }
    ];

    const handleSubscribe = async (packId: string) => {
        if (!session) {
            router.push("/login");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch('/api/payment/genius/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ packId })
            });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                alert(data.error || "Une erreur est survenue");
            }
        } catch (error) {
            console.error(error);
            alert("Erreur d'initialisation du paiement");
        } finally {
            setLoading(false);
        }
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

                {/* Pricing Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {PLANS.map((plan, idx) => (
                        <motion.div
                            key={plan.id}
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className={cn(
                                "glass-card p-8 bg-white dark:bg-zinc-900/50 rounded-[2.5rem] border-2 flex flex-col relative overflow-hidden transition-all hover:scale-[1.03]",
                                plan.recommended ? "border-blue-600 shadow-2xl shadow-blue-500/10" : "border-zinc-100 dark:border-zinc-800"
                            )}
                        >
                            {plan.recommended && (
                                <div className="absolute top-4 right-4 px-3 py-1 bg-blue-600 text-[9px] font-black text-white rounded-full uppercase tracking-tighter">
                                    Recommandé
                                </div>
                            )}

                            <div className="space-y-6 flex-1">
                                <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", plan.color)}>
                                    {plan.icon}
                                </div>

                                <div className="space-y-1">
                                    <h3 className="text-xl font-black tracking-tight">{plan.name}</h3>
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{plan.duration}</p>
                                </div>

                                <div className="flex items-baseline gap-1">
                                    <span className="text-4xl font-black tracking-tighter">{plan.price}</span>
                                    <span className="text-xs font-bold text-zinc-400">FCFA</span>
                                </div>

                                {plan.bonus && (
                                    <div className="px-3 py-2 bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400 rounded-xl text-[10px] font-black uppercase text-center">
                                        {plan.bonus}
                                    </div>
                                )}

                                <ul className="space-y-3 pt-4">
                                    {plan.features.map((feature, fIdx) => (
                                        <li key={fIdx} className="flex items-center gap-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                                            <CheckCircle2 size={14} className="text-blue-500 shrink-0" />
                                            {feature}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <button
                                onClick={() => handleSubscribe(plan.id)}
                                disabled={loading}
                                className={cn(
                                    "w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] mt-8 flex items-center justify-center gap-2 transition-all",
                                    plan.recommended ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                                )}
                            >
                                {loading ? <Clock size={14} className="animate-spin" /> : <>Débloquer <ArrowRight size={14} /></>}
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
