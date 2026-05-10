"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Brain, RotateCw, CheckCircle2, ArrowLeft, ArrowRight, Loader2, Trash2, Sparkles, Layers } from 'lucide-react';
import { useSound } from '@/hooks/useSound';
import { TiltCard } from '@/components/TiltCard';

type Flashcard = { id: string; question: string; answer: string; };
type FlashcardSet = { id: string; title: string; cards: Flashcard[]; _count?: { cards: number }; };

const fadeUp = (delay = 0) => ({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay, type: 'spring' as const, stiffness: 80 } });

export default function FlashcardsPage() {
  const { play } = useSound();
  const [sets, setSets] = useState<FlashcardSet[]>([]);
  const [activeSet, setActiveSet] = useState<FlashcardSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [topic, setTopic] = useState('');

  useEffect(() => { fetchSets(); }, []);

  const fetchSets = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/flashcards');
      setSets(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const generateWithIA = async () => {
    if (!topic.trim()) return;
    setIsGenerating(true);
    try {
      const res = await fetch('/api/ai/generate-flashcards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: topic })
      });
      const data = await res.json();
      if (data.cards) {
        const saveRes = await fetch('/api/flashcards', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: topic, cards: data.cards })
        });
        const newSet = await saveRes.json();
        setSets([newSet, ...sets]);
        setTopic(''); play('success');
      }
    } catch (err) { console.error(err); }
    finally { setIsGenerating(false); }
  };

  const deleteSet = async (id: string) => {
    if (!confirm('Supprimer ce jeu de cartes ?')) return;
    try {
      await fetch(`/api/flashcards/${id}`, { method: 'DELETE' });
      setSets(sets.filter(s => s.id !== id));
    } catch {}
  };

  if (activeSet) {
    const card = activeSet.cards[currentCardIdx];
    return (
      <div className="max-w-2xl mx-auto space-y-8 py-10 px-4 overflow-x-hidden">
        <motion.button
          {...fadeUp()}
          whileHover={{ x: -4 }}
          onClick={() => { setActiveSet(null); setIsFlipped(false); }}
          className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors font-bold text-sm"
        >
          <ArrowLeft size={18} /> Retour aux collections
        </motion.button>

        <motion.div {...fadeUp(0.05)} className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex items-center gap-3">
          <Sparkles size={18} className="text-blue-600 shrink-0" />
          <p className="text-[11px] font-bold text-blue-700 uppercase tracking-tight">
            Mode BETA : L&apos;interface de révision est en cours d&apos;optimisation visuelle.
          </p>
        </motion.div>

        <motion.div {...fadeUp(0.1)} className="space-y-2 text-center">
          <h1 className="text-2xl font-black">{activeSet.title}</h1>
          <p className="text-zinc-500 text-[10px] uppercase font-black tracking-[0.2em]">Carte {currentCardIdx + 1} sur {activeSet.cards.length}</p>
          {/* Progress bar */}
          <div className="h-1 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mt-2">
            <motion.div className="h-full bg-blue-600" animate={{ width: `${((currentCardIdx + 1) / activeSet.cards.length) * 100}%` }} transition={{ duration: 0.4 }} />
          </div>
        </motion.div>

        <motion.div {...fadeUp(0.15)} className="w-full space-y-4" onClick={() => { setIsFlipped(!isFlipped); play('xp'); }}>
          <motion.div
            whileHover={{ scale: 1.01 }}
            className="bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 rounded-[2.5rem] p-10 min-h-[200px] flex flex-col items-center justify-center text-center shadow-xl cursor-pointer hover:border-blue-500 transition-all"
          >
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-4">Question</span>
            <h2 className="text-xl md:text-2xl font-bold px-4">{card?.question}</h2>
            {!isFlipped && <p className="mt-8 text-zinc-400 text-[10px] uppercase font-black animate-pulse">Cliquer pour voir la réponse</p>}
          </motion.div>

          <AnimatePresence>
            {isFlipped && (
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-blue-600 rounded-[2.5rem] p-10 min-h-[150px] flex flex-col items-center justify-center text-center shadow-xl"
              >
                <span className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-4">Réponse</span>
                <h2 className="text-xl md:text-2xl font-bold text-white px-4">{card?.answer}</h2>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div {...fadeUp(0.2)} className="flex justify-between items-center pt-4">
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            disabled={currentCardIdx === 0}
            onClick={() => { setCurrentCardIdx(prev => prev - 1); setIsFlipped(false); }}
            className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-full disabled:opacity-30"
          ><ArrowLeft size={24} /></motion.button>

          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
            onClick={() => {
              if (currentCardIdx < activeSet.cards.length - 1) { setCurrentCardIdx(prev => prev + 1); setIsFlipped(false); }
              else { setActiveSet(null); play('success'); }
            }}
            className="px-8 py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl"
          >
            {currentCardIdx === activeSet.cards.length - 1 ? "Terminer" : "Suivante"}
          </motion.button>

          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            disabled={currentCardIdx === activeSet.cards.length - 1}
            onClick={() => { setCurrentCardIdx(prev => prev + 1); setIsFlipped(false); }}
            className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-full disabled:opacity-30"
          ><ArrowRight size={24} /></motion.button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-20 px-4 pt-10 overflow-x-hidden">

      {/* Ambient */}
      <motion.div className="fixed top-20 right-10 w-96 h-96 bg-blue-500/5 rounded-full blur-[150px] -z-10 pointer-events-none"
        animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 8, repeat: Infinity }} />

      <motion.div {...fadeUp()} className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 3, repeat: Infinity, delay: 1 }}>
              <Layers className="text-blue-600" />
            </motion.div>
            Mes Flashcards
          </h1>
          <p className="text-zinc-500 font-medium text-sm">Mémorisez vos cours rapidement avec l&apos;IA.</p>
        </div>
      </motion.div>

      {/* IA Generation Box */}
      <motion.div {...fadeUp(0.1)} whileHover={{ scale: 1.01 }}
        className="bg-zinc-900 rounded-[2.5rem] p-8 md:p-10 text-white shadow-2xl relative overflow-hidden"
      >
        <motion.div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 blur-[100px] -mr-32 -mt-32"
          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 5, repeat: Infinity }} />
        <div className="relative z-10 space-y-6">
          <div className="flex items-center gap-2 text-blue-400 font-black text-[10px] uppercase tracking-[0.2em]">
            <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ duration: 2, repeat: Infinity }}>
              <Sparkles size={14} />
            </motion.div>
            Génération Instantanée
          </div>
          <h2 className="text-2xl font-bold">Que voulez-vous réviser aujourd&apos;hui ?</h2>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              placeholder="Ex: Les bases de Python, La loi d'Ohm..."
              className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generateWithIA()}
            />
            <motion.button
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
              onClick={generateWithIA}
              disabled={isGenerating || !topic.trim()}
              className="px-8 py-4 bg-blue-600 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-blue-700 transition-all disabled:opacity-50"
            >
              {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              Générer par IA
            </motion.button>
          </div>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-20">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
            <Loader2 className="text-blue-600" size={32} />
          </motion.div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sets.map((set, i) => (
            <motion.div key={set.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
              <TiltCard>
                <motion.div
                  whileHover={{ y: -5, scale: 1.02 }}
                  className="group bg-white dark:bg-zinc-900 p-6 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 shadow-sm hover:shadow-xl transition-all cursor-pointer relative"
                  onClick={() => { setActiveSet(set); setCurrentCardIdx(0); }}
                >
                  <div className="flex justify-between items-start mb-6">
                    <motion.div whileHover={{ rotate: 15 }} className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center text-blue-600">
                      <Brain size={24} />
                    </motion.div>
                    <motion.button whileHover={{ scale: 1.2 }}
                      onClick={(e) => { e.stopPropagation(); deleteSet(set.id); }}
                      className="p-2 text-zinc-300 hover:text-red-500 transition-colors">
                      <Trash2 size={18} />
                    </motion.button>
                  </div>
                  <h3 className="text-lg font-black mb-2 line-clamp-1">{set.title}</h3>
                  <div className="flex items-center gap-2 text-zinc-400 text-[10px] font-bold uppercase tracking-widest">
                    <Layers size={12} /> {set.cards?.length || 0} Cartes
                  </div>
                  <div className="mt-6 pt-4 border-t border-zinc-50 dark:border-zinc-800 flex justify-between items-center">
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Réviser maintenant</span>
                    <motion.div whileHover={{ x: 4 }} className="w-8 h-8 rounded-full bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
                      <ArrowRight size={16} />
                    </motion.div>
                  </div>
                </motion.div>
              </TiltCard>
            </motion.div>
          ))}

          {sets.length === 0 && !loading && (
            <motion.div {...fadeUp(0.3)} className="col-span-full py-20 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-900 rounded-[3rem]">
              <Layers size={48} className="mx-auto mb-4 opacity-10" />
              <p className="text-zinc-400 font-medium">Vous n&apos;avez pas encore de jeux de cartes.<br/>Générez-en un avec l&apos;IA ci-dessus !</p>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
