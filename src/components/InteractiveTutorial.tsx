"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Brain,
    BookOpen,
    Users,
    Rocket,
    ArrowRight,
    X,
    Sparkles,
    ShieldCheck,
    ChevronRight,
    ChevronLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
    {
        title: "Assistant IA Surpuissant",
        description: "Accédez aux meilleurs modèles (Llama 3.3, Mixtral) pour générer vos résumés, corriger vos codes et répondre à vos questions 24h/24.",
        icon: <Brain className="text-blue-500" />,
        color: "from-blue-500/20 to-indigo-500/20",
        image: "🤖"
    },
    {
        title: "Ressources & Quiz",
        description: "Tous vos cours, exercices et anciens sujets centralisés. Testez-vous avec des quiz générés par IA pour valider vos acquis.",
        icon: <BookOpen className="text-emerald-500" />,
        color: "from-emerald-500/20 to-teal-500/20",
        image: "📚"
    },
    {
        title: "Communauté & Planning",
        description: "Ne manquez plus aucun cours. Discutez avec vos camarades sur le forum et suivez l'évolution de votre promotion en temps réel.",
        icon: <Users className="text-orange-500" />,
        color: "from-orange-500/20 to-amber-500/20",
        image: "👥"
    },
    {
        title: "L'Avenir du Hub",
        description: "Bientôt : Gestion des stages, Portefeuille numérique certifié et système de messagerie directe avec les professeurs.",
        icon: <Rocket className="text-purple-500" />,
        color: "from-purple-500/20 to-pink-500/20",
        image: "🚀"
    }
];

interface InteractiveTutorialProps {
    onComplete: () => void;
}

export default function InteractiveTutorial({ onComplete }: InteractiveTutorialProps) {
    const [currentStep, setCurrentStep] = useState(0);

    const next = () => {
        if (currentStep < STEPS.length - 1) {
            setCurrentStep(prev => prev + 1);
        } else {
            onComplete();
        }
    };

    const prev = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="w-full max-w-xl bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
            >
                <div className={cn("h-48 flex items-center justify-center text-8xl bg-gradient-to-br transition-all duration-500", STEPS[currentStep].color)}>
                    <motion.span
                        key={currentStep}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 200 }}
                    >
                        {STEPS[currentStep].image}
                    </motion.span>
                </div>

                <div className="p-8 md:p-12 space-y-8">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
                                {STEPS[currentStep].icon}
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Étape {currentStep + 1} sur {STEPS.length}</span>
                        </div>

                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentStep}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                                className="space-y-3"
                            >
                                <h2 className="text-2xl font-black tracking-tight dark:text-white">
                                    {STEPS[currentStep].title}
                                </h2>
                                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                    {STEPS[currentStep].description}
                                </p>
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* Stepper Dots */}
                    <div className="flex gap-2">
                        {STEPS.map((_, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "h-1.5 rounded-full transition-all duration-300",
                                    i === currentStep ? "w-8 bg-blue-600" : "w-1.5 bg-zinc-200 dark:bg-zinc-800"
                                )}
                            />
                        ))}
                    </div>

                    <div className="flex gap-4 pt-4">
                        {currentStep > 0 && (
                            <button
                                onClick={prev}
                                className="flex-1 py-4 px-6 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2"
                            >
                                <ChevronLeft size={16} /> Retour
                            </button>
                        )}
                        <button
                            onClick={next}
                            className="flex-[2] py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                        >
                            {currentStep === STEPS.length - 1 ? "C'est parti !" : "Suivant"} <ChevronRight size={16} />
                        </button>
                    </div>
                </div>

                <button
                    onClick={onComplete}
                    className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                >
                    <X size={20} />
                </button>
            </motion.div>
        </div>
    );
}
