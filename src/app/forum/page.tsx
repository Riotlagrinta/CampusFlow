'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Plus, Search, Tag, User, Clock, Loader2, Trash2 } from 'lucide-react';
import { useSound } from '@/hooks/useSound';
import Link from 'next/link';

type Question = {
  id: string; title: string; content: string; tags: string | null; createdAt: string;
  author: { firstName: string; lastName: string; level: number };
  _count: { answers: number };
};

const fadeUp = (delay = 0) => ({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay, type: 'spring' as const, stiffness: 80 } });

export default function ForumPage() {
  const { play } = useSound();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [newQuestion, setNewQuestion] = useState({ title: '', content: '', tags: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchQuestions();
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setIsAdmin(user.role === 'ADMIN');
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (!confirm('Supprimer cette question et ses réponses ?')) return;
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const res = await fetch(`/api/forum/questions/${id}?email=${user.email}`, { method: 'DELETE' });
      if (res.ok) { play('success'); fetchQuestions(); }
    } catch (err) { console.error(err); }
  };

  const fetchQuestions = async () => {
    try {
      const res = await fetch('/api/forum/questions');
      if (res.ok) setQuestions(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.title || !newQuestion.content) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/forum/questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newQuestion),
      });
      if (res.ok) {
        await fetchQuestions();
        setIsModalOpen(false);
        setNewQuestion({ title: '', content: '', tags: '' });
        play('success');
      }
    } catch (error) { console.error(error); }
    finally { setIsSubmitting(false); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 md:space-y-8 pb-20 px-2 md:px-0 overflow-x-hidden">

      {/* Ambient blob */}
      <motion.div className="fixed top-20 left-1/2 w-96 h-96 bg-blue-500/5 rounded-full blur-[150px] -z-10 pointer-events-none"
        animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 9, repeat: Infinity }} />

      {/* Header */}
      <motion.div {...fadeUp()} className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 px-2">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Forum d&apos;Entraide</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm md:text-base">Posez vos questions techniques à la communauté.</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
          onClick={() => setIsModalOpen(true)}
          className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/20 transition-all"
        >
          <Plus size={18} /> Poser une question
        </motion.button>
      </motion.div>

      {/* Search */}
      <motion.div {...fadeUp(0.1)} className="relative px-2">
        <Search className="absolute left-6 top-3.5 text-zinc-400" size={18} />
        <input
          type="text"
          placeholder="Rechercher une discussion..."
          className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
        />
      </motion.div>

      {/* Questions List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
            <Loader2 className="text-blue-600" size={32} />
          </motion.div>
        </div>
      ) : questions.length === 0 ? (
        <motion.div {...fadeUp(0.2)} className="mx-2 text-center py-20 text-zinc-400 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-3xl">
          <MessageSquare size={48} className="mx-auto mb-4 opacity-50" />
          <p>Aucune discussion pour le moment.</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:gap-4 px-2">
          {questions.map((q, i) => (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, type: 'spring', stiffness: 80 }}
            >
              <Link href={`/forum/${q.id}`}>
                <motion.div
                  whileHover={{ x: 4, scale: 1.005 }}
                  className="group p-4 md:p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl cursor-pointer hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-3 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[9px] font-black uppercase rounded">Question</span>
                        {q.tags && q.tags.split(',').map(tag => (
                          <span key={tag} className="flex items-center gap-1 text-[9px] text-zinc-500 font-bold bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded uppercase tracking-tighter">
                            <Tag size={8} /> {tag.trim()}
                          </span>
                        ))}
                      </div>
                      <div>
                        <h3 className="text-base md:text-lg font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 transition-colors line-clamp-1">{q.title}</h3>
                        <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-1">{q.content}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-zinc-400">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-[8px] text-zinc-500">{q.author.firstName[0]}</div>
                          <span className="font-bold text-zinc-600 dark:text-zinc-300 truncate max-w-[80px]">{q.author.firstName}</span>
                          <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded font-black">LVL {q.author.level}</span>
                        </div>
                        <div className="flex items-center gap-1"><Clock size={10} /><span>{new Date(q.createdAt).toLocaleDateString()}</span></div>
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      {isAdmin && (
                        <motion.button whileHover={{ scale: 1.2 }} onClick={(e) => handleDelete(e, q.id)} className="p-2 text-zinc-300 hover:text-red-500 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </motion.button>
                      )}
                      <div className="flex flex-col items-center justify-center w-10 h-10 md:w-12 md:h-12 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-100 dark:border-zinc-800">
                        <span className="text-sm md:text-base font-bold">{q._count.answers}</span>
                        <span className="text-[8px] uppercase text-zinc-400 font-black">Rép.</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 30 }} transition={{ type: 'spring', stiffness: 200, damping: 25 }}
              className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-6 border border-zinc-200 dark:border-zinc-800"
            >
              <h3 className="text-xl font-bold mb-4">Nouvelle Question</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase text-zinc-500">Titre</label>
                  <input className="w-full mt-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                    value={newQuestion.title} onChange={e => setNewQuestion({...newQuestion, title: e.target.value})}
                    placeholder="Ex: Problème connexion JDBC..." required />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-zinc-500">Détails</label>
                  <textarea className="w-full mt-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 h-32 resize-none"
                    value={newQuestion.content} onChange={e => setNewQuestion({...newQuestion, content: e.target.value})}
                    placeholder="Décrivez votre problème..." required />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-zinc-500">Tags (séparés par virgule)</label>
                  <input className="w-full mt-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                    value={newQuestion.tags} onChange={e => setNewQuestion({...newQuestion, tags: e.target.value})}
                    placeholder="Ex: JAVA, SQL, ERROR" />
                </div>
                <div className="flex gap-3 pt-4">
                  <motion.button whileHover={{ scale: 1.02 }} type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl font-bold text-zinc-600 dark:text-zinc-300">Annuler</motion.button>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={isSubmitting} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                    {isSubmitting && <Loader2 className="animate-spin" size={16} />} Publier
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
