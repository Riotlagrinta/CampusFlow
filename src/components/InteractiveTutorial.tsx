"use client";

import React, { useEffect, useId, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Brain,
    BookOpen,
    Users,
    Rocket,
    X,
    ChevronRight,
    ChevronLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
    {
        title: "Assistant IA Surpuissant",
        description: "Accédez à des modèles d'IA performants pour générer vos résumés, corriger vos codes et répondre à vos questions 24h/24.",
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

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface InteractiveTutorialProps {
    onComplete: () => void;
}

export default function InteractiveTutorial({ onComplete }: InteractiveTutorialProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const dialogRef = useRef<HTMLDivElement>(null);
    const nextButtonRef = useRef<HTMLButtonElement>(null);
    const onCompleteRef = useRef(onComplete);
    const titleId = useId();
    const descriptionId = useId();

    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    // Comportement de boîte de dialogue modale : focus à l'ouverture, piège à focus,
    // Échap pour fermer, page arrière-plan non défilable, focus rendu à la fermeture.
    useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        nextButtonRef.current?.focus();

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCompleteRef.current();
                return;
            }
            if (event.key !== 'Tab') return;

            const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
            if (!focusables || focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement;

            if (!dialogRef.current?.contains(active)) {
                event.preventDefault();
                first.focus();
            } else if (event.shiftKey && active === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
            previouslyFocused?.focus?.();
        };
    }, []);

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
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="relative w-full max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-2xl border border-zinc-200 dark:border-zinc-800"
            >
                <button
                    type="button"
                    onClick={onComplete}
                    aria-label="Fermer le tutoriel"
                    className="absolute top-4 right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 bg-white/60 dark:bg-zinc-900/60 transition-colors"
                >
                    <X size={20} aria-hidden="true" />
                </button>

                <div aria-hidden="true" className={cn("h-48 flex items-center justify-center text-8xl bg-gradient-to-br transition-all duration-500", STEPS[currentStep].color)}>
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
                            <div aria-hidden="true" className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
                                {STEPS[currentStep].icon}
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Étape {currentStep + 1} sur {STEPS.length}</span>
                        </div>

                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentStep}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                                className="space-y-3"
                                aria-live="polite"
                            >
                                <h2 id={titleId} className="text-2xl font-black tracking-tight dark:text-white">
                                    {STEPS[currentStep].title}
                                </h2>
                                <p id={descriptionId} className="text-sm font-medium text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                    {STEPS[currentStep].description}
                                </p>
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* Stepper Dots */}
                    <div className="flex gap-2" aria-hidden="true">
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
                                type="button"
                                onClick={prev}
                                className="flex-1 min-h-12 py-4 px-6 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2"
                            >
                                <ChevronLeft size={16} aria-hidden="true" /> Retour
                            </button>
                        )}
                        <button
                            ref={nextButtonRef}
                            type="button"
                            onClick={next}
                            className="flex-[2] min-h-12 py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                        >
                            {currentStep === STEPS.length - 1 ? "C'est parti !" : "Suivant"} <ChevronRight size={16} aria-hidden="true" />
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
