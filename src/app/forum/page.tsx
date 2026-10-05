'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Plus, Search, Tag, Clock, Loader2, Trash2, XCircle } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useSound } from '@/hooks/useSound';
import { fadeUp } from '@/lib/utils';
import Link from 'next/link';

type Question = {
  id: string; title: string; content: string; tags: string | null; createdAt: string;
  author: { id: string; firstName: string | null; lastName: string | null; level: number };
  _count: { answers: number };
};

const PAGE_SIZE = 20;
const TITLE_MAX = 150;
const CONTENT_MAX = 5000;

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return typeof data?.error === 'string' ? data.error : fallback;
  } catch {
    return fallback;
  }
}

function pageUrl(search: string, cursor?: string) {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (search.length >= 2) params.set('q', search);
  if (cursor) params.set('cursor', cursor);
  return `/api/forum/questions?${params.toString()}`;
}

export default function ForumPage() {
  const { play } = useSound();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newQuestion, setNewQuestion] = useState({ title: '', content: '', tags: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const loadSeq = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Première page (ou retour à la première page après recherche / publication).
  useEffect(() => {
    const controller = new AbortController();
    const seq = ++loadSeq.current;
    (async () => {
      try {
        const res = await fetch(pageUrl(debouncedSearch), { signal: controller.signal });
        if (!res.ok) throw new Error(await readError(res, 'Impossible de charger les discussions.'));
        const data: unknown = await res.json();
        const list = Array.isArray(data) ? (data as Question[]) : [];
        if (seq !== loadSeq.current) return;
        setQuestions(list);
        setHasMore(list.length === PAGE_SIZE);
        setLoadError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : 'Impossible de charger les discussions.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [debouncedSearch, reloadKey]);

  const loadMore = useCallback(async () => {
    const last = questions[questions.length - 1];
    if (!last || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(pageUrl(debouncedSearch, last.id));
      if (!res.ok) throw new Error(await readError(res, 'Impossible de charger la suite.'));
      const data: unknown = await res.json();
      const list = Array.isArray(data) ? (data as Question[]) : [];
      setQuestions(prev => [...prev, ...list.filter(q => !prev.some(p => p.id === q.id))]);
      setHasMore(list.length === PAGE_SIZE);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Impossible de charger la suite.');
    } finally {
      setLoadingMore(false);
    }
  }, [questions, loadingMore, debouncedSearch]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (!confirm('Supprimer cette question et ses réponses ?')) return;
    try {
      const res = await fetch(`/api/forum/questions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res, 'Suppression impossible.'));
      play('success');
      setQuestions(prev => prev.filter(q => q.id !== id));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  };

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setFormError(null);
  }, []);

  useEffect(() => {
    if (!isModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isModalOpen, closeModal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/forum/questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newQuestion),
      });
      if (!res.ok) throw new Error(await readError(res, "Impossible de publier la question."));
      closeModal();
      setNewQuestion({ title: '', content: '', tags: '' });
      setSearch('');
      setDebouncedSearch('');
      setReloadKey(k => k + 1);
      play('success');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Impossible de publier la question.');
    } finally {
      setIsSubmitting(false);
    }
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
          type="button"
          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
          onClick={() => setIsModalOpen(true)}
          className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/20 transition-all"
        >
          <Plus size={18} /> Poser une question
        </motion.button>
      </motion.div>

      {/* Search */}
      <motion.div {...fadeUp(0.1)} className="relative px-2">
        <Search className="absolute left-6 top-3.5 text-zinc-400" size={18} aria-hidden="true" />
        <input
          type="search"
          aria-label="Rechercher une discussion"
          value={search}
          onChange={e => setSearch(e.target.value)}
          maxLength={100}
          placeholder="Rechercher une discussion..."
          className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
        />
      </motion.div>

      {loadError && (
        <div role="alert" className="mx-2 flex items-center justify-between gap-3 p-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 text-sm text-red-600 dark:text-red-400">
          <span className="flex items-center gap-2"><XCircle size={16} className="shrink-0" /> {loadError}</span>
          <button type="button" onClick={() => { setLoadError(null); setLoading(true); setReloadKey(k => k + 1); }} className="shrink-0 font-bold underline">Réessayer</button>
        </div>
      )}

      {/* Questions List */}
      {loading ? (
        <div className="flex justify-center py-20" role="status" aria-label="Chargement">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
            <Loader2 className="text-blue-600" size={32} />
          </motion.div>
        </div>
      ) : questions.length === 0 ? (
        !loadError && (
          <motion.div {...fadeUp(0.2)} className="mx-2 text-center py-20 text-zinc-400 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-3xl">
            <MessageSquare size={48} className="mx-auto mb-4 opacity-50" />
            <p>{debouncedSearch.length >= 2 ? 'Aucune discussion ne correspond à votre recherche.' : 'Aucune discussion pour le moment.'}</p>
          </motion.div>
        )
      ) : (
        <div className="grid grid-cols-1 gap-3 md:gap-4 px-2">
          {questions.map((q, i) => (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.05, type: 'spring', stiffness: 80 }}
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
                        {q.tags && q.tags.split(',').map((tag, idx) => (
                          <span key={`${tag}-${idx}`} className="flex items-center gap-1 text-[9px] text-zinc-500 font-bold bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded uppercase tracking-tighter">
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
                          <div className="w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-[8px] text-zinc-500">{(q.author.firstName ?? '?').charAt(0)}</div>
                          <span className="font-bold text-zinc-600 dark:text-zinc-300 truncate max-w-[80px]">{q.author.firstName ?? 'Étudiant'}</span>
                          <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded font-black">LVL {q.author.level}</span>
                        </div>
                        <div className="flex items-center gap-1"><Clock size={10} /><span>{new Date(q.createdAt).toLocaleDateString()}</span></div>
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      {isAdmin && (
                        <motion.button type="button" aria-label="Supprimer la question" whileHover={{ scale: 1.2 }} onClick={(e) => handleDelete(e, q.id)} className="p-2 text-zinc-300 hover:text-red-500 rounded-lg transition-colors">
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

          {hasMore && (
            <button type="button" onClick={loadMore} disabled={loadingMore}
              className="mx-auto mt-2 px-6 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2 disabled:opacity-60">
              {loadingMore && <Loader2 className="animate-spin" size={16} />} Voir plus de discussions
            </button>
          )}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={closeModal} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div
              role="dialog" aria-modal="true" aria-labelledby="new-question-title"
              initial={{ opacity: 0, scale: 0.92, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 30 }} transition={{ type: 'spring', stiffness: 200, damping: 25 }}
              className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-6 border border-zinc-200 dark:border-zinc-800"
            >
              <h3 id="new-question-title" className="text-xl font-bold mb-4">Nouvelle Question</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="question-title" className="text-xs font-bold uppercase text-zinc-500">Titre</label>
                  <input id="question-title" className="w-full mt-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                    value={newQuestion.title} onChange={e => setNewQuestion({...newQuestion, title: e.target.value})}
                    placeholder="Ex: Problème connexion JDBC..." required minLength={5} maxLength={TITLE_MAX} autoFocus />
                </div>
                <div>
                  <label htmlFor="question-content" className="text-xs font-bold uppercase text-zinc-500">Détails</label>
                  <textarea id="question-content" className="w-full mt-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 h-32 resize-none"
                    value={newQuestion.content} onChange={e => setNewQuestion({...newQuestion, content: e.target.value})}
                    placeholder="Décrivez votre problème..." required minLength={10} maxLength={CONTENT_MAX} />
                </div>
                <div>
                  <label htmlFor="question-tags" className="text-xs font-bold uppercase text-zinc-500">Tags (séparés par virgule)</label>
                  <input id="question-tags" className="w-full mt-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                    value={newQuestion.tags} onChange={e => setNewQuestion({...newQuestion, tags: e.target.value})}
                    placeholder="Ex: JAVA, SQL, ERROR" maxLength={100} />
                </div>
                {formError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
                <div className="flex gap-3 pt-4">
                  <motion.button whileHover={{ scale: 1.02 }} type="button" onClick={closeModal} className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl font-bold text-zinc-600 dark:text-zinc-300">Annuler</motion.button>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={isSubmitting} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
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
