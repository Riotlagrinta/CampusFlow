'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageSquare, 
  Plus, 
  Search, 
  Tag, 
  User, 
  Clock, 
  Loader2,
  Trash2,
} from 'lucide-react';
import { useSound } from '@/hooks/useSound';
import Link from 'next/link';

type Question = {
  id: string;
  title: string;
  content: string;
  tags: string | null;
  createdAt: string;
  author: { firstName: string; lastName: string; level: number };
  _count: { answers: number };
};

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
    e.preventDefault(); // Empêcher la navigation vers le détail
    if (!confirm('Voulez-vous vraiment supprimer cette question et ses réponses ?')) return;

    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const res = await fetch(`/api/forum/questions/${id}?email=${user.email}`, { method: 'DELETE' });
      if (res.ok) {
        play('success');
        fetchQuestions();
      }
    } catch (err) {
      console.error(err);
    }
  };


  const fetchQuestions = async () => {
    try {
      const res = await fetch('/api/forum/questions');
      if (res.ok) {
        const data = await res.json();
        setQuestions(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.title || !newQuestion.content) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/forum/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newQuestion),
      });

      if (res.ok) {
        await fetchQuestions(); // Recharger la liste
        setIsModalOpen(false);
        setNewQuestion({ title: '', content: '', tags: '' });
        play('success');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 md:space-y-8 pb-20 px-2 md:px-0">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 px-2">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Forum d&apos;Entraide</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm md:text-base">
            Posez vos questions techniques à la communauté.
          </p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/20 transition-all"
        >
          <Plus size={18} />
          <span>Poser une question</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative px-2">
        <Search className="absolute left-6 top-3.5 text-zinc-400" size={18} />
        <input 
          type="text" 
          placeholder="Rechercher une discussion..."
          className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>

      {/* Questions List */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
      ) : questions.length === 0 ? (
        <div className="mx-2 text-center py-20 text-zinc-400 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-3xl">
           <MessageSquare size={48} className="mx-auto mb-4 opacity-50" />
           <p>Aucune discussion pour le moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:gap-4 px-2">
          {questions.map((q) => (
            <Link href={`/forum/${q.id}`} key={q.id}>
              <motion.div 
                whileHover={{ scale: 1.005 }}
                className="group p-4 md:p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl cursor-pointer hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[9px] font-black uppercase rounded">
                        Question
                      </span>
                      {q.tags && q.tags.split(',').map(tag => (
                        <span key={tag} className="flex items-center gap-1 text-[9px] text-zinc-500 font-bold bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded uppercase tracking-tighter">
                          <Tag size={8} /> {tag.trim()}
                        </span>
                      ))}
                    </div>
                    <div>
                      <h3 className="text-base md:text-lg font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 transition-colors line-clamp-1">
                        {q.title}
                      </h3>
                      <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-1">
                        {q.content}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-zinc-400">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-[8px] text-zinc-500">
                          {q.author.firstName[0]}
                        </div>
                        <span className="font-bold text-zinc-600 dark:text-zinc-300 truncate max-w-[80px]">
                          {q.author.firstName}
                        </span>
                        <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded font-black">LVL {q.author.level}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock size={10} />
                        <span>{new Date(q.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-2 shrink-0">
                    {isAdmin && (
                      <button 
                        onClick={(e) => handleDelete(e, q.id)}
                        className="p-2 text-zinc-300 hover:text-red-500 rounded-lg transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    <div className="flex flex-col items-center justify-center w-10 h-10 md:w-12 md:h-12 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-100 dark:border-zinc-800">
                      <span className="text-sm md:text-base font-bold text-zinc-900 dark:text-zinc-100">{q._count.answers}</span>
                      <span className="text-[8px] uppercase text-zinc-400 font-black">Rép.</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </Link>
          ))}
        </div>
      )}

      {/* New Question Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-6 border border-zinc-200 dark:border-zinc-800"
            >
              <h3 className="text-xl font-bold mb-4">Nouvelle Question</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                   <label className="text-xs font-bold uppercase text-zinc-500">Titre</label>
                   <input 
                     className="w-full mt-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                     value={newQuestion.title}
                     onChange={e => setNewQuestion({...newQuestion, title: e.target.value})}
                     placeholder="Ex: Problème connexion JDBC..."
                     required
                   />
                </div>
                <div>
                   <label className="text-xs font-bold uppercase text-zinc-500">Détails</label>
                   <textarea 
                     className="w-full mt-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 h-32 resize-none"
                     value={newQuestion.content}
                     onChange={e => setNewQuestion({...newQuestion, content: e.target.value})}
                     placeholder="Décrivez votre problème..."
                     required
                   />
                </div>
                <div>
                   <label className="text-xs font-bold uppercase text-zinc-500">Tags (séparés par virgule)</label>
                   <input 
                     className="w-full mt-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                     value={newQuestion.tags}
                     onChange={e => setNewQuestion({...newQuestion, tags: e.target.value})}
                     placeholder="Ex: JAVA, SQL, ERROR"
                   />
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl font-bold text-zinc-600 dark:text-zinc-300">Annuler</button>
                  <button type="submit" disabled={isSubmitting} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                    {isSubmitting && <Loader2 className="animate-spin" size={16} />} Publier
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
