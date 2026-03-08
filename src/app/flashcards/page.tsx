"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Brain, 
  RotateCw, 
  CheckCircle2, 
  ArrowLeft, 
  ArrowRight,
  Loader2,
  Trash2,
  Sparkles,
  Layers
} from 'lucide-react';
import { useSound } from '@/hooks/useSound';

type Flashcard = {
  id: string;
  question: string;
  answer: string;
};

type FlashcardSet = {
  id: string;
  title: string;
  cards: Flashcard[];
  _count?: { cards: number };
};

export default function FlashcardsPage() {
  const { play } = useSound();
  const [sets, setSets] = useState<FlashcardSet[]>([]);
  const [activeSet, setActiveSet] = useState<FlashcardSet | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Game State
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  
  // Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [topic, setTopic] = useState('');

  useEffect(() => {
    fetchSets();
  }, []);

  const fetchSets = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/flashcards'); // Je vais créer cette API juste après
      const data = await res.json();
      setSets(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const generateWithIA = async () => {
    if (!topic.trim()) return;
    setIsGenerating(true);
    try {
      const res = await fetch('/api/ai/generate-flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: topic })
      });
      const data = await res.json();
      
      if (data.cards) {
        // On sauvegarde automatiquement ce nouveau set
        const saveRes = await fetch('/api/flashcards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                title: topic, 
                cards: data.cards 
            })
        });
        const newSet = await saveRes.json();
        setSets([newSet, ...sets]);
        setTopic('');
        play('success');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteSet = async (id: string) => {
    if (!confirm('Supprimer ce jeu de cartes ?')) return;
    try {
      await fetch(`/api/flashcards/${id}`, { method: 'DELETE' });
      setSets(sets.filter(s => s.id !== id));
    } catch (e) {}
  };

  if (activeSet) {
    const card = activeSet.cards[currentCardIdx];
    return (
      <div className="max-w-2xl mx-auto space-y-8 py-10 px-4">
        <button onClick={() => { setActiveSet(null); setIsFlipped(false); }} className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors font-bold text-sm">
          <ArrowLeft size={18} /> Retour aux collections
        </button>

        <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex items-center gap-3">
            <Sparkles size={18} className="text-blue-600 shrink-0" />
            <p className="text-[11px] font-bold text-blue-700 uppercase tracking-tight">
                Mode BETA : L&apos;interface de révision est en cours d&apos;optimisation visuelle.
            </p>
        </div>

        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-black">{activeSet.title}</h1>
          <p className="text-zinc-500 text-[10px] uppercase font-black tracking-[0.2em]">Carte {currentCardIdx + 1} sur {activeSet.cards.length}</p>
        </div>

        {/* Flat Card Component (Plus fiable que la 3D sur tous les navigateurs) */}
        <div 
            className="w-full space-y-4"
            onClick={() => { setIsFlipped(!isFlipped); play('xp'); }}
        >
          <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 rounded-[2.5rem] p-10 min-h-[200px] flex flex-col items-center justify-center text-center shadow-xl cursor-pointer hover:border-blue-500 transition-all">
               <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-4">Question</span>
               <h2 className="text-xl md:text-2xl font-bold px-4">{card?.question}</h2>
               {!isFlipped && <p className="mt-8 text-zinc-400 text-[10px] uppercase font-black animate-pulse">Cliquer pour voir la réponse</p>}
          </div>

          <AnimatePresence>
            {isFlipped && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-blue-600 rounded-[2.5rem] p-10 min-h-[150px] flex flex-col items-center justify-center text-center shadow-xl"
              >
                <span className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-4">Réponse</span>
                <h2 className="text-xl md:text-2xl font-bold text-white px-4">{card?.answer}</h2>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex justify-between items-center pt-4">
          <button 
            disabled={currentCardIdx === 0}
            onClick={() => { setCurrentCardIdx(prev => prev - 1); setIsFlipped(false); }}
            className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-full disabled:opacity-30"
          >
            <ArrowLeft size={24} />
          </button>
          
          <button 
            onClick={() => { 
                if (currentCardIdx < activeSet.cards.length - 1) {
                    setCurrentCardIdx(prev => prev + 1);
                    setIsFlipped(false);
                } else {
                    setActiveSet(null);
                    play('success');
                }
            }}
            className="px-8 py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl"
          >
            {currentCardIdx === activeSet.cards.length - 1 ? "Terminer" : "Suivante"}
          </button>

          <button 
            disabled={currentCardIdx === activeSet.cards.length - 1}
            onClick={() => { setCurrentCardIdx(prev => prev + 1); setIsFlipped(false); }}
            className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-full disabled:opacity-30"
          >
            <ArrowRight size={24} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-20 px-4 pt-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
            <Layers className="text-blue-600" /> Mes Flashcards
          </h1>
          <p className="text-zinc-500 font-medium text-sm">Mémorisez vos cours rapidement avec l&apos;IA.</p>
        </div>
      </div>

      {/* IA Generation Box */}
      <div className="bg-zinc-900 rounded-[2.5rem] p-8 md:p-10 text-white shadow-2xl relative overflow-hidden">
        <div className="relative z-10 space-y-6">
          <div className="flex items-center gap-2 text-blue-400 font-black text-[10px] uppercase tracking-[0.2em]">
            <Sparkles size={14} /> Génération Instantanée
          </div>
          <h2 className="text-2xl font-bold">Que voulez-vous réviser aujourd&apos;hui ?</h2>
          <div className="flex flex-col md:flex-row gap-3">
            <input 
              type="text" 
              placeholder="Ex: Les bases de Python, La loi d&apos;Ohm..."
              className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
              value={topic}
              onChange={e => setTopic(e.target.value)}
            />
            <button 
              onClick={generateWithIA}
              disabled={isGenerating || !topic.trim()}
              className="px-8 py-4 bg-blue-600 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-blue-700 transition-all disabled:opacity-50"
            >
              {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              Générer par IA
            </button>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 blur-[100px] -mr-32 -mt-32" />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-600" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sets.map((set) => (
            <motion.div 
              key={set.id}
              whileHover={{ y: -5 }}
              className="group bg-white dark:bg-zinc-900 p-6 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 shadow-sm hover:shadow-xl transition-all cursor-pointer relative"
              onClick={() => { setActiveSet(set); setCurrentCardIdx(0); }}
            >
              <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center text-blue-600">
                  <Brain size={24} />
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); deleteSet(set.id); }}
                  className="p-2 text-zinc-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <h3 className="text-lg font-black mb-2 line-clamp-1">{set.title}</h3>
              <div className="flex items-center gap-2 text-zinc-400 text-[10px] font-bold uppercase tracking-widest">
                <Layers size={12} /> {set.cards?.length || 0} Cartes
              </div>
              <div className="mt-6 pt-4 border-t border-zinc-50 dark:border-zinc-800 flex justify-between items-center">
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Réviser maintenant</span>
                <div className="w-8 h-8 rounded-full bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
                  <ArrowRight size={16} />
                </div>
              </div>
            </motion.div>
          ))}
          
          {sets.length === 0 && !loading && (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-900 rounded-[3rem]">
               <Layers size={48} className="mx-auto mb-4 opacity-10" />
               <p className="text-zinc-400 font-medium">Vous n&apos;avez pas encore de jeux de cartes.<br/>Générez-en un avec l&apos;IA ci-dessus !</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
